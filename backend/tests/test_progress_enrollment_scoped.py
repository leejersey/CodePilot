"""Dashboard analytics must report per-enrollment progress, not frozen legacy state.

The course migration maps every pre-existing chapter into ``course_chapters`` and
moves learner state into ``chapter_progress``; ``chapters.status`` is frozen at its
pre-migration value from then on. These tests seed a database where the two
deliberately disagree, so any endpoint still reading the shared column fails.
"""

import asyncio
import os
import uuid
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.v1 import progress as progress_api

asyncpg = pytest.importorskip("asyncpg")
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="set TEST_DATABASE_URL to a PostgreSQL server where the user can create test databases",
)

BACKEND_DIR = Path(__file__).parents[1]

LEARNER = "10000000-0000-0000-0000-0000000000a1"
SOLO = "10000000-0000-0000-0000-0000000000a2"
PEER = "10000000-0000-0000-0000-0000000000a3"

PATH_MAPPED = "20000000-0000-0000-0000-0000000000b1"
PATH_PERSONAL = "20000000-0000-0000-0000-0000000000b2"
PATH_ARCHIVED = "20000000-0000-0000-0000-0000000000b3"
PATH_EMPTY = "20000000-0000-0000-0000-0000000000b4"
PATH_SOLO = "20000000-0000-0000-0000-0000000000b5"

CH_MAPPED_1 = "30000000-0000-0000-0000-0000000000c1"
CH_MAPPED_2 = "30000000-0000-0000-0000-0000000000c2"
CH_MAPPED_3 = "30000000-0000-0000-0000-0000000000c3"
CH_PERSONAL_1 = "30000000-0000-0000-0000-0000000000c4"
CH_PERSONAL_2 = "30000000-0000-0000-0000-0000000000c5"
CH_ARCHIVED_1 = "30000000-0000-0000-0000-0000000000c6"
CH_SOLO_1 = "30000000-0000-0000-0000-0000000000c7"
CH_SOLO_2 = "30000000-0000-0000-0000-0000000000c8"

COURSE_MAPPED = "40000000-0000-0000-0000-0000000000d1"
COURSE_SOLO = "40000000-0000-0000-0000-0000000000d2"
VERSION_MAPPED = "41000000-0000-0000-0000-0000000000e1"
VERSION_SOLO = "41000000-0000-0000-0000-0000000000e2"

CC_MAPPED_1 = "42000000-0000-0000-0000-0000000000f1"
CC_MAPPED_2 = "42000000-0000-0000-0000-0000000000f2"
CC_MAPPED_3 = "42000000-0000-0000-0000-0000000000f3"
CC_SOLO_1 = "42000000-0000-0000-0000-0000000000f7"
CC_SOLO_2 = "42000000-0000-0000-0000-0000000000f8"

ENROLL_LEARNER = "50000000-0000-0000-0000-00000000a001"
ENROLL_PEER = "50000000-0000-0000-0000-00000000a002"

TODAY = date.today()
YESTERDAY = TODAY - timedelta(days=1)


def _stamp(day: date) -> str:
    """Midday UTC, so ``date()`` in a UTC session renders exactly ``day``."""
    return f"TIMESTAMPTZ '{day} 12:00:00+00'"


def _dsn(url: str, database: str | None = None) -> str:
    parsed = make_url(url)
    if database is not None:
        parsed = parsed.set(database=database)
    return parsed.set(drivername="postgresql").render_as_string(hide_password=False)


async def _create_database(url: str, database: str) -> None:
    connection = await asyncpg.connect(_dsn(url, "postgres"))
    try:
        await connection.execute(f'CREATE DATABASE "{database}" TEMPLATE template0')
        # The endpoints bucket completed_at with SQL date() but compare against
        # Python's date.today(); pin both sides to the seeded UTC timestamps.
        await connection.execute(f"""ALTER DATABASE "{database}" SET timezone TO 'UTC'""")
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


async def _seed(url: str) -> None:
    connection = await asyncpg.connect(_dsn(url))
    try:
        async with connection.transaction():
            for statement in _SEED_STATEMENTS:
                await connection.execute(statement)
            await connection.execute("SET CONSTRAINTS ALL IMMEDIATE")
    finally:
        await connection.close()


_SEED_STATEMENTS = (
    f"""
    INSERT INTO users (id, nickname, auth_provider, role) VALUES
    ('{LEARNER}', 'Learner', 'email', 'user'),
    ('{SOLO}', 'Solo', 'email', 'user'),
    ('{PEER}', 'Peer', 'email', 'user')
    """,
    f"""
    INSERT INTO learning_paths (id, user_id, topic, difficulty, outline, status) VALUES
    ('{PATH_MAPPED}', '{LEARNER}', 'Mapped Topic', 'advanced', '{{}}', 'active'),
    ('{PATH_PERSONAL}', '{LEARNER}', 'Personal Topic', 'beginner', '{{}}', 'active'),
    ('{PATH_ARCHIVED}', '{LEARNER}', 'Archived Topic', 'beginner', '{{}}', 'archived'),
    ('{PATH_EMPTY}', '{LEARNER}', 'Empty Topic', 'beginner', '{{}}', 'active'),
    ('{PATH_SOLO}', '{SOLO}', 'Solo Topic', 'beginner', '{{}}', 'active')
    """,
    # chapters.status/completed_at are the frozen pre-migration values. For the
    # mapped path they contradict chapter_progress on purpose.
    f"""
    INSERT INTO chapters (id, path_id, sort_order, title, status, completed_at) VALUES
    ('{CH_MAPPED_1}', '{PATH_MAPPED}', 1, 'Mapped One', 'completed', TIMESTAMPTZ '2020-01-01 12:00:00+00'),
    ('{CH_MAPPED_2}', '{PATH_MAPPED}', 2, 'Mapped Two', 'locked', NULL),
    ('{CH_MAPPED_3}', '{PATH_MAPPED}', 3, 'Mapped Three', 'locked', NULL),
    ('{CH_PERSONAL_1}', '{PATH_PERSONAL}', 1, 'Personal One', 'completed', {_stamp(TODAY)}),
    ('{CH_PERSONAL_2}', '{PATH_PERSONAL}', 2, 'Personal Two', 'locked', NULL),
    ('{CH_ARCHIVED_1}', '{PATH_ARCHIVED}', 1, 'Archived One', 'completed', TIMESTAMPTZ '2020-03-03 12:00:00+00'),
    ('{CH_SOLO_1}', '{PATH_SOLO}', 1, 'Solo One', 'completed', TIMESTAMPTZ '2020-05-05 12:00:00+00'),
    ('{CH_SOLO_2}', '{PATH_SOLO}', 2, 'Solo Two', 'locked', NULL)
    """,
    f"""
    INSERT INTO courses (id, author_id, topic, difficulty, status, visibility, legacy_path_id) VALUES
    ('{COURSE_MAPPED}', '{LEARNER}', 'Mapped Topic', 'advanced', 'draft', 'private', '{PATH_MAPPED}'),
    ('{COURSE_SOLO}', '{SOLO}', 'Solo Topic', 'beginner', 'draft', 'private', '{PATH_SOLO}')
    """,
    f"""
    INSERT INTO course_versions (id, course_id, version_number, source_type, created_by) VALUES
    ('{VERSION_MAPPED}', '{COURSE_MAPPED}', 1, 'ai_generated', '{LEARNER}'),
    ('{VERSION_SOLO}', '{COURSE_SOLO}', 1, 'ai_generated', '{SOLO}')
    """,
    f"""
    UPDATE courses SET current_version_id = '{VERSION_MAPPED}' WHERE id = '{COURSE_MAPPED}'
    """,
    f"""
    UPDATE courses SET current_version_id = '{VERSION_SOLO}' WHERE id = '{COURSE_SOLO}'
    """,
    f"""
    INSERT INTO course_chapters (id, version_id, sort_order, title, legacy_chapter_id) VALUES
    ('{CC_MAPPED_1}', '{VERSION_MAPPED}', 1, 'Mapped One', '{CH_MAPPED_1}'),
    ('{CC_MAPPED_2}', '{VERSION_MAPPED}', 2, 'Mapped Two', '{CH_MAPPED_2}'),
    ('{CC_MAPPED_3}', '{VERSION_MAPPED}', 3, 'Mapped Three', '{CH_MAPPED_3}'),
    ('{CC_SOLO_1}', '{VERSION_SOLO}', 1, 'Solo One', '{CH_SOLO_1}'),
    ('{CC_SOLO_2}', '{VERSION_SOLO}', 2, 'Solo Two', '{CH_SOLO_2}')
    """,
    # SOLO owns a mapped path but never enrolled, so its state stays on chapters.
    f"""
    INSERT INTO enrollments (id, user_id, course_id, active_version_id, status) VALUES
    ('{ENROLL_LEARNER}', '{LEARNER}', '{COURSE_MAPPED}', '{VERSION_MAPPED}', 'active'),
    ('{ENROLL_PEER}', '{PEER}', '{COURSE_MAPPED}', '{VERSION_MAPPED}', 'active')
    """,
    f"""
    INSERT INTO chapter_progress (
        id, enrollment_id, version_id, chapter_id, status, completed_at
    ) VALUES
    ('60000000-0000-0000-0000-000000000001', '{ENROLL_LEARNER}', '{VERSION_MAPPED}', '{CC_MAPPED_1}', 'in_progress', NULL),
    ('60000000-0000-0000-0000-000000000002', '{ENROLL_LEARNER}', '{VERSION_MAPPED}', '{CC_MAPPED_2}', 'completed', {_stamp(TODAY)}),
    ('60000000-0000-0000-0000-000000000003', '{ENROLL_LEARNER}', '{VERSION_MAPPED}', '{CC_MAPPED_3}', 'completed', {_stamp(YESTERDAY)}),
    ('60000000-0000-0000-0000-000000000011', '{ENROLL_PEER}', '{VERSION_MAPPED}', '{CC_MAPPED_1}', 'locked', NULL),
    ('60000000-0000-0000-0000-000000000012', '{ENROLL_PEER}', '{VERSION_MAPPED}', '{CC_MAPPED_2}', 'locked', NULL),
    ('60000000-0000-0000-0000-000000000013', '{ENROLL_PEER}', '{VERSION_MAPPED}', '{CC_MAPPED_3}', 'locked', NULL)
    """,
)


@pytest.fixture(scope="module")
def database_url():
    assert TEST_DATABASE_URL is not None
    database = f"codepilot_progress_test_{uuid.uuid4().hex[:12]}"
    url = make_url(TEST_DATABASE_URL).set(database=database).render_as_string(
        hide_password=False
    )
    asyncio.run(_create_database(TEST_DATABASE_URL, database))
    try:
        _migrate(url, "upgrade", "head")
        asyncio.run(_seed(url))
        yield url
    finally:
        asyncio.run(_drop_database(TEST_DATABASE_URL, database))


def _user(user_id: str) -> SimpleNamespace:
    return SimpleNamespace(id=uuid.UUID(user_id), auth_provider="email", role="user")


def _call(database_url: str, endpoint, user_id: str):
    async def run():
        engine = create_async_engine(database_url)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with Session() as session:
                return await endpoint(db=session, user=_user(user_id))
        finally:
            await engine.dispose()

    return asyncio.run(run())


def test_stats_counts_use_enrollment_progress_for_mapped_chapters(database_url):
    stats = _call(database_url, progress_api.get_progress_stats, LEARNER)

    # 6 chapters across the learner's four paths. Effective completions are the
    # two mapped chapters from chapter_progress plus the personal and archived
    # chapters that still live on chapters.status. The frozen shared columns
    # would instead report 3 completed / 0 in progress.
    assert stats["chapters"]["total"] == 6
    assert stats["chapters"]["completed"] == 4
    assert stats["chapters"]["in_progress"] == 1
    assert stats["chapters"]["completion_rate"] == 67


def test_streak_uses_enrollment_completion_dates(database_url):
    stats = _call(database_url, progress_api.get_progress_stats, LEARNER)

    # chapter_progress completed today and yesterday; the frozen chapters rows
    # only offer today (personal) and 2020 dates, which would yield 1.
    assert stats["streak_days"] == 2


def test_paths_progress_uses_enrollment_progress(database_url):
    paths = _call(database_url, progress_api.get_user_paths, LEARNER)
    by_topic = {item["topic"]: item for item in paths}

    assert "Archived Topic" not in by_topic
    assert by_topic["Mapped Topic"]["total_chapters"] == 3
    assert by_topic["Mapped Topic"]["completed_chapters"] == 2
    assert by_topic["Mapped Topic"]["progress"] == 67
    assert by_topic["Personal Topic"]["completed_chapters"] == 1
    assert by_topic["Empty Topic"]["total_chapters"] == 0
    assert by_topic["Empty Topic"]["progress"] == 0


def test_skill_distribution_uses_enrollment_progress(database_url):
    skills = _call(database_url, progress_api.get_skill_distribution, LEARNER)
    by_topic = {item["topic"]: item for item in skills}

    assert by_topic["Mapped Topic"] == {
        "topic": "Mapped Topic",
        "total": 3,
        "completed": 2,
        "mastery": 67,
    }
    assert by_topic["Personal Topic"]["completed"] == 1
    assert by_topic["Archived Topic"]["completed"] == 1
    assert "Empty Topic" not in by_topic


def test_unmapped_and_unenrolled_paths_still_read_shared_chapter_state(database_url):
    stats = _call(database_url, progress_api.get_progress_stats, SOLO)

    # SOLO owns a mapped path but never enrolled, so there is no per-enrollment
    # state to prefer and chapters.status remains the only source of truth.
    assert stats["chapters"]["total"] == 2
    assert stats["chapters"]["completed"] == 1
    assert stats["chapters"]["in_progress"] == 0

    paths = _call(database_url, progress_api.get_user_paths, SOLO)
    assert [(item["topic"], item["completed_chapters"]) for item in paths] == [
        ("Solo Topic", 1)
    ]


def test_another_learners_progress_never_leaks_into_the_caller(database_url):
    # PEER shares the course but owns no learning path of their own.
    stats = _call(database_url, progress_api.get_progress_stats, PEER)
    assert stats["chapters"] == {
        "total": 0,
        "completed": 0,
        "in_progress": 0,
        "completion_rate": 0,
    }
    assert _call(database_url, progress_api.get_user_paths, PEER) == []
    assert _call(database_url, progress_api.get_skill_distribution, PEER) == []
