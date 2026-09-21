"""Unit tests for permanent course deletion rules."""

import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services.course_access import (
    DELETABLE_COURSE_STATUSES,
    assert_course_can_be_deleted,
)


def course(**overrides):
    base = {
        "id": uuid.uuid4(),
        "author_id": uuid.uuid4(),
        "status": "draft",
        "legacy_path_id": uuid.uuid4(),
        "current_version_id": uuid.uuid4(),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def user(role="admin", user_id=None):
    return SimpleNamespace(id=user_id or uuid.uuid4(), role=role)


def test_deletable_statuses_are_private_only():
    assert DELETABLE_COURSE_STATUSES == frozenset({"draft", "rejected"})


def test_admin_can_delete_draft():
    target = course(status="draft")
    assert_course_can_be_deleted(target, user("admin"))


def test_author_can_delete_own_rejected():
    author_id = uuid.uuid4()
    target = course(status="rejected", author_id=author_id)
    assert_course_can_be_deleted(target, user("creator", author_id))


def test_non_author_creator_cannot_delete():
    target = course(status="draft")
    with pytest.raises(HTTPException) as error:
        assert_course_can_be_deleted(target, user("creator"))
    assert error.value.status_code == 403


def test_published_must_archive_not_delete():
    target = course(status="published")
    with pytest.raises(HTTPException) as error:
        assert_course_can_be_deleted(target, user("admin"))
    assert error.value.status_code == 409
    assert "归档" in error.value.detail


def test_pending_review_cannot_be_deleted():
    target = course(status="pending_review")
    with pytest.raises(HTTPException) as error:
        assert_course_can_be_deleted(target, user("admin"))
    assert error.value.status_code == 409
