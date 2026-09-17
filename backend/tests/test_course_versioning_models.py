import importlib.util
import uuid
import warnings
from pathlib import Path

import pytest
from sqlalchemy import CheckConstraint, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.exc import SAWarning
from sqlalchemy.orm import configure_mappers

from app.models import models


Base = models.Base
KnowledgeBase = models.KnowledgeBase


MIGRATION_PATH = (
    Path(__file__).parents[1]
    / "app/db/migrations/versions/b4c5d6e7f8a9_add_course_versioning.py"
)


def _check_sql(table_name: str) -> str:
    table = Base.metadata.tables[table_name]
    return " ".join(
        constraint.sqltext.text
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    )


def _unique_column_sets(table_name: str) -> set[tuple[str, ...]]:
    table = Base.metadata.tables[table_name]
    return {
        tuple(column.name for column in constraint.columns)
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
    }


def _foreign_key_specs(table_name: str) -> dict[tuple[str, ...], tuple[tuple[str, ...], bool, str | None]]:
    table = Base.metadata.tables[table_name]
    return {
        tuple(element.parent.name for element in constraint.elements): (
            tuple(element.target_fullname for element in constraint.elements),
            bool(constraint.deferrable),
            constraint.initially,
        )
        for constraint in table.constraints
        if isinstance(constraint, ForeignKeyConstraint)
    }


def _index_column_sets(table_name: str) -> set[tuple[str, ...]]:
    return {
        tuple(column.name for column in index.columns)
        for index in Base.metadata.tables[table_name].indexes
    }


def test_creator_is_a_role_without_changing_admin_roles():
    assert models.USER_ROLES == frozenset({"learner", "creator", "admin", "super_admin"})


def test_course_and_version_metadata_capture_lifecycle_and_ownership():
    Course = models.Course
    CourseVersion = models.CourseVersion
    CourseChapter = models.CourseChapter
    assert Course.__tablename__ == "courses"
    assert CourseVersion.__tablename__ == "course_versions"
    assert CourseChapter.__tablename__ == "course_chapters"
    assert {"author_id", "current_version_id", "legacy_path_id"} <= set(Course.__table__.c.keys())
    assert {"outline", "source_type", "created_by"} <= set(CourseVersion.__table__.c.keys())
    assert {"legacy_chapter_id", "content"} <= set(CourseChapter.__table__.c.keys())
    assert ("course_id", "version_number") in _unique_column_sets("course_versions")
    assert ("version_id", "sort_order") in _unique_column_sets("course_chapters")

    course_checks = _check_sql("courses")
    assert all(
        value in course_checks
        for value in (
            "draft",
            "pending_review",
            "rejected",
            "published",
            "archived",
            "private",
        )
    )
    version_checks = _check_sql("course_versions")
    assert "ai_generated" in version_checks
    assert "knowledge_base" in version_checks


def test_enrollment_and_progress_are_uniquely_scoped():
    Enrollment = models.Enrollment
    ChapterProgress = models.ChapterProgress
    assert Enrollment.__tablename__ == "enrollments"
    assert ChapterProgress.__tablename__ == "chapter_progress"
    assert ("user_id", "course_id") in _unique_column_sets("enrollments")
    assert ("enrollment_id", "chapter_id") in _unique_column_sets("chapter_progress")
    assert Enrollment.__table__.c.active_version_id.nullable is False
    assert "completed" in _check_sql("chapter_progress")


def test_current_version_is_constrained_to_its_course():
    assert ("course_id", "id") in _unique_column_sets("course_versions")
    targets, deferrable, initially = _foreign_key_specs("courses")[("id", "current_version_id")]
    assert targets == ("course_versions.course_id", "course_versions.id")
    assert deferrable
    assert initially == "DEFERRED"


def test_enrollment_active_version_is_constrained_to_its_course():
    assert ("id", "active_version_id") in _unique_column_sets("enrollments")
    targets, deferrable, initially = _foreign_key_specs("enrollments")[
        ("course_id", "active_version_id")
    ]
    assert targets == ("course_versions.course_id", "course_versions.id")
    assert deferrable
    assert initially == "DEFERRED"


def test_progress_chapter_is_constrained_to_enrollment_active_version():
    assert "version_id" in models.ChapterProgress.__table__.c
    assert ("version_id", "id") in _unique_column_sets("course_chapters")

    progress_fks = _foreign_key_specs("chapter_progress")
    enrollment_targets, enrollment_deferrable, enrollment_initially = progress_fks[
        ("enrollment_id", "version_id")
    ]
    assert enrollment_targets == ("enrollments.id", "enrollments.active_version_id")
    assert enrollment_deferrable
    assert enrollment_initially == "DEFERRED"

    chapter_targets, chapter_deferrable, chapter_initially = progress_fks[
        ("version_id", "chapter_id")
    ]
    assert chapter_targets == ("course_chapters.version_id", "course_chapters.id")
    assert chapter_deferrable
    assert chapter_initially == "DEFERRED"


def test_progress_is_created_through_validated_domain_api():
    version_id = uuid.uuid4()
    enrollment = models.Enrollment(
        user_id=uuid.uuid4(),
        course_id=uuid.uuid4(),
        active_version_id=version_id,
    )
    chapter = models.CourseChapter(
        version_id=version_id,
        sort_order=1,
        title="Chapter",
    )

    progress = models.ChapterProgress.for_enrollment(
        enrollment=enrollment,
        chapter=chapter,
        status="in_progress",
    )

    assert progress.enrollment is enrollment
    assert progress.chapter is chapter
    assert progress.version_id == version_id
    assert progress.status == "in_progress"
    assert models.Enrollment.chapter_progress.property.viewonly
    assert models.CourseChapter.progress.property.viewonly


def test_progress_domain_api_rejects_chapter_from_another_version():
    enrollment = models.Enrollment(
        user_id=uuid.uuid4(),
        course_id=uuid.uuid4(),
        active_version_id=uuid.uuid4(),
    )
    chapter = models.CourseChapter(
        version_id=uuid.uuid4(),
        sort_order=1,
        title="Wrong version",
    )

    with pytest.raises(ValueError, match="active course version"):
        models.ChapterProgress.for_enrollment(
            enrollment=enrollment,
            chapter=chapter,
        )


def test_progress_domain_api_synchronizes_a_shared_transient_version():
    course_id = uuid.uuid4()
    version = models.CourseVersion(
        course_id=course_id,
        version_number=1,
        created_by=uuid.uuid4(),
    )
    enrollment = models.Enrollment(
        user_id=uuid.uuid4(),
        course_id=course_id,
        active_version=version,
    )
    chapter = models.CourseChapter(
        version=version,
        sort_order=1,
        title="Transient chapter",
    )

    progress = models.ChapterProgress.for_enrollment(
        enrollment=enrollment,
        chapter=chapter,
    )

    assert version.id is not None
    assert enrollment.active_version_id == version.id
    assert chapter.version_id == version.id
    assert progress.version_id == version.id


def test_composite_constraints_do_not_duplicate_leading_column_indexes():
    assert ("course_id",) not in _index_column_sets("course_versions")
    assert ("version_id",) not in _index_column_sets("course_chapters")
    assert ("user_id",) not in _index_column_sets("enrollments")
    assert ("enrollment_id",) not in _index_column_sets("chapter_progress")


def test_knowledge_base_permissions_default_to_existing_public_behavior():
    assert KnowledgeBase.__table__.c.visibility.default.arg == "platform_public"
    assert KnowledgeBase.__table__.c.approval_status.default.arg == "approved"
    checks = _check_sql("knowledge_bases")
    assert all(value in checks for value in ("platform_public", "private", "pending", "approved", "rejected"))


def test_all_model_relationships_configure_without_ambiguous_foreign_keys():
    with warnings.catch_warnings():
        warnings.simplefilter("error", SAWarning)
        configure_mappers()


def test_course_migration_is_based_on_current_head_and_preserves_legacy_data():
    spec = importlib.util.spec_from_file_location("course_versioning_migration", MIGRATION_PATH)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    assert migration.down_revision == "a3b4c5d6e7f8"
    source = MIGRATION_PATH.read_text()
    assert 'INSERT INTO courses' in source
    assert 'FROM learning_paths' in source
    assert 'INSERT INTO course_versions' in source
    assert 'INSERT INTO course_chapters' in source
    assert 'INSERT INTO enrollments' in source
    assert 'INSERT INTO chapter_progress' in source
    assert 'INSERT INTO course_version_knowledge_bases' in source
    assert "DROP TABLE LEARNING_PATHS" not in source.upper()
    assert "DROP TABLE CHAPTERS" not in source.upper()
