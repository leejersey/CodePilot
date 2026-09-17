import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app import main
from app.api.v1 import courses
from app.api.v1.admin_users import _ensure_not_last_super_admin
from app.core.config import Settings, validate_runtime_security
from app.core.security import create_access_token
from app.services.api_rate_limit import _identity


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.parametrize("environment", ["production", "staging", "PRODUCTION"])
@pytest.mark.parametrize(
    "secret",
    ["", "codepilot-dev-secret-change-in-production"],
)
def test_nondevelopment_startup_rejects_empty_or_default_jwt_secret(
    environment, secret
):
    settings = Settings(
        APP_ENV=environment,
        JWT_SECRET_KEY=secret,
        _env_file=None,
    )
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        validate_runtime_security(settings)


def test_development_allows_default_jwt_secret():
    validate_runtime_security(
        Settings(
            APP_ENV="development",
            JWT_SECRET_KEY="codepilot-dev-secret-change-in-production",
            _env_file=None,
        )
    )


def test_production_accepts_nondefault_jwt_secret():
    validate_runtime_security(
        Settings(
            APP_ENV="production",
            JWT_SECRET_KEY="a-long-random-production-secret",
            _env_file=None,
        )
    )


@pytest.mark.anyio
async def test_lifespan_validates_secret_before_starting_dependencies(monkeypatch):
    dependency_started = False

    def reject(_settings):
        raise RuntimeError("JWT_SECRET_KEY rejected")

    async def start_dependency():
        nonlocal dependency_started
        dependency_started = True

    monkeypatch.setattr(main, "validate_runtime_security", reject)
    monkeypatch.setattr(main, "get_redis", start_dependency)

    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        async with main.lifespan(SimpleNamespace()):
            pass
    assert not dependency_started


def test_unsigned_anonymous_header_cannot_partition_rate_limit_identity():
    base_scope = {
        "type": "http",
        "path": "/api/v1/auth/anonymous",
        "client": ("203.0.113.9", 5000),
    }
    first = {
        **base_scope,
        "headers": [(b"x-anonymous-id", str(uuid.uuid4()).encode())],
    }
    second = {
        **base_scope,
        "headers": [(b"x-anonymous-id", str(uuid.uuid4()).encode())],
    }

    assert _identity(first) == "ip:203.0.113.9"
    assert _identity(second) == _identity(first)


def test_anonymous_session_endpoint_is_ip_limited_even_with_signed_token():
    token = create_access_token(
        {
            "sub": str(uuid.uuid4()),
            "auth_version": 1,
            "token_kind": "anonymous",
        }
    )
    scope = {
        "type": "http",
        "path": "/api/v1/auth/anonymous",
        "client": ("203.0.113.10", 5000),
        "headers": [(b"authorization", f"Bearer {token}".encode())],
    }

    assert _identity(scope) == "ip:203.0.113.10"


class LockResult:
    def __init__(self, *, value=None, values=()):
        self.value = value
        self.values = list(values)

    def scalar_one_or_none(self):
        return self.value

    def scalars(self):
        return SimpleNamespace(all=lambda: self.values)


class SuperAdminLockDb:
    def __init__(self, active_super_admin_ids):
        self.ids = active_super_admin_ids
        self.queries = []

    async def execute(self, query):
        self.queries.append(query)
        return LockResult(values=self.ids)

    async def scalar(self, _query):
        return len(self.ids)


@pytest.mark.anyio
async def test_last_super_admin_check_locks_all_active_super_admin_rows():
    target = SimpleNamespace(
        id=uuid.uuid4(),
        role="super_admin",
        status="active",
    )
    db = SuperAdminLockDb([target.id, uuid.uuid4()])

    await _ensure_not_last_super_admin(db, target, removes_access=True)

    assert len(db.queries) == 1
    assert db.queries[0]._for_update_arg is not None


@pytest.mark.anyio
async def test_last_super_admin_lock_rejects_single_remaining_row():
    target = SimpleNamespace(
        id=uuid.uuid4(),
        role="super_admin",
        status="active",
    )
    with pytest.raises(HTTPException, match="必须保留"):
        await _ensure_not_last_super_admin(
            SuperAdminLockDb([target.id]),
            target,
            removes_access=True,
        )


class CourseLockDb:
    def __init__(self, target):
        self.target = target
        self.queries = []

    async def execute(self, query):
        self.queries.append(query)
        return LockResult(value=self.target)


@pytest.mark.anyio
async def test_course_transition_lookup_uses_row_lock():
    target = SimpleNamespace(id=uuid.uuid4())
    db = CourseLockDb(target)

    assert await courses._course_or_404(db, target.id, for_update=True) is target
    assert db.queries[0]._for_update_arg is not None


@pytest.mark.anyio
async def test_my_enrollments_uses_one_paginated_aggregate_query():
    now = datetime.now(timezone.utc)
    enrollment = SimpleNamespace(
        id=uuid.uuid4(),
        course_id=uuid.uuid4(),
        active_version_id=uuid.uuid4(),
        status="active",
        enrolled_at=now,
    )
    course = SimpleNamespace(
        id=enrollment.course_id,
        author_id=uuid.uuid4(),
        topic="Concurrency",
        difficulty="advanced",
        status="published",
        visibility="published",
        learning_path_id=None,
        created_at=now,
        updated_at=now,
    )
    row = SimpleNamespace(
        Enrollment=enrollment,
        Course=course,
        total_chapters=4,
        completed_chapters=1,
    )

    class Db:
        def __init__(self):
            self.queries = []

        async def execute(self, query):
            self.queries.append(query)
            return SimpleNamespace(all=lambda: [row])

    db = Db()
    user = SimpleNamespace(
        id=uuid.uuid4(),
        auth_provider="email",
    )
    response = await courses.my_enrollments(
        page=2,
        page_size=5,
        db=db,
        user=user,
    )

    assert len(db.queries) == 1
    sql = str(db.queries[0])
    assert "GROUP BY chapter_progress.enrollment_id" in sql
    assert "LIMIT" in sql and "OFFSET" in sql
    assert response[0]["total_chapters"] == 4
    assert response[0]["completed_chapters"] == 1
    assert response[0]["progress"] == 25
