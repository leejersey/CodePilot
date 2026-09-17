import importlib.util
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import ForeignKeyConstraint

from app.api.v1 import courses, jobs, knowledge, progress as progress_api
from app.models import models
from app.schemas.schemas import CourseGenerateRequest
from app.services import background_jobs
from app.services import course_generation
from app.services.course_generation import (
    can_manage_knowledge_base,
    is_selectable_knowledge_base,
    migrate_progress_by_title,
    normalize_chapter_title,
    require_course_job_actor,
    validate_rebuild_permission,
)
from app.worker import WorkerSettings, course_generate_job, course_rebuild_job


@pytest.fixture
def anyio_backend():
    return "asyncio"


def actor(role: str):
    return SimpleNamespace(id=uuid.uuid4(), role=role, auth_provider="email")


def kb(owner_id, *, visibility="private", approval_status="approved"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        user_id=owner_id,
        visibility=visibility,
        approval_status=approval_status,
        status="active",
    )


@pytest.mark.parametrize(
    "payload",
    [
        {"topic": "Async Python", "pure_ai": True, "knowledge_base_ids": [uuid.uuid4()]},
        {"topic": "Async Python", "pure_ai": False, "knowledge_base_ids": []},
    ],
)
def test_course_source_choice_must_be_explicit_and_consistent(payload):
    with pytest.raises(ValidationError):
        CourseGenerateRequest.model_validate(payload)


def test_course_source_choice_accepts_pure_ai_or_nonempty_kbs():
    pure = CourseGenerateRequest(topic="Async Python", pure_ai=True)
    rag = CourseGenerateRequest(
        topic="Async Python",
        pure_ai=False,
        knowledge_base_ids=[uuid.uuid4()],
    )
    assert pure.knowledge_base_ids == []
    assert len(rag.knowledge_base_ids) == 1


def test_knowledge_base_authorization_matrix():
    creator = actor("creator")
    other = actor("creator")
    admin = actor("admin")
    own = kb(creator.id)
    foreign = kb(other.id)
    platform = kb(other.id, visibility="platform_public")
    pending_own = kb(creator.id, approval_status="pending")

    assert can_manage_knowledge_base(own, creator)
    assert not can_manage_knowledge_base(foreign, creator)
    assert not can_manage_knowledge_base(platform, creator)
    assert can_manage_knowledge_base(foreign, admin)

    assert is_selectable_knowledge_base(own, creator)
    assert not is_selectable_knowledge_base(foreign, creator)
    assert is_selectable_knowledge_base(platform, creator)
    assert is_selectable_knowledge_base(pending_own, creator)


def test_owner_keeps_managing_own_knowledge_base_after_platform_approval():
    """审核通过转为平台公开后，作者仍须能管理自己的知识库。"""
    creator = actor("creator")
    approved_public_own = kb(creator.id, visibility="platform_public")

    assert can_manage_knowledge_base(approved_public_own, creator)


def test_creator_can_use_own_unapproved_knowledge_base_for_private_course():
    """自有私有库无需管理员先行审批即可用于自己的私有课程。"""
    creator = actor("creator")
    other = actor("creator")

    assert is_selectable_knowledge_base(kb(creator.id, approval_status="pending"), creator)
    assert is_selectable_knowledge_base(kb(creator.id, approval_status="rejected"), creator)
    assert not is_selectable_knowledge_base(
        kb(creator.id, approval_status="pending", visibility="private"), other
    )
    assert not is_selectable_knowledge_base(
        kb(other.id, visibility="platform_public", approval_status="pending"), creator
    )


@pytest.mark.anyio
async def test_selectable_listing_shows_own_pending_base_but_hides_others_unapproved():
    """选择器须与 is_selectable_knowledge_base 一致：自有库始终可选。"""
    creator = actor("creator")
    other = actor("creator")

    def row(owner_id, name, *, visibility="private", approval_status="approved"):
        now = datetime.now(timezone.utc)
        return SimpleNamespace(
            id=uuid.uuid4(),
            user_id=owner_id,
            name=name,
            description=None,
            status="active",
            visibility=visibility,
            approval_status=approval_status,
            review_note=None,
            created_at=now,
            updated_at=now,
        )

    candidates = [
        row(creator.id, "own-pending", approval_status="pending"),
        row(creator.id, "own-approved"),
        row(other.id, "shared-approved", visibility="platform_public"),
        row(other.id, "shared-pending", visibility="platform_public", approval_status="pending"),
        row(other.id, "foreign-private"),
    ]

    class Db:
        async def execute(self, query):
            return SimpleNamespace(all=lambda: [(item, 3) for item in candidates])

    listed = await knowledge.list_selectable_knowledge_bases(db=Db(), user=creator)
    assert {item.name for item in listed} == {
        "own-pending",
        "own-approved",
        "shared-approved",
    }


def test_platform_public_base_can_only_be_deleted_by_admin():
    creator = actor("creator")
    shared = kb(creator.id, visibility="platform_public")

    assert not course_generation.can_delete_knowledge_base(shared, creator)
    assert course_generation.can_delete_knowledge_base(shared, actor("admin"))
    assert course_generation.can_delete_knowledge_base(kb(creator.id), creator)


def test_course_jobs_are_registered_for_enqueue_recovery_and_worker():
    assert background_jobs.FUNCTION_BY_TYPE["course_generate"] == "course_generate_job"
    assert background_jobs.FUNCTION_BY_TYPE["course_rebuild"] == "course_rebuild_job"
    assert course_generate_job in WorkerSettings.functions
    assert course_rebuild_job in WorkerSettings.functions


@pytest.mark.anyio
async def test_admin_course_jobs_are_platform_wide_but_creator_jobs_are_owned():
    class Db:
        def __init__(self):
            self.queries = []

        async def execute(self, query):
            self.queries.append(query)
            return SimpleNamespace(
                scalars=lambda: SimpleNamespace(all=lambda: [])
            )

    admin_db = Db()
    await jobs.list_course_jobs(limit=100, db=admin_db, user=actor("admin"))
    admin_sql = str(admin_db.queries[0])
    assert "background_jobs.job_type IN" in admin_sql
    assert "background_jobs.user_id =" not in admin_sql

    creator_db = Db()
    creator = actor("creator")
    await jobs.list_course_jobs(limit=100, db=creator_db, user=creator)
    creator_sql = str(creator_db.queries[0])
    assert "background_jobs.user_id =" in creator_sql
    assert str(creator.id) not in creator_sql


def test_published_rebuild_requires_admin_without_changing_publication():
    creator = actor("creator")
    published = SimpleNamespace(
        author_id=creator.id,
        status="published",
        visibility="published",
    )
    with pytest.raises(HTTPException, match="联系管理员|创建修订"):
        validate_rebuild_permission(published, creator)
    assert published.status == "published"
    assert published.visibility == "published"
    validate_rebuild_permission(published, actor("admin"))


def test_creator_can_rebuild_only_owned_draft_or_rejected_course():
    creator = actor("creator")
    for status in ("draft", "rejected"):
        validate_rebuild_permission(
            SimpleNamespace(author_id=creator.id, status=status),
            creator,
        )
    with pytest.raises(HTTPException) as pending:
        validate_rebuild_permission(
            SimpleNamespace(author_id=creator.id, status="pending_review"),
            creator,
        )
    assert pending.value.status_code == 409


def test_downgraded_job_actor_cannot_run_course_jobs():
    downgraded = actor("learner")
    with pytest.raises(PermissionError, match="创作者"):
        require_course_job_actor(downgraded)


@pytest.mark.anyio
async def test_downgraded_actor_cannot_retry_or_run_generation(monkeypatch):
    downgraded = actor("learner")
    job = SimpleNamespace(job_type="course_generate", payload={})
    with pytest.raises(HTTPException) as retry_error:
        await jobs._authorize_retry(SimpleNamespace(), downgraded, job)
    assert retry_error.value.status_code == 403

    async def should_not_generate(*_args):
        raise AssertionError("generation reached after role downgrade")

    monkeypatch.setattr(
        course_generation,
        "_generate_outline_for_request",
        should_not_generate,
    )
    with pytest.raises(PermissionError, match="创作者"):
        await course_generation.generate_course_record(
            RecordingDb(),
            {
                "topic": "Async Python",
                "pure_ai": True,
                "knowledge_base_ids": [],
            },
            downgraded,
        )


def test_normalized_title_progress_migration_is_exact_not_percentage_based():
    completed_at = datetime.now(timezone.utc)
    old = [
        SimpleNamespace(title="  Python: Async / Await! ", status="completed", completed_at=completed_at),
        SimpleNamespace(title="Queues", status="in_progress", completed_at=None),
    ]
    new = [
        SimpleNamespace(id=uuid.uuid4(), title="python async await"),
        SimpleNamespace(id=uuid.uuid4(), title="New Material"),
        SimpleNamespace(id=uuid.uuid4(), title="QUEUES"),
    ]

    migrated = migrate_progress_by_title(old, new)

    assert normalize_chapter_title(old[0].title) == normalize_chapter_title(new[0].title)
    assert [(item.status, item.completed_at) for item in migrated] == [
        ("completed", completed_at),
        ("unlocked", None),
        ("in_progress", None),
    ]


def test_unmatched_first_new_chapter_is_unlocked_and_remaining_are_locked():
    migrated = migrate_progress_by_title(
        [SimpleNamespace(title="Removed", status="completed", completed_at=None)],
        [
            SimpleNamespace(id=uuid.uuid4(), title="Brand New"),
            SimpleNamespace(id=uuid.uuid4(), title="Also New"),
        ],
    )
    assert [item.status for item in migrated] == ["unlocked", "locked"]


@pytest.mark.anyio
async def test_generate_endpoint_rechecks_selected_kbs_before_enqueue(monkeypatch):
    creator = actor("creator")
    selected = uuid.uuid4()
    checked = []

    async def authorize(_db, _user, ids):
        checked.extend(ids)

    async def enqueue(_db, **kwargs):
        return kwargs

    monkeypatch.setattr(courses, "authorize_course_kbs", authorize)
    monkeypatch.setattr(courses, "create_and_enqueue_job", enqueue)
    response = await courses.generate_course(
        CourseGenerateRequest(
            topic="Async Python",
            pure_ai=False,
            knowledge_base_ids=[selected],
        ),
        db=SimpleNamespace(),
        user=creator,
    )
    assert checked == [selected]
    assert response["job_type"] == "course_generate"


def test_version_event_model_and_followup_migration_exist():
    assert models.CourseVersionEvent.__tablename__ == "course_version_events"
    assert {
        "course_id",
        "from_version_id",
        "to_version_id",
        "actor_id",
        "event_type",
        "details",
    } <= set(models.CourseVersionEvent.__table__.c.keys())

    migration = (
        Path(__file__).parents[1]
        / "app/db/migrations/versions/c5d6e7f8a9b0_add_course_version_events.py"
    )
    spec = importlib.util.spec_from_file_location("course_version_events_migration", migration)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.down_revision == "b4c5d6e7f8a9"


class RecordingDb:
    def __init__(self):
        self.added = []

    def add(self, value):
        self.added.append(value)

    def add_all(self, values):
        self.added.extend(values)

    async def flush(self):
        for value in self.added:
            if hasattr(value, "id") and value.id is None:
                value.id = uuid.uuid4()


@pytest.mark.anyio
async def test_generation_builds_course_version_author_progress_and_legacy_mirror(
    monkeypatch,
):
    creator = actor("creator")
    outline = {
        "total_chapters": 2,
        "chapters": [
            {"order": 1, "title": "Start", "summary": "One"},
            {"order": 2, "title": "Finish", "summary": "Two"},
        ],
    }

    async def prepared(*_args):
        return outline, [], []

    monkeypatch.setattr(course_generation, "_generate_outline_for_request", prepared)
    db = RecordingDb()
    course = await course_generation.generate_course_record(
        db,
        {
            "topic": "Async Python",
            "difficulty": "intermediate",
            "user_background": "",
            "pure_ai": True,
            "knowledge_base_ids": [],
        },
        creator,
    )

    versions = [item for item in db.added if isinstance(item, models.CourseVersion)]
    course_chapters = [
        item for item in db.added if isinstance(item, models.CourseChapter)
    ]
    legacy_paths = [item for item in db.added if isinstance(item, models.LearningPath)]
    legacy_chapters = [item for item in db.added if isinstance(item, models.Chapter)]
    enrollments = [item for item in db.added if isinstance(item, models.Enrollment)]
    progress = [item for item in db.added if isinstance(item, models.ChapterProgress)]

    assert course.status == "draft" and course.visibility == "private"
    assert course.current_version_id == versions[0].id
    assert course.legacy_path_id == legacy_paths[0].id
    assert [item.legacy_chapter_id for item in course_chapters] == [
        item.id for item in legacy_chapters
    ]
    assert enrollments[0].user_id == creator.id
    assert [item.status for item in progress] == ["unlocked", "locked"]


@pytest.mark.anyio
async def test_rebuild_generation_failure_does_not_mutate_published_course(
    monkeypatch,
):
    creator = actor("admin")
    old_version = uuid.uuid4()
    target = SimpleNamespace(
        id=uuid.uuid4(),
        author_id=creator.id,
        topic="Async Python",
        difficulty="advanced",
        status="published",
        visibility="published",
        current_version_id=old_version,
        legacy_path_id=uuid.uuid4(),
    )

    class Result:
        def scalar_one_or_none(self):
            return target

    class Db(RecordingDb):
        async def execute(self, _query):
            return Result()

    async def fail(*_args):
        raise RuntimeError("LLM failed")

    monkeypatch.setattr(course_generation, "_generate_outline_for_request", fail)
    db = Db()
    with pytest.raises(RuntimeError, match="LLM failed"):
        await course_generation.rebuild_course_record(
            db,
            target.id,
            {
                "topic": None,
                "difficulty": "advanced",
                "user_background": "",
                "pure_ai": True,
                "knowledge_base_ids": [],
            },
            creator,
        )

    assert db.added == []
    assert target.current_version_id == old_version
    assert target.status == "published"
    assert target.visibility == "published"


@pytest.mark.anyio
async def test_rebuild_rejects_stale_current_version_after_llm(monkeypatch):
    admin = actor("admin")
    old_version = uuid.uuid4()
    target = SimpleNamespace(
        id=uuid.uuid4(),
        author_id=uuid.uuid4(),
        topic="Async Python",
        difficulty="advanced",
        status="published",
        visibility="published",
        current_version_id=old_version,
        legacy_path_id=None,
    )
    stale = SimpleNamespace(
        **{
            **target.__dict__,
            "current_version_id": uuid.uuid4(),
        }
    )

    class Db(RecordingDb):
        def __init__(self):
            super().__init__()
            self.results = iter(
                [
                    ScriptedResult(scalar=target),
                    ScriptedResult(scalar=stale),
                ]
            )

        async def execute(self, _query):
            return next(self.results)

    async def prepared(*_args):
        return {
            "chapters": [{"order": 1, "title": "New", "summary": ""}]
        }, [], []

    monkeypatch.setattr(course_generation, "_generate_outline_for_request", prepared)
    db = Db()
    with pytest.raises(HTTPException, match="发生变化"):
        await course_generation.rebuild_course_record(
            db,
            target.id,
            {
                "topic": None,
                "difficulty": "advanced",
                "pure_ai": True,
                "knowledge_base_ids": [],
            },
            admin,
        )
    assert db.added == []
    assert target.current_version_id == old_version


@pytest.mark.anyio
async def test_referenced_kb_delete_is_rejected_before_cancellation(monkeypatch):
    admin = actor("admin")
    target = models.KnowledgeBase(
        id=uuid.uuid4(),
        user_id=admin.id,
        name="In use",
        status="active",
        visibility="platform_public",
        approval_status="approved",
    )
    target.documents = []
    cancelled = False

    class Db:
        async def execute(self, _query):
            return ScriptedResult(scalar=target)

        async def scalar(self, _query):
            return 1

    async def cancel(*_args):
        nonlocal cancelled
        cancelled = True

    monkeypatch.setattr(knowledge, "cancel_document_jobs", cancel)
    with pytest.raises(HTTPException, match="课程版本引用"):
        await knowledge.delete_knowledge_base(target.id, db=Db(), user=admin)
    assert not cancelled


@pytest.mark.anyio
async def test_archived_snapshot_paths_are_filtered_from_learner_list():
    queries = []

    class Db:
        async def execute(self, query):
            queries.append(query)
            return SimpleNamespace(
                scalars=lambda: SimpleNamespace(all=lambda: [])
            )

    assert await progress_api.get_user_paths(db=Db(), user=actor("learner")) == []
    assert "learning_paths.status" in str(queries[0])
    assert "archived" in queries[0].compile().params.values()


class ScriptedResult:
    def __init__(self, *, scalar=None, scalars=(), rows=()):
        self.scalar_value = scalar
        self.scalar_values = list(scalars)
        self.rows = list(rows)

    def scalar_one_or_none(self):
        return self.scalar_value

    def scalars(self):
        return SimpleNamespace(all=lambda: self.scalar_values)

    def all(self):
        return self.rows


@pytest.mark.anyio
async def test_successful_rebuild_persists_version_progress_and_legacy_compatibility(
    monkeypatch,
):
    creator = actor("admin")
    course_id = uuid.uuid4()
    old_version = models.CourseVersion(
        id=uuid.uuid4(),
        course_id=course_id,
        version_number=1,
        outline={"chapters": [{"title": "Old"}]},
        source_type="ai_generated",
        created_by=creator.id,
    )
    path = models.LearningPath(
        id=uuid.uuid4(),
        user_id=creator.id,
        topic="Async Python",
        difficulty="advanced",
        outline=old_version.outline,
        status="active",
        knowledge_bases=[],
    )
    target = models.Course(
        id=course_id,
        author_id=creator.id,
        topic="Async Python",
        difficulty="advanced",
        status="published",
        visibility="published",
        current_version_id=old_version.id,
        legacy_path_id=path.id,
    )
    first = models.Enrollment(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        course_id=course_id,
        active_version_id=old_version.id,
        status="active",
    )
    second = models.Enrollment(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        course_id=course_id,
        active_version_id=old_version.id,
        status="completed",
    )
    first_completed_at = datetime.now(timezone.utc)
    old_legacy_ids = [uuid.uuid4(), uuid.uuid4()]
    selected_kb = models.KnowledgeBase(
        id=uuid.uuid4(),
        user_id=creator.id,
        name="Approved KB",
        status="active",
        visibility="private",
        approval_status="approved",
    )
    new_outline = {
        "total_chapters": 3,
        "chapters": [
            {"order": 1, "title": "INTRO ASYNC", "summary": "Preserved"},
            {"order": 2, "title": "New Topic", "summary": "Reset"},
            {"order": 3, "title": "Tail New", "summary": "Locked"},
        ],
    }

    async def prepared(*_args):
        return new_outline, [selected_kb], ["approved.md"]

    monkeypatch.setattr(course_generation, "_generate_outline_for_request", prepared)

    class RebuildDb(RecordingDb):
        def __init__(self):
            super().__init__()
            self.statements = []
            self.persisted_versions = [old_version]
            self.results = iter(
                [
                    ScriptedResult(scalar=target),
                    ScriptedResult(scalar=target),
                    ScriptedResult(scalar=path),
                    ScriptedResult(scalars=old_legacy_ids),
                    ScriptedResult(),
                    ScriptedResult(scalars=[first, second]),
                    ScriptedResult(
                        rows=[
                            (
                                SimpleNamespace(
                                    status="completed",
                                    completed_at=first_completed_at,
                                ),
                                " Intro: Async! ",
                            ),
                            (
                                SimpleNamespace(status="in_progress", completed_at=None),
                                "Removed",
                            ),
                        ]
                    ),
                    ScriptedResult(),
                    ScriptedResult(
                        rows=[
                            (
                                SimpleNamespace(status="in_progress", completed_at=None),
                                "intro async",
                            ),
                            (
                                SimpleNamespace(status="completed", completed_at=None),
                                "Removed",
                            ),
                        ]
                    ),
                    ScriptedResult(),
                    ScriptedResult(),
                    ScriptedResult(scalars=[]),
                    ScriptedResult(),
                ]
            )

        async def execute(self, statement):
            self.statements.append(statement)
            return next(self.results)

        async def scalar(self, _statement):
            return 1

        def add(self, value):
            super().add(value)
            if isinstance(value, models.CourseVersion):
                self.persisted_versions.append(value)

    db = RebuildDb()
    rebuilt = await course_generation.rebuild_course_record(
        db,
        target.id,
        {
            "topic": None,
            "difficulty": "advanced",
            "user_background": "",
            "pure_ai": False,
            "knowledge_base_ids": [selected_kb.id],
        },
        creator,
    )

    new_version = next(
        item
        for item in db.added
        if isinstance(item, models.CourseVersion) and item.id != old_version.id
    )
    new_course_chapters = [
        item for item in db.added if isinstance(item, models.CourseChapter)
    ]
    new_legacy_chapters = [
        item for item in db.added if isinstance(item, models.Chapter)
    ]
    new_progress = [
        item for item in db.added if isinstance(item, models.ChapterProgress)
    ]
    progress_by_enrollment = {
        enrollment.id: [
            item for item in new_progress if item.enrollment_id == enrollment.id
        ]
        for enrollment in (first, second)
    }

    assert rebuilt is target
    assert target.current_version_id == new_version.id != old_version.id
    assert first.active_version_id == second.active_version_id == new_version.id
    assert first.status == "active"
    assert second.status == "completed"
    assert old_version in db.persisted_versions
    assert target.status == "published"
    assert target.visibility == "published"

    assert [
        (item.status, item.completed_at) for item in progress_by_enrollment[first.id]
    ] == [
        ("completed", first_completed_at),
        ("unlocked", None),
        ("locked", None),
    ]
    assert [
        (item.status, item.completed_at) for item in progress_by_enrollment[second.id]
    ] == [
        ("in_progress", None),
        ("unlocked", None),
        ("locked", None),
    ]
    assert all(item.version_id == new_version.id for item in new_progress)

    assert path.outline == new_outline
    assert path.knowledge_bases == [selected_kb]
    snapshots = [
        item
        for item in db.added
        if isinstance(item, models.LearningPath) and item.status == "archived"
    ]
    assert len(snapshots) == 1
    assert snapshots[0].outline == old_version.outline
    assert snapshots[0].user_id == creator.id
    assert [item.title for item in new_legacy_chapters] == [
        "INTRO ASYNC",
        "New Topic",
        "Tail New",
    ]
    legacy_by_id = {item.id: item for item in new_legacy_chapters}
    assert all(
        chapter.legacy_chapter_id in legacy_by_id
        for chapter in new_course_chapters
    )
    assert [
        legacy_by_id[chapter.legacy_chapter_id].sort_order
        for chapter in new_course_chapters
    ] == [1, 2, 3]
    assert not any(
        "DELETE FROM course_versions" in str(statement)
        for statement in db.statements
    )
    assert not any(
        table in str(statement)
        for statement in db.statements
        for table in (
            "DELETE FROM chapters",
            "DELETE FROM exercises",
            "DELETE FROM exercise_submissions",
            "UPDATE conversations",
        )
    )
    enrollment_query = next(
        statement
        for statement in db.statements
        if "FROM enrollments" in str(statement)
    )
    assert set(enrollment_query.compile().params["status_1"]) == {
        "active",
        "completed",
    }
    course_queries = [
        statement
        for statement in db.statements
        if "FROM courses" in str(statement)
    ]
    assert course_queries[0]._for_update_arg is None
    assert course_queries[1]._for_update_arg is not None
    assert course_queries[1].get_execution_options().get("populate_existing") is True


def test_version_event_and_kb_links_enforce_provenance_integrity():
    event_fks = {
        tuple(element.parent.name for element in constraint.elements): (
            tuple(element.target_fullname for element in constraint.elements),
            constraint.deferrable,
        )
        for constraint in models.CourseVersionEvent.__table__.constraints
        if isinstance(constraint, ForeignKeyConstraint)
    }
    assert event_fks[("course_id", "from_version_id")][0] == (
        "course_versions.course_id",
        "course_versions.id",
    )
    assert event_fks[("course_id", "to_version_id")][0] == (
        "course_versions.course_id",
        "course_versions.id",
    )
    assert event_fks[("course_id", "from_version_id")][1]
    assert event_fks[("course_id", "to_version_id")][1]

    kb_fk = next(
        constraint
        for constraint in models.course_version_knowledge_bases.constraints
        if isinstance(constraint, ForeignKeyConstraint)
        and tuple(column.name for column in constraint.columns) == ("kb_id",)
    )
    assert kb_fk.ondelete == "RESTRICT"
