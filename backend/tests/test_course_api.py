import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.core.deps import is_admin_role, is_creator_role, require_creator
from app.api.v1 import conversations, courses, paths
from app.schemas.schemas import (
    AdminCourseResponse,
    AdminUserResponse,
    CourseCatalogItem,
    CourseDetailResponse,
    CourseReviewUpdate,
    EnrollmentCourseResponse,
    UserRoleUpdate,
)
from app.services.course_access import (
    apply_admin_review,
    apply_admin_status,
    can_access_legacy_chapter,
    can_access_course,
    create_enrollment_progress,
    resolve_legacy_status_target,
    serialize_legacy_chapter,
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


class FakeDb:
    def __init__(self, *, row=None, scalar=None):
        self.row = row
        self.scalar_value = scalar

    async def execute(self, _query):
        return SimpleNamespace(first=lambda: self.row)

    async def scalar(self, _query):
        return self.scalar_value


class QueryDb:
    def __init__(self, *, total=0, items=()):
        self.total = total
        self.items = list(items)
        self.queries = []

    async def scalar(self, query):
        self.queries.append(query)
        return self.total

    async def execute(self, query):
        self.queries.append(query)
        return SimpleNamespace(
            scalars=lambda: SimpleNamespace(all=lambda: self.items)
        )


def actor(role: str, *, auth_provider: str = "email"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        role=role,
        auth_provider=auth_provider,
    )


def course(*, author_id=None, status="draft", visibility="private", current_version_id=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        author_id=author_id or uuid.uuid4(),
        status=status,
        visibility=visibility,
        current_version_id=current_version_id,
        review_note=None,
        reviewer_id=None,
        reviewed_at=None,
        published_at=None,
        submitted_for_review_at=None,
    )


def test_creator_role_matrix_does_not_change_admin_semantics():
    assert is_creator_role("creator")
    assert is_creator_role("admin")
    assert is_creator_role("super_admin")
    assert not is_creator_role("learner")
    assert is_admin_role("admin")
    assert is_admin_role("super_admin")
    assert not is_admin_role("creator")


@pytest.mark.anyio
async def test_require_creator_rejects_learner_and_anonymous():
    assert (await require_creator(actor("creator"))).role == "creator"
    with pytest.raises(HTTPException) as learner_error:
        await require_creator(actor("learner"))
    assert learner_error.value.status_code == 403
    with pytest.raises(HTTPException) as anonymous_error:
        await require_creator(actor("creator", auth_provider="anonymous"))
    assert anonymous_error.value.status_code == 403


def test_account_role_schemas_accept_creator():
    assert UserRoleUpdate(role="creator").role == "creator"
    data = {
        "id": uuid.uuid4(),
        "email": "creator@example.com",
        "nickname": "Creator",
        "avatar_url": None,
        "auth_provider": "email",
        "role": "creator",
        "status": "active",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
    }
    assert AdminUserResponse.model_validate(data).role == "creator"


def test_private_course_access_is_author_or_admin_only():
    author = actor("creator")
    private = course(author_id=author.id)
    assert can_access_course(private, author)
    assert can_access_course(private, actor("admin"))
    assert not can_access_course(private, actor("learner"))
    assert not can_access_course(private, None)


def test_published_course_is_public_only_with_both_flags():
    learner = actor("learner")
    assert can_access_course(course(status="published", visibility="published"), None)
    assert can_access_course(course(status="published", visibility="published"), learner)
    assert not can_access_course(course(status="published", visibility="private"), learner)
    assert not can_access_course(course(status="draft", visibility="published"), learner)


@pytest.mark.anyio
async def test_mapped_chapter_requires_enrollment_for_learner_conversation():
    learner = actor("learner")
    published = course(status="published", visibility="published")
    assert not await can_access_legacy_chapter(
        FakeDb(row=(published, None)),
        uuid.uuid4(),
        learner,
        require_enrollment=True,
    )
    assert await can_access_legacy_chapter(
        FakeDb(row=(published, SimpleNamespace(id=uuid.uuid4()))),
        uuid.uuid4(),
        learner,
        require_enrollment=True,
    )


@pytest.mark.anyio
async def test_unmapped_legacy_chapter_remains_available_to_owner():
    owner = actor("learner")
    assert await can_access_legacy_chapter(
        FakeDb(row=None, scalar=owner.id),
        uuid.uuid4(),
        owner,
        require_enrollment=True,
    )


@pytest.mark.anyio
async def test_conversation_creation_rejects_inaccessible_mapped_chapter(monkeypatch):
    learner = actor("learner")
    chapter_id = uuid.uuid4()

    async def deny(*_args, **_kwargs):
        return False

    monkeypatch.setattr(conversations, "can_access_legacy_chapter", deny, raising=False)
    with pytest.raises(HTTPException) as error:
        await conversations.create_conversation(
            conversations.ConversationCreate(chapter_id=chapter_id),
            db=SimpleNamespace(),
            user=learner,
        )
    assert error.value.status_code == 403


@pytest.mark.anyio
async def test_private_legacy_path_is_denied_before_cache_lookup(monkeypatch):
    target = SimpleNamespace(id=uuid.uuid4(), user_id=uuid.uuid4())
    outsider = actor("learner")
    db = SimpleNamespace(
        execute=lambda *_args, **_kwargs: None,
    )

    class Result:
        def scalar_one_or_none(self):
            return target

    async def execute(_query):
        return Result()

    async def deny(*_args, **_kwargs):
        return False

    db.execute = execute
    monkeypatch.setattr(paths, "can_access_legacy_path", deny, raising=False)
    with pytest.raises(HTTPException) as error:
        await paths.get_path(target.id, db=db, user=outsider)
    assert error.value.status_code == 404


def test_catalog_schema_does_not_expose_review_or_authorization_fields():
    assert {
        "review_note",
        "reviewer_id",
        "submitted_for_review_at",
        "knowledge_base_ids",
        "learning_path_id",
        "legacy_path_id",
    }.isdisjoint(CourseCatalogItem.model_fields)


def test_unauthenticated_course_reads_do_not_leak_the_author_uuid():
    # GET /courses and GET /courses/{id} both serve anonymous visitors.
    assert "author_id" not in CourseCatalogItem.model_fields
    assert "author_id" not in CourseDetailResponse.model_fields
    # Authenticated views that genuinely need the identity keep it: "我的课程"
    # tells an own private course apart from a real platform course, and the
    # admin console shows the author of every course it governs.
    assert (
        "author_id"
        in EnrollmentCourseResponse.model_fields["course"].annotation.model_fields
    )
    assert "author_id" in AdminCourseResponse.model_fields


def published_course(*, legacy_path_id=None, current_version_id=None):
    from app.models.models import Course

    now = datetime.now(timezone.utc)
    return Course(
        id=uuid.uuid4(),
        author_id=uuid.uuid4(),
        topic="Python",
        difficulty="intermediate",
        status="published",
        visibility="published",
        current_version_id=current_version_id or uuid.uuid4(),
        legacy_path_id=legacy_path_id,
        created_at=now,
        updated_at=now,
    )


def test_course_detail_exposes_compatible_learning_path_from_legacy_mapping():
    legacy_path_id = uuid.uuid4()

    mapped = CourseDetailResponse.model_validate(
        published_course(legacy_path_id=legacy_path_id)
    )
    unmapped = CourseDetailResponse.model_validate(published_course())

    assert mapped.learning_path_id == legacy_path_id
    assert unmapped.learning_path_id is None


@pytest.mark.anyio
async def test_enrollment_list_exposes_compatible_learning_path_and_progress():
    legacy_path_id = uuid.uuid4()
    enrolled = published_course(legacy_path_id=legacy_path_id)
    unmapped = published_course()

    def row(target, completed):
        return SimpleNamespace(
            Enrollment=SimpleNamespace(
                id=uuid.uuid4(),
                course_id=target.id,
                active_version_id=target.current_version_id,
                status="active",
                enrolled_at=datetime.now(timezone.utc),
            ),
            Course=target,
            total_chapters=4,
            completed_chapters=completed,
        )

    rows = [row(enrolled, 1), row(unmapped, 0)]

    class Db:
        async def execute(self, _query):
            return SimpleNamespace(all=lambda: rows)

    payload = await courses.my_enrollments(
        page=1,
        page_size=20,
        db=Db(),
        user=actor("learner"),
    )
    response = [EnrollmentCourseResponse.model_validate(item) for item in payload]

    assert response[0].learning_path_id == legacy_path_id
    assert response[0].progress == 25
    assert response[1].learning_path_id is None


def test_admin_course_schema_serializes_authoritative_current_version_metadata():
    from app.models.models import Course, CourseVersion, KnowledgeBase

    now = datetime.now(timezone.utc)
    course_id = uuid.uuid4()
    version_id = uuid.uuid4()
    kb_one = KnowledgeBase(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        name="Internal Python",
        status="active",
    )
    kb_two = KnowledgeBase(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        name="Shared Patterns",
        status="active",
    )
    version = CourseVersion(
        id=version_id,
        course_id=course_id,
        version_number=3,
        source_type="knowledge_base",
        created_by=uuid.uuid4(),
        knowledge_bases=[kb_one, kb_two],
    )
    target = Course(
        id=course_id,
        author_id=uuid.uuid4(),
        topic="Python",
        difficulty="intermediate",
        status="pending_review",
        visibility="private",
        current_version_id=version_id,
        current_version=version,
        review_note="Check chapter 2",
        created_at=now,
        updated_at=now,
    )

    response = AdminCourseResponse.model_validate(target)

    assert response.current_version_number == 3
    assert response.source_type == "knowledge_base"
    assert response.knowledge_base_ids == [kb_one.id, kb_two.id]
    assert response.knowledge_base_names == ["Internal Python", "Shared Patterns"]
    assert response.review_note == "Check chapter 2"


@pytest.mark.anyio
async def test_admin_detail_returns_review_and_current_version_metadata():
    from app.models.models import Course, CourseVersion

    admin = actor("admin")
    course_id = uuid.uuid4()
    version_id = uuid.uuid4()
    target = Course(
        id=course_id,
        author_id=uuid.uuid4(),
        topic="Python",
        difficulty="intermediate",
        status="pending_review",
        visibility="private",
        current_version_id=version_id,
        current_version=CourseVersion(
            id=version_id,
            course_id=course_id,
            version_number=2,
            source_type="ai_generated",
            created_by=uuid.uuid4(),
            knowledge_bases=[],
        ),
        review_note="Needs review",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    class Db:
        async def execute(self, _query):
            return SimpleNamespace(scalar_one_or_none=lambda: target)

    result = await courses.admin_get_course(course_id, db=Db(), _=admin)
    response = AdminCourseResponse.model_validate(result)

    assert response.review_note == "Needs review"
    assert response.current_version_number == 2
    assert response.source_type == "ai_generated"
    assert response.knowledge_base_ids == []


@pytest.mark.anyio
async def test_catalog_query_filters_published_visibility_search_and_difficulty():
    db = QueryDb()
    result = await courses.list_catalog(
        search="python",
        difficulty="advanced",
        page=2,
        page_size=10,
        db=db,
    )
    sql = " ".join(str(query) for query in db.queries)
    assert "courses.status" in sql
    assert "courses.visibility" in sql
    assert "courses.difficulty" in sql
    assert "lower(courses.topic) LIKE lower" in sql
    assert result["page"] == 2
    assert result["page_size"] == 10


@pytest.mark.anyio
async def test_private_course_lookup_denies_outsider_by_id():
    target = course(status="draft", visibility="private")

    class Db:
        async def get(self, _model, _id):
            return target

    with pytest.raises(HTTPException) as error:
        await courses.get_course(target.id, db=Db(), user=actor("learner"))
    assert error.value.status_code == 404


@pytest.mark.anyio
async def test_enrollment_is_idempotent_when_record_already_exists():
    learner = actor("learner")
    target = course(
        status="published",
        visibility="published",
        current_version_id=uuid.uuid4(),
    )
    existing = SimpleNamespace(id=uuid.uuid4(), course_id=target.id)

    class Db:
        committed = False
        lock_query = None

        async def execute(self, query):
            self.lock_query = query
            return SimpleNamespace(scalar_one_or_none=lambda: target)

        async def scalar(self, _query):
            return existing

        async def commit(self):
            self.committed = True

    db = Db()
    assert await courses.enroll_course(target.id, db=db, user=learner) is existing
    assert not db.committed
    assert db.lock_query._for_update_arg is not None


@pytest.mark.anyio
async def test_enrollment_recovers_concurrent_unique_constraint_winner():
    learner = actor("learner")
    target = course(
        status="published",
        visibility="published",
        current_version_id=uuid.uuid4(),
    )
    winner = SimpleNamespace(id=uuid.uuid4(), course_id=target.id)
    chapter = SimpleNamespace(
        id=uuid.uuid4(),
        version_id=target.current_version_id,
    )

    class Nested:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

    class Db:
        def __init__(self):
            self.scalars = iter([None, winner])
            self.execute_count = 0
            self.lock_query = None

        async def scalar(self, _query):
            return next(self.scalars)

        async def execute(self, query):
            self.execute_count += 1
            if self.execute_count == 1:
                self.lock_query = query
                return SimpleNamespace(scalar_one_or_none=lambda: target)
            return SimpleNamespace(
                scalars=lambda: SimpleNamespace(all=lambda: [chapter])
            )

        def begin_nested(self):
            return Nested()

        def add(self, _value):
            pass

        def add_all(self, _values):
            pass

        async def flush(self):
            raise IntegrityError("insert", {}, Exception("duplicate"))

        async def commit(self):
            raise AssertionError("unsafe outer commit attempted before conflict recovery")

    db = Db()
    assert await courses.enroll_course(target.id, db=db, user=learner) is winner
    assert db.lock_query._for_update_arg is not None


def test_enrollment_progress_is_per_enrollment_and_does_not_mutate_chapters():
    version_id = uuid.uuid4()
    chapters = [
        SimpleNamespace(id=uuid.uuid4(), version_id=version_id, status="shared"),
        SimpleNamespace(id=uuid.uuid4(), version_id=version_id, status="shared"),
    ]
    first_enrollment, first_progress = create_enrollment_progress(
        user_id=uuid.uuid4(),
        course_id=uuid.uuid4(),
        version_id=version_id,
        chapters=chapters,
    )
    second_enrollment, second_progress = create_enrollment_progress(
        user_id=uuid.uuid4(),
        course_id=first_enrollment.course_id,
        version_id=version_id,
        chapters=chapters,
    )

    assert [item.status for item in first_progress] == ["unlocked", "locked"]
    assert [item.status for item in second_progress] == ["unlocked", "locked"]
    first_progress[0].status = "completed"
    assert second_progress[0].status == "unlocked"
    assert [chapter.status for chapter in chapters] == ["shared", "shared"]


def test_mapped_legacy_status_requires_per_enrollment_progress():
    legacy = SimpleNamespace(status="shared")
    mapped = SimpleNamespace(id=uuid.uuid4())
    with pytest.raises(HTTPException, match="加入课程"):
        resolve_legacy_status_target(
            legacy_chapter=legacy,
            mapped_chapter=mapped,
            progress=None,
        )
    assert legacy.status == "shared"

    # A previewing author/admin has no enrollment, so there is nothing safe to
    # write: the answer is "no target", never the shared legacy chapter.
    assert (
        resolve_legacy_status_target(
            legacy_chapter=legacy,
            mapped_chapter=mapped,
            progress=None,
            preview=True,
        )
        is None
    )
    assert legacy.status == "shared"

    progress = SimpleNamespace(status="unlocked")
    assert (
        resolve_legacy_status_target(
            legacy_chapter=legacy,
            mapped_chapter=mapped,
            progress=progress,
        )
        is progress
    )
    assert (
        resolve_legacy_status_target(
            legacy_chapter=legacy,
            mapped_chapter=None,
            progress=None,
        )
        is legacy
    )


def test_mapped_legacy_reads_are_neutral_without_user_progress_and_isolated():
    first = SimpleNamespace(
        id=uuid.uuid4(),
        path_id=uuid.uuid4(),
        sort_order=1,
        title="First",
        summary=None,
        status="completed",
        completed_at="shared-completion",
        created_at="created",
    )
    second = SimpleNamespace(
        id=uuid.uuid4(),
        path_id=first.path_id,
        sort_order=2,
        title="Second",
        summary=None,
        status="in_progress",
        completed_at="shared-completion",
        created_at="created",
    )
    owner_progress = SimpleNamespace(status="completed", completed_at="owner-completion")

    owner_view = serialize_legacy_chapter(first, owner_progress, mapped=True)
    other_first_view = serialize_legacy_chapter(first, None, mapped=True)
    other_second_view = serialize_legacy_chapter(second, None, mapped=True)

    assert owner_view["status"] == "completed"
    assert owner_view["completed_at"] == "owner-completion"
    assert other_first_view["status"] == "unlocked"
    assert other_first_view["completed_at"] is None
    assert other_second_view["status"] == "locked"
    assert other_second_view["completed_at"] is None
    assert first.status == "completed"
    assert second.status == "in_progress"


class ChapterStatusDb:
    """Dispatches update_chapter_status' lookups by the table they select from."""

    def __init__(self, *, chapter, mapped_chapter=None, mapped_course=None, progress=None):
        self.chapter = chapter
        self.by_table = {
            "course_chapters": mapped_chapter,
            "courses": mapped_course,
            "chapter_progress": progress,
        }
        self.committed = False
        self.refreshed = []

    async def execute(self, _statement):
        return SimpleNamespace(scalar_one_or_none=lambda: self.chapter)

    async def scalar(self, statement):
        return self.by_table[str(statement).split("FROM ")[1].split()[0]]

    async def commit(self):
        self.committed = True

    async def refresh(self, value):
        self.refreshed.append(value)


def mapped_course_chapter(legacy_chapter_id):
    from app.models.models import CourseChapter

    return CourseChapter(
        id=uuid.uuid4(),
        version_id=uuid.uuid4(),
        sort_order=1,
        title="Chapter One",
        legacy_chapter_id=legacy_chapter_id,
    )


def legacy_chapter_row():
    from app.models.models import Chapter

    return Chapter(
        id=uuid.uuid4(),
        path_id=uuid.uuid4(),
        sort_order=1,
        title="Chapter One",
        summary="Summary",
        status="unlocked",
        created_at=datetime.now(timezone.utc),
    )


@pytest.mark.anyio
@pytest.mark.parametrize("role", ["author", "admin"])
async def test_course_preview_status_update_is_a_no_op_instead_of_a_409(
    monkeypatch, role
):
    from app.api.v1 import chapters
    from app.schemas.schemas import ChapterStatusUpdate

    author = actor("creator")
    caller = author if role == "author" else actor("admin")
    chapter = legacy_chapter_row()
    db = ChapterStatusDb(
        chapter=chapter,
        mapped_chapter=mapped_course_chapter(chapter.id),
        mapped_course=published_course(legacy_path_id=chapter.path_id),
        progress=None,
    )
    db.by_table["courses"].author_id = author.id

    async def allow(*_args, **_kwargs):
        return True

    async def unreachable_cache(*_args, **_kwargs):
        raise AssertionError("a no-op preview must not invalidate shared caches")

    monkeypatch.setattr(chapters, "can_access_legacy_chapter", allow)
    monkeypatch.setattr(chapters, "cache_delete", unreachable_cache)

    payload = await chapters.update_chapter_status(
        chapter.id,
        ChapterStatusUpdate(status="completed"),
        db=db,
        user=caller,
    )

    assert payload["preview"] is True
    assert payload["status"] == "unlocked"
    # The whole refactor exists to keep shared legacy state out of per-learner
    # progress; a previewer's click must leave both untouched.
    assert chapter.status == "unlocked"
    assert chapter.completed_at is None
    assert not db.committed


@pytest.mark.anyio
async def test_enrolled_learner_without_progress_still_gets_the_enroll_conflict(
    monkeypatch,
):
    from app.api.v1 import chapters
    from app.schemas.schemas import ChapterStatusUpdate

    chapter = legacy_chapter_row()
    db = ChapterStatusDb(
        chapter=chapter,
        mapped_chapter=mapped_course_chapter(chapter.id),
        mapped_course=published_course(legacy_path_id=chapter.path_id),
        progress=None,
    )

    async def allow(*_args, **_kwargs):
        return True

    monkeypatch.setattr(chapters, "can_access_legacy_chapter", allow)

    with pytest.raises(HTTPException) as error:
        await chapters.update_chapter_status(
            chapter.id,
            ChapterStatusUpdate(status="completed"),
            db=db,
            user=actor("learner"),
        )

    assert error.value.status_code == 409
    assert chapter.status == "unlocked"
    assert not db.committed


@pytest.mark.anyio
async def test_non_author_submit_review_uses_anti_enumeration_not_found():
    target = course(status="draft", current_version_id=uuid.uuid4())

    class Db:
        async def get(self, _model, _id):
            return target

    with pytest.raises(HTTPException) as error:
        await courses.submit_course_review(
            target.id,
            db=Db(),
            user=actor("creator"),
        )
    assert error.value.status_code == 404


def test_review_transitions_require_current_version_and_preserve_rejection_note():
    target = course(status="pending_review", current_version_id=uuid.uuid4())
    reviewer = actor("admin")
    apply_admin_review(target, reviewer, CourseReviewUpdate(decision="approve"))
    assert target.status == "published"
    assert target.visibility == "published"
    assert target.reviewer_id == reviewer.id

    rejected = course(status="pending_review", current_version_id=uuid.uuid4())
    apply_admin_review(
        rejected,
        reviewer,
        CourseReviewUpdate(decision="reject", note="Needs clearer examples"),
    )
    assert rejected.status == "rejected"
    assert rejected.visibility == "private"
    assert rejected.review_note == "Needs clearer examples"

    missing_version = course(status="pending_review")
    with pytest.raises(HTTPException, match="当前版本"):
        apply_admin_review(missing_version, reviewer, CourseReviewUpdate(decision="approve"))


def test_admin_status_transitions_reject_invalid_publish_and_archive():
    reviewer = actor("admin")
    pending = course(status="pending_review", current_version_id=uuid.uuid4())
    with pytest.raises(HTTPException):
        apply_admin_status(pending, reviewer, "published")
    rejected = course(status="rejected", current_version_id=uuid.uuid4())
    with pytest.raises(HTTPException):
        apply_admin_status(rejected, reviewer, "published")

    published = course(
        status="published",
        visibility="published",
        current_version_id=uuid.uuid4(),
    )
    apply_admin_status(published, reviewer, "archived")
    assert published.status == "archived"
    assert published.visibility == "private"

    apply_admin_status(published, reviewer, "published")
    assert published.status == "published"
    assert published.visibility == "published"
