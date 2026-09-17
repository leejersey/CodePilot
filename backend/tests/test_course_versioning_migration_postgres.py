import asyncio
import os
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.config import Config
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.engine import make_url

from app.services import course_generation


asyncpg = pytest.importorskip("asyncpg")
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="set TEST_DATABASE_URL to a PostgreSQL server where the user can create test databases",
)

BACKEND_DIR = Path(__file__).parents[1]
BASE_REVISION = "a3b4c5d6e7f8"
# Last revision before courses gained the status/visibility lockstep constraint.
PRE_LOCKSTEP_REVISION = "c5d6e7f8a9b0"


def _dsn(url: str, database: str | None = None) -> str:
    parsed = make_url(url)
    if database is not None:
        parsed = parsed.set(database=database)
    return parsed.set(drivername="postgresql").render_as_string(hide_password=False)


async def _create_database(url: str, database: str) -> None:
    connection = await asyncpg.connect(_dsn(url, "postgres"))
    try:
        await connection.execute(f'CREATE DATABASE "{database}" TEMPLATE template0')
    finally:
        await connection.close()


async def _drop_database(url: str, database: str) -> None:
    connection = await asyncpg.connect(_dsn(url, "postgres"))
    try:
        await connection.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = $1 AND pid <> pg_backend_pid()",
            database,
        )
        await connection.execute(f'DROP DATABASE IF EXISTS "{database}"')
    finally:
        await connection.close()


def _migrate(url: str, action: str, revision: str) -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    getattr(command, action)(config, revision)


async def _execute(url: str, sql: str) -> None:
    connection = await asyncpg.connect(_dsn(url))
    try:
        await connection.execute(sql)
    finally:
        await connection.close()


async def _fetchval(url: str, sql: str):
    connection = await asyncpg.connect(_dsn(url))
    try:
        return await connection.fetchval(sql)
    finally:
        await connection.close()


async def _execute_transaction(url: str, *statements: str) -> None:
    connection = await asyncpg.connect(_dsn(url))
    try:
        async with connection.transaction():
            for statement in statements:
                await connection.execute(statement)
            await connection.execute("SET CONSTRAINTS ALL IMMEDIATE")
    finally:
        await connection.close()


async def _assert_deferred_fk_rejects(
    url: str,
    statement: str,
    constraint_name: str,
) -> None:
    connection = await asyncpg.connect(_dsn(url))
    transaction = connection.transaction()
    await transaction.start()
    try:
        await connection.execute(statement)
        with pytest.raises(asyncpg.ForeignKeyViolationError):
            await connection.execute(f"SET CONSTRAINTS {constraint_name} IMMEDIATE")
    finally:
        await transaction.rollback()
        await connection.close()


async def _exercise_stale_identity_map(
    database_url: str,
    *,
    user_id: uuid.UUID,
    course_id: uuid.UUID,
    second_version_id: uuid.UUID,
) -> None:
    engine = create_async_engine(database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    generation_started = asyncio.Event()
    concurrent_change_committed = asyncio.Event()
    original = course_generation._generate_outline_for_request

    async def delayed_outline(*_args):
        generation_started.set()
        await concurrent_change_committed.wait()
        return (
            {
                "total_chapters": 1,
                "chapters": [
                    {"order": 1, "title": "Concurrent Safety", "summary": ""}
                ],
            },
            [],
            [],
        )

    course_generation._generate_outline_for_request = delayed_outline
    try:
        async with Session() as session:
            task = asyncio.create_task(
                course_generation.rebuild_course_record(
                    session,
                    course_id,
                    {
                        "topic": None,
                        "difficulty": "advanced",
                        "user_background": "",
                        "pure_ai": True,
                        "knowledge_base_ids": [],
                    },
                    SimpleNamespace(
                        id=user_id,
                        role="admin",
                        auth_provider="email",
                    ),
                )
            )
            await generation_started.wait()
            await _execute_transaction(
                database_url,
                f"""
                INSERT INTO course_versions (
                    id, course_id, version_number, source_type, created_by
                ) VALUES (
                    '{second_version_id}', '{course_id}', 2, 'ai_generated', '{user_id}'
                )
                """,
                f"""
                UPDATE courses
                SET current_version_id = '{second_version_id}', status = 'rejected'
                WHERE id = '{course_id}'
                """,
            )
            concurrent_change_committed.set()
            with pytest.raises(HTTPException, match="发生变化"):
                await task
            await session.rollback()
    finally:
        course_generation._generate_outline_for_request = original
        await engine.dispose()

    assert await _fetchval(
        database_url,
        f"SELECT current_version_id = '{second_version_id}' FROM courses WHERE id = '{course_id}'",
    )
    assert await _fetchval(
        database_url,
        f"SELECT status = 'rejected' FROM courses WHERE id = '{course_id}'",
    )
    assert await _fetchval(
        database_url,
        f"SELECT count(*) FROM course_versions WHERE course_id = '{course_id}'",
    ) == 2


def test_rebuild_detects_concurrent_change_despite_identity_map():
    assert TEST_DATABASE_URL is not None
    database = f"codepilot_stale_test_{uuid.uuid4().hex[:12]}"
    database_url = make_url(TEST_DATABASE_URL).set(database=database).render_as_string(
        hide_password=False
    )
    user_id = uuid.uuid4()
    course_id = uuid.uuid4()
    first_version_id = uuid.uuid4()
    second_version_id = uuid.uuid4()
    asyncio.run(_create_database(TEST_DATABASE_URL, database))
    try:
        _migrate(database_url, "upgrade", "head")
        asyncio.run(
            _execute_transaction(
                database_url,
                f"""
                INSERT INTO users (id, nickname, auth_provider, role)
                VALUES ('{user_id}', 'Admin', 'email', 'admin')
                """,
                f"""
                INSERT INTO courses (
                    id, author_id, topic, difficulty, status, visibility
                ) VALUES (
                    '{course_id}', '{user_id}', 'Async Python', 'advanced',
                    'draft', 'private'
                )
                """,
                f"""
                INSERT INTO course_versions (
                    id, course_id, version_number, source_type, created_by
                ) VALUES (
                    '{first_version_id}', '{course_id}', 1, 'ai_generated', '{user_id}'
                )
                """,
                f"""
                UPDATE courses
                SET current_version_id = '{first_version_id}'
                WHERE id = '{course_id}'
                """,
            )
        )
        asyncio.run(
            _exercise_stale_identity_map(
                database_url,
                user_id=user_id,
                course_id=course_id,
                second_version_id=second_version_id,
            )
        )
    finally:
        asyncio.run(_drop_database(TEST_DATABASE_URL, database))


async def _assert_check_rejects(url: str, statement: str, constraint_name: str) -> None:
    connection = await asyncpg.connect(_dsn(url))
    try:
        with pytest.raises(asyncpg.CheckViolationError) as error:
            await connection.execute(statement)
        assert error.value.constraint_name == constraint_name
    finally:
        await connection.close()


def test_repair_migration_fixes_published_private_courses_and_locks_them():
    assert TEST_DATABASE_URL is not None
    database = f"codepilot_repair_test_{uuid.uuid4().hex[:12]}"
    database_url = make_url(TEST_DATABASE_URL).set(database=database).render_as_string(
        hide_password=False
    )
    asyncio.run(_create_database(TEST_DATABASE_URL, database))
    try:
        _migrate(database_url, "upgrade", PRE_LOCKSTEP_REVISION)
        # Reproduce exactly what b4c5d6e7f8a9 left behind for legacy paths.
        asyncio.run(
            _execute_transaction(
                database_url,
                """
                INSERT INTO users (id, nickname, auth_provider, role) VALUES
                ('10000000-0000-0000-0000-0000000000a1', 'Legacy Owner', 'email', 'creator')
                """,
                """
                INSERT INTO courses (
                    id, author_id, topic, difficulty, status, visibility, published_at
                ) VALUES (
                    '20000000-0000-0000-0000-0000000000a1',
                    '10000000-0000-0000-0000-0000000000a1',
                    'Legacy Topic', 'advanced', 'published', 'private', now()
                ),
                (
                    '20000000-0000-0000-0000-0000000000a2',
                    '10000000-0000-0000-0000-0000000000a1',
                    'Real Catalog Course', 'beginner', 'published', 'published', now()
                ),
                (
                    '20000000-0000-0000-0000-0000000000a3',
                    '10000000-0000-0000-0000-0000000000a1',
                    'Leaked Visibility', 'beginner', 'draft', 'published', NULL
                )
                """,
                """
                INSERT INTO course_versions (
                    id, course_id, version_number, source_type, created_by
                ) VALUES (
                    '21000000-0000-0000-0000-0000000000a1',
                    '20000000-0000-0000-0000-0000000000a1',
                    1, 'ai_generated', '10000000-0000-0000-0000-0000000000a1'
                )
                """,
                """
                UPDATE courses
                SET current_version_id = '21000000-0000-0000-0000-0000000000a1'
                WHERE id = '20000000-0000-0000-0000-0000000000a1'
                """,
            )
        )

        _migrate(database_url, "upgrade", "head")

        assert asyncio.run(
            _fetchval(
                database_url,
                """
                SELECT status || '|' || visibility
                       || '|' || coalesce(published_at::text, 'null')
                FROM courses WHERE id = '20000000-0000-0000-0000-0000000000a1'
                """,
            )
        ) == "draft|private|null"
        # A genuinely published course keeps its catalog visibility.
        assert asyncio.run(
            _fetchval(
                database_url,
                """
                SELECT status || '|' || visibility FROM courses
                WHERE id = '20000000-0000-0000-0000-0000000000a2'
                """,
            )
        ) == "published|published"
        assert asyncio.run(
            _fetchval(
                database_url,
                """
                SELECT status || '|' || visibility FROM courses
                WHERE id = '20000000-0000-0000-0000-0000000000a3'
                """,
            )
        ) == "draft|private"

        # The repaired row is now a normal private draft an admin can publish.
        asyncio.run(
            _execute(
                database_url,
                """
                UPDATE courses
                SET status = 'published', visibility = 'published', published_at = now()
                WHERE id = '20000000-0000-0000-0000-0000000000a1'
                """,
            )
        )
        assert asyncio.run(
            _fetchval(
                database_url,
                """
                SELECT count(*) FROM courses
                WHERE id = '20000000-0000-0000-0000-0000000000a1'
                  AND status = 'published' AND visibility = 'published'
                """,
            )
        ) == 1

        for statement in (
            """
            UPDATE courses SET visibility = 'private'
            WHERE id = '20000000-0000-0000-0000-0000000000a1'
            """,
            """
            UPDATE courses SET status = 'archived', visibility = 'published'
            WHERE id = '20000000-0000-0000-0000-0000000000a1'
            """,
            """
            INSERT INTO courses (id, author_id, topic, status, visibility)
            VALUES (
                '20000000-0000-0000-0000-0000000000a4',
                '10000000-0000-0000-0000-0000000000a1',
                'Divergent', 'published', 'private'
            )
            """,
        ):
            asyncio.run(
                _assert_check_rejects(
                    database_url,
                    statement,
                    "ck_courses_status_visibility",
                )
            )

        _migrate(database_url, "downgrade", PRE_LOCKSTEP_REVISION)
        assert asyncio.run(
            _fetchval(
                database_url,
                """
                SELECT count(*) = 0 FROM pg_constraint
                WHERE conname = 'ck_courses_status_visibility'
                """,
            )
        )
    finally:
        asyncio.run(_drop_database(TEST_DATABASE_URL, database))


def test_backfill_survives_legacy_duplicate_and_sparse_sort_orders():
    """Legacy chapter ordering was never unique, but course_chapters demands it."""
    assert TEST_DATABASE_URL is not None
    database = f"codepilot_order_test_{uuid.uuid4().hex[:12]}"
    database_url = make_url(TEST_DATABASE_URL).set(database=database).render_as_string(
        hide_password=False
    )
    asyncio.run(_create_database(TEST_DATABASE_URL, database))
    try:
        _migrate(database_url, "upgrade", BASE_REVISION)
        asyncio.run(
            _execute(
                database_url,
                """
                INSERT INTO users (id, nickname, auth_provider) VALUES
                ('10000000-0000-0000-0000-0000000000b1', 'Duplicate Owner', 'anonymous');
                INSERT INTO learning_paths (id, user_id, topic, difficulty, outline, status)
                VALUES
                (
                    '20000000-0000-0000-0000-0000000000b1',
                    '10000000-0000-0000-0000-0000000000b1',
                    'Colliding Path', 'beginner', '{"sections": 3}', 'active'
                ),
                (
                    '20000000-0000-0000-0000-0000000000b2',
                    '10000000-0000-0000-0000-0000000000b1',
                    'Sparse Path', 'beginner', '{"sections": 2}', 'active'
                );
                -- The legacy KB rebuild trusted LLM-supplied ordering, so two
                -- chapters of one path can share a sort_order.
                INSERT INTO chapters (
                    id, path_id, sort_order, title, status, created_at
                ) VALUES
                (
                    '30000000-0000-0000-0000-0000000000b3',
                    '20000000-0000-0000-0000-0000000000b1',
                    2, 'Collision Late', 'locked', '2026-01-03 00:00:00+00'
                ),
                (
                    '30000000-0000-0000-0000-0000000000b2',
                    '20000000-0000-0000-0000-0000000000b1',
                    2, 'Collision Early', 'locked', '2026-01-02 00:00:00+00'
                ),
                (
                    '30000000-0000-0000-0000-0000000000b1',
                    '20000000-0000-0000-0000-0000000000b1',
                    1, 'First', 'unlocked', '2026-01-01 00:00:00+00'
                ),
                (
                    '30000000-0000-0000-0000-0000000000b4',
                    '20000000-0000-0000-0000-0000000000b2',
                    7, 'Gap Second', 'locked', '2026-01-05 00:00:00+00'
                ),
                (
                    '30000000-0000-0000-0000-0000000000b5',
                    '20000000-0000-0000-0000-0000000000b2',
                    3, 'Gap First', 'unlocked', '2026-01-04 00:00:00+00'
                );
                """,
            )
        )

        _migrate(database_url, "upgrade", "head")

        assert asyncio.run(
            _fetchval(
                database_url,
                """
                SELECT string_agg(sort_order || ':' || title, ', ' ORDER BY sort_order)
                FROM course_chapters
                WHERE version_id = '20000000-0000-0000-0000-0000000000b1'
                """,
            )
        ) == "1:First, 2:Collision Early, 3:Collision Late"
        # A sparse legacy path becomes densely ordered without losing chapters.
        assert asyncio.run(
            _fetchval(
                database_url,
                """
                SELECT string_agg(sort_order || ':' || title, ', ' ORDER BY sort_order)
                FROM course_chapters
                WHERE version_id = '20000000-0000-0000-0000-0000000000b2'
                """,
            )
        ) == "1:Gap First, 2:Gap Second"
        # Every legacy chapter still maps 1:1 onto its course chapter.
        assert asyncio.run(
            _fetchval(
                database_url,
                """
                SELECT count(*) FROM chapters c
                JOIN course_chapters cc ON cc.legacy_chapter_id = c.id AND cc.id = c.id
                """,
            )
        ) == 5
    finally:
        asyncio.run(_drop_database(TEST_DATABASE_URL, database))


def test_course_versioning_migration_round_trip_and_integrity():
    assert TEST_DATABASE_URL is not None
    database = f"codepilot_course_test_{uuid.uuid4().hex[:12]}"
    database_url = make_url(TEST_DATABASE_URL).set(database=database).render_as_string(
        hide_password=False
    )
    asyncio.run(_create_database(TEST_DATABASE_URL, database))

    try:
        _migrate(database_url, "upgrade", BASE_REVISION)
        asyncio.run(
            _execute(
                database_url,
                """
                INSERT INTO users (id, nickname, auth_provider) VALUES
                ('10000000-0000-0000-0000-000000000001', 'Owner', 'anonymous'),
                ('10000000-0000-0000-0000-000000000002', 'Learner', 'anonymous');
                INSERT INTO learning_paths (id, user_id, topic, difficulty, outline, status)
                VALUES (
                    '20000000-0000-0000-0000-000000000001',
                    '10000000-0000-0000-0000-000000000001',
                    'Legacy Topic', 'advanced', '{"sections": 1}', 'active'
                );
                INSERT INTO chapters (
                    id, path_id, sort_order, title, summary, status, completed_at
                ) VALUES (
                    '30000000-0000-0000-0000-000000000001',
                    '20000000-0000-0000-0000-000000000001',
                    1, 'Done', 'Legacy chapter', 'completed', now()
                );
                INSERT INTO knowledge_bases (id, user_id, name, status)
                VALUES (
                    '40000000-0000-0000-0000-000000000001',
                    '10000000-0000-0000-0000-000000000001',
                    'Legacy KB', 'active'
                );
                INSERT INTO path_knowledge_bases (path_id, kb_id)
                VALUES (
                    '20000000-0000-0000-0000-000000000001',
                    '40000000-0000-0000-0000-000000000001'
                );
                """,
            )
        )

        _migrate(database_url, "upgrade", "head")

        assert asyncio.run(
            _fetchval(
                database_url,
                """
                SELECT count(*)
                FROM courses c
                JOIN course_versions v ON (v.course_id, v.id) = (c.id, c.current_version_id)
                JOIN enrollments e ON (e.course_id, e.active_version_id) = (v.course_id, v.id)
                JOIN chapter_progress p
                  ON (p.enrollment_id, p.version_id) = (e.id, e.active_version_id)
                JOIN course_chapters ch
                  ON (ch.version_id, ch.id) = (p.version_id, p.chapter_id)
                WHERE c.legacy_path_id = '20000000-0000-0000-0000-000000000001'
                  AND p.status = 'completed'
                  AND p.completed_at IS NOT NULL
                """,
            )
        ) == 1
        assert asyncio.run(
            _fetchval(
                database_url,
                """
                SELECT count(*) FROM knowledge_bases
                WHERE visibility = 'platform_public' AND approval_status = 'approved'
                """,
            )
        ) == 1
        # A migrated personal path must be an owner-editable private draft, not
        # the unreachable published/private pair.
        assert asyncio.run(
            _fetchval(
                database_url,
                """
                SELECT status || '|' || visibility FROM courses
                WHERE legacy_path_id = '20000000-0000-0000-0000-000000000001'
                """,
            )
        ) == "draft|private"

        asyncio.run(
            _execute(
                database_url,
                """
                INSERT INTO courses (id, author_id, topic, status, visibility)
                VALUES (
                    '20000000-0000-0000-0000-000000000002',
                    '10000000-0000-0000-0000-000000000001',
                    'Other Course', 'draft', 'private'
                );
                INSERT INTO course_versions (
                    id, course_id, version_number, source_type, created_by
                ) VALUES (
                    '21000000-0000-0000-0000-000000000002',
                    '20000000-0000-0000-0000-000000000002',
                    1, 'ai_generated',
                    '10000000-0000-0000-0000-000000000001'
                );
                INSERT INTO course_chapters (id, version_id, sort_order, title)
                VALUES (
                    '31000000-0000-0000-0000-000000000002',
                    '21000000-0000-0000-0000-000000000002',
                    1, 'Other Chapter'
                );
                """,
            )
        )

        asyncio.run(
            _assert_deferred_fk_rejects(
                database_url,
                """
                UPDATE courses
                SET current_version_id = '21000000-0000-0000-0000-000000000002'
                WHERE id = '20000000-0000-0000-0000-000000000001'
                """,
                "fk_courses_current_version_same_course",
            )
        )
        asyncio.run(
            _assert_deferred_fk_rejects(
                database_url,
                """
                INSERT INTO enrollments (id, user_id, course_id, active_version_id)
                VALUES (
                    '50000000-0000-0000-0000-000000000002',
                    '10000000-0000-0000-0000-000000000002',
                    '20000000-0000-0000-0000-000000000001',
                    '21000000-0000-0000-0000-000000000002'
                )
                """,
                "fk_enrollments_active_version_same_course",
            )
        )
        asyncio.run(
            _assert_deferred_fk_rejects(
                database_url,
                """
                INSERT INTO chapter_progress (
                    id, enrollment_id, version_id, chapter_id, status
                ) VALUES (
                    '60000000-0000-0000-0000-000000000001',
                    '20000000-0000-0000-0000-000000000001',
                    '20000000-0000-0000-0000-000000000001',
                    '31000000-0000-0000-0000-000000000002',
                    'locked'
                )
                """,
                "fk_chapter_progress_chapter_version",
            )
        )
        asyncio.run(
            _assert_deferred_fk_rejects(
                database_url,
                """
                INSERT INTO chapter_progress (
                    id, enrollment_id, version_id, chapter_id, status
                ) VALUES (
                    '60000000-0000-0000-0000-000000000002',
                    '20000000-0000-0000-0000-000000000001',
                    '21000000-0000-0000-0000-000000000002',
                    '31000000-0000-0000-0000-000000000002',
                    'locked'
                )
                """,
                "fk_chapter_progress_enrollment_active_version",
            )
        )
        asyncio.run(
            _execute(
                database_url,
                """
                INSERT INTO course_version_events (
                    id, course_id, from_version_id, to_version_id, actor_id, event_type
                ) VALUES (
                    '70000000-0000-0000-0000-000000000001',
                    '20000000-0000-0000-0000-000000000001',
                    NULL,
                    '20000000-0000-0000-0000-000000000001',
                    '10000000-0000-0000-0000-000000000001',
                    'generated'
                )
                """,
            )
        )
        asyncio.run(
            _assert_deferred_fk_rejects(
                database_url,
                """
                INSERT INTO course_version_events (
                    id, course_id, from_version_id, to_version_id, actor_id, event_type
                ) VALUES (
                    '70000000-0000-0000-0000-000000000002',
                    '20000000-0000-0000-0000-000000000001',
                    NULL,
                    '21000000-0000-0000-0000-000000000002',
                    '10000000-0000-0000-0000-000000000001',
                    'rebuilt'
                )
                """,
                "fk_course_version_events_to_same_course",
            )
        )
        with pytest.raises(asyncpg.ForeignKeyViolationError):
            asyncio.run(
                _execute(
                    database_url,
                    """
                    DELETE FROM knowledge_bases
                    WHERE id = '40000000-0000-0000-0000-000000000001'
                    """,
                )
            )

        asyncio.run(
            _execute(
                database_url,
                """
                INSERT INTO course_versions (
                    id, course_id, version_number, source_type, created_by
                ) VALUES (
                    '21000000-0000-0000-0000-000000000001',
                    '20000000-0000-0000-0000-000000000001',
                    2, 'ai_generated',
                    '10000000-0000-0000-0000-000000000001'
                );
                INSERT INTO course_chapters (id, version_id, sort_order, title)
                VALUES (
                    '31000000-0000-0000-0000-000000000001',
                    '21000000-0000-0000-0000-000000000001',
                    1, 'Chapter V2'
                );
                """,
            )
        )
        asyncio.run(
            _execute_transaction(
                database_url,
                """
                UPDATE enrollments
                SET active_version_id = '21000000-0000-0000-0000-000000000001'
                WHERE id = '20000000-0000-0000-0000-000000000001'
                """,
                """
                UPDATE chapter_progress
                SET version_id = '21000000-0000-0000-0000-000000000001',
                    chapter_id = '31000000-0000-0000-0000-000000000001'
                WHERE enrollment_id = '20000000-0000-0000-0000-000000000001'
                """,
                """
                UPDATE courses
                SET current_version_id = '21000000-0000-0000-0000-000000000001'
                WHERE id = '20000000-0000-0000-0000-000000000001'
                """,
            )
        )
        assert asyncio.run(
            _fetchval(
                database_url,
                """
                SELECT count(*) FROM chapter_progress
                WHERE enrollment_id = '20000000-0000-0000-0000-000000000001'
                  AND version_id = '21000000-0000-0000-0000-000000000001'
                  AND chapter_id = '31000000-0000-0000-0000-000000000001'
                """,
            )
        ) == 1

        redundant_indexes = asyncio.run(
            _fetchval(
                database_url,
                """
                SELECT count(*) FROM pg_indexes
                WHERE schemaname = 'public' AND indexname = ANY(ARRAY[
                    'ix_course_versions_course_id',
                    'ix_course_chapters_version_id',
                    'ix_enrollments_user_id',
                    'ix_chapter_progress_enrollment_id'
                ])
                """,
            )
        )
        assert redundant_indexes == 0

        _migrate(database_url, "downgrade", BASE_REVISION)
        assert asyncio.run(
            _fetchval(database_url, "SELECT count(*) FROM learning_paths")
        ) == 1
        assert asyncio.run(
            _fetchval(database_url, "SELECT to_regclass('public.courses') IS NULL")
        )
        assert asyncio.run(
            _fetchval(
                database_url,
                """
                SELECT count(*) = 0 FROM information_schema.columns
                WHERE table_name = 'knowledge_bases'
                  AND column_name IN ('visibility', 'approval_status')
                """,
            )
        )
    finally:
        asyncio.run(_drop_database(TEST_DATABASE_URL, database))
