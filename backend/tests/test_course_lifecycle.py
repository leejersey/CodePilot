"""Course lifecycle state machine: who may move a course between which states."""

import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1 import courses
from app.schemas.schemas import CourseReviewUpdate
from app.services.course_access import apply_admin_review, apply_admin_status
from app.services.course_generation import validate_rebuild_permission


@pytest.fixture
def anyio_backend():
    return "asyncio"


def actor(role: str, *, auth_provider: str = "email"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        role=role,
        auth_provider=auth_provider,
    )


def course(
    *,
    author_id=None,
    status="draft",
    visibility="private",
    current_version_id=None,
    review_note=None,
):
    return SimpleNamespace(
        id=uuid.uuid4(),
        author_id=author_id or uuid.uuid4(),
        status=status,
        visibility=visibility,
        current_version_id=current_version_id or uuid.uuid4(),
        review_note=review_note,
        reviewer_id=None,
        reviewed_at=None,
        published_at=None,
        submitted_for_review_at=None,
    )


class CourseDb:
    """Minimal session for endpoints that load, mutate and commit one course."""

    def __init__(self, target):
        self.target = target
        self.committed = False

    async def get(self, _model, _id):
        return self.target

    async def commit(self):
        self.committed = True

    async def refresh(self, _target):
        return None


def assert_lockstep(target) -> None:
    assert (target.status == "published") == (target.visibility == "published"), (
        f"status={target.status!r} diverged from visibility={target.visibility!r}"
    )


def test_admin_publishes_another_admins_draft_without_review_round_trip():
    author = actor("admin")
    draft = course(author_id=author.id, status="draft")
    publisher = actor("admin")

    apply_admin_status(draft, publisher, "published", author_role=author.role)

    assert draft.status == "published"
    assert draft.visibility == "published"
    assert draft.reviewer_id == publisher.id
    assert draft.published_at is not None
    assert_lockstep(draft)


def test_admin_direct_publish_still_requires_a_current_version():
    draft = course(status="draft")
    draft.current_version_id = None

    with pytest.raises(HTTPException, match="当前版本") as error:
        apply_admin_status(draft, actor("admin"), "published", author_role="admin")
    assert error.value.status_code == 409
    assert draft.status == "draft"
    assert_lockstep(draft)


@pytest.mark.anyio
async def test_admin_may_submit_a_course_authored_by_someone_else():
    target = course(author_id=uuid.uuid4(), status="draft")
    db = CourseDb(target)

    result = await courses.submit_course_review(
        target.id,
        db=db,
        user=actor("admin"),
    )

    assert result is target
    assert target.status == "pending_review"
    assert target.visibility == "private"
    assert db.committed
    assert_lockstep(target)


@pytest.mark.anyio
async def test_creator_still_cannot_submit_a_course_they_do_not_own():
    target = course(author_id=uuid.uuid4(), status="draft")

    with pytest.raises(HTTPException) as error:
        await courses.submit_course_review(
            target.id,
            db=CourseDb(target),
            user=actor("creator"),
        )
    assert error.value.status_code == 404
    assert target.status == "draft"


def test_creator_cannot_publish_or_approve_even_with_a_direct_service_call():
    creator = actor("creator")
    own_draft = course(author_id=creator.id, status="draft")

    with pytest.raises(HTTPException) as publish_error:
        apply_admin_status(own_draft, creator, "published")
    assert publish_error.value.status_code == 403
    assert own_draft.status == "draft"
    assert_lockstep(own_draft)

    pending = course(author_id=creator.id, status="pending_review")
    with pytest.raises(HTTPException) as review_error:
        apply_admin_review(pending, creator, CourseReviewUpdate(decision="approve"))
    assert review_error.value.status_code == 403
    assert pending.status == "pending_review"
    assert_lockstep(pending)


def test_rejected_course_returns_through_review_instead_of_direct_publish():
    admin = actor("admin")
    rejected = course(status="rejected", review_note="需要更多示例")

    with pytest.raises(HTTPException) as error:
        apply_admin_status(rejected, admin, "published")
    assert error.value.status_code == 409
    assert rejected.status == "rejected"

    rejected.status = "pending_review"
    apply_admin_review(rejected, admin, CourseReviewUpdate(decision="approve"))
    assert rejected.status == "published"
    assert_lockstep(rejected)


def test_admin_cannot_publish_a_members_private_course_without_consent():
    """迁移过来的个人学习路径是私有内容，管理员不得单方面推上公开目录。"""
    owner = actor("creator")
    legacy = course(author_id=owner.id, status="draft", visibility="private")
    legacy.legacy_path_id = uuid.uuid4()

    with pytest.raises(HTTPException, match="提交审核") as error:
        apply_admin_status(legacy, actor("admin"), "published", author_role=owner.role)
    assert error.value.status_code == 409
    assert legacy.status == "draft"
    assert legacy.visibility == "private"
    assert_lockstep(legacy)

    # 作者提交审核即构成同意，此后管理员可以照常批准发布。
    legacy.status = "pending_review"
    apply_admin_review(legacy, actor("admin"), CourseReviewUpdate(decision="approve"))
    assert legacy.status == "published"
    assert_lockstep(legacy)


def test_previously_reviewed_course_can_be_republished_after_archiving():
    """已经过审的课程归档后重新上架，无需再次打扰作者。"""
    owner = actor("creator")
    archived = course(author_id=owner.id, status="archived", visibility="private")
    archived.reviewer_id = uuid.uuid4()

    apply_admin_status(archived, actor("admin"), "published", author_role=owner.role)

    assert archived.status == "published"
    assert_lockstep(archived)


def test_repaired_legacy_course_is_rebuildable_by_owner():
    owner = actor("creator")
    legacy = course(author_id=owner.id, status="draft", visibility="private")
    legacy.legacy_path_id = uuid.uuid4()

    # The owner may regenerate their own private course.
    assert validate_rebuild_permission(legacy, owner) is None
    assert legacy.status == "draft"
    assert_lockstep(legacy)


def test_legacy_published_private_state_is_not_produced_by_the_migration():
    from pathlib import Path

    migration = (
        Path(__file__).parents[1]
        / "app"
        / "db"
        / "migrations"
        / "versions"
        / "b4c5d6e7f8a9_add_course_versioning.py"
    ).read_text(encoding="utf-8")

    assert "'published', 'private'" not in migration
    assert "'draft', 'private'" in migration


def test_every_admin_transition_keeps_status_and_visibility_in_lockstep():
    admin = actor("admin")

    draft = course(status="draft")
    apply_admin_status(draft, admin, "published", author_role="admin")
    assert_lockstep(draft)
    apply_admin_status(draft, admin, "archived", author_role="admin")
    assert_lockstep(draft)
    apply_admin_status(draft, admin, "published", author_role="admin")
    assert_lockstep(draft)

    pending = course(status="pending_review")
    apply_admin_review(
        pending, admin, CourseReviewUpdate(decision="reject", note="重写第二章")
    )
    assert_lockstep(pending)
    assert pending.status == "rejected"


def test_course_table_forbids_divergent_status_and_visibility():
    from app.models.models import Course

    constraints = {
        item.name: str(item.sqltext)
        for item in Course.__table__.constraints
        if hasattr(item, "sqltext")
    }

    assert "ck_courses_status_visibility" in constraints
    expression = constraints["ck_courses_status_visibility"]
    assert "status" in expression and "visibility" in expression
