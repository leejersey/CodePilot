"""Governance rules for the legacy learning-path and legacy chapter routes."""

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1 import exercises, paths
from app.models import models
from app.services.course_access import can_access_legacy_chapter


@pytest.fixture
def anyio_backend():
    return "asyncio"


def actor(role="learner", *, auth_provider="email"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        role=role,
        auth_provider=auth_provider,
        preferences={},
    )


def legacy_path(owner_id, *, chapters=(), knowledge_bases=()):
    return models.LearningPath(
        id=uuid.uuid4(),
        user_id=owner_id,
        topic="Async Python",
        difficulty="advanced",
        outline={"chapters": [{"order": 1, "title": "Old", "summary": "Old"}]},
        status="active",
        chapters=list(chapters),
        knowledge_bases=list(knowledge_bases),
    )


def legacy_chapter(path_id, *, sort_order=1, title="Old"):
    return models.Chapter(
        id=uuid.uuid4(),
        path_id=path_id,
        sort_order=sort_order,
        title=title,
        summary="Old",
        status="unlocked",
    )


def mapped_course(author_id, path_id, *, status="published", visibility="published"):
    return models.Course(
        id=uuid.uuid4(),
        author_id=author_id,
        topic="Async Python",
        difficulty="advanced",
        status=status,
        visibility=visibility,
        current_version_id=uuid.uuid4(),
        legacy_path_id=path_id,
    )


class ScriptedResult:
    def __init__(self, *, scalar=None, scalars=(), rows=()):
        self.scalar_value = scalar
        self.scalar_values = list(scalars)
        self.rows = list(rows)

    def scalar_one_or_none(self):
        return self.scalar_value

    def scalar_one(self):
        return self.scalar_value

    def scalars(self):
        return SimpleNamespace(all=lambda: self.scalar_values)

    def all(self):
        return self.rows

    def first(self):
        return self.rows[0] if self.rows else None


class PathDb:
    """Serves the legacy path lookup plus the mapped-course governance probe."""

    def __init__(self, *, path, course=None, results=()):
        self.path = path
        self.course = course
        self.statements = []
        self.added = []
        self.deleted = []
        self.committed = False
        self.extra_results = list(results)

    async def execute(self, statement):
        self.statements.append(statement)
        sql = str(statement)
        if sql.startswith("SELECT") and "FROM learning_paths" in sql:
            return ScriptedResult(scalar=self.path)
        if self.extra_results:
            return self.extra_results.pop(0)
        return ScriptedResult()

    async def scalar(self, statement):
        self.statements.append(statement)
        return self.course

    def add(self, value):
        self.added.append(value)

    def add_all(self, values):
        self.added.extend(values)

    async def flush(self):
        for value in self.added:
            if getattr(value, "id", None) is None:
                value.id = uuid.uuid4()

    async def delete(self, value):
        self.deleted.append(value)

    async def commit(self):
        self.committed = True

    async def refresh(self, _value, **_kwargs):
        return None


def statement_sql(db):
    return [str(statement) for statement in db.statements]


def unreachable_generation(name):
    async def _fail(*_args, **_kwargs):
        raise AssertionError(f"{name} reached for a governed course")

    return _fail


def stub_unmapped_rebuild(monkeypatch, *, outline, kb):
    async def ready_ids(*_args, **_kwargs):
        return [kb.id]

    async def load(*_args, **_kwargs):
        return [kb]

    async def relevant(*_args, **_kwargs):
        return [kb], ["stage-01.md"]

    async def snippets(*_args, **_kwargs):
        return "知识库片段"

    async def generate(*_args, **_kwargs):
        return outline

    async def cache_noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr(paths, "list_platform_ready_kb_ids", ready_ids)
    monkeypatch.setattr(paths, "load_kbs_by_ids", load)
    monkeypatch.setattr(paths, "filter_kbs_relevant_to_topic", relevant)
    monkeypatch.setattr(paths, "get_kb_snippets_for_outline", snippets)
    monkeypatch.setattr(paths, "_generate_outline", generate)
    monkeypatch.setattr(paths, "cache_delete", cache_noop)


@pytest.mark.anyio
@pytest.mark.parametrize("role", ["creator", "admin"])
async def test_legacy_rebuild_is_refused_for_mapped_course(monkeypatch, role):
    author = actor("creator")
    caller = author if role == "creator" else actor("admin")
    path = legacy_path(author.id)
    path.chapters = [legacy_chapter(path.id)]
    course = mapped_course(author.id, path.id)
    db = PathDb(path=path, course=course)

    monkeypatch.setattr(
        paths, "_generate_outline", unreachable_generation("_generate_outline")
    )
    monkeypatch.setattr(
        paths,
        "list_platform_ready_kb_ids",
        unreachable_generation("list_platform_ready_kb_ids"),
    )

    with pytest.raises(HTTPException) as error:
        await paths.rebuild_path_from_kb(path.id, body=None, db=db, user=caller)

    assert error.value.status_code == 409
    assert str(course.id) in error.value.detail
    assert "courses" in error.value.detail
    assert not db.committed
    assert not any("DELETE FROM" in sql for sql in statement_sql(db))


@pytest.mark.anyio
async def test_unmapped_legacy_rebuild_archives_history_instead_of_deleting_it(
    monkeypatch,
):
    owner = actor("learner")
    path = legacy_path(owner.id)
    old_chapters = [
        legacy_chapter(path.id, sort_order=1, title="Old One"),
        legacy_chapter(path.id, sort_order=2, title="Old Two"),
    ]
    path.chapters = old_chapters
    old_outline = path.outline
    kb = models.KnowledgeBase(
        id=uuid.uuid4(),
        user_id=owner.id,
        name="Platform KB",
        status="active",
        visibility="platform_public",
        approval_status="approved",
    )
    new_outline = {
        "total_chapters": 2,
        "chapters": [
            {"order": 1, "title": "New One", "summary": "First"},
            {"order": 2, "title": "New Two", "summary": "Second"},
        ],
    }
    stub_unmapped_rebuild(monkeypatch, outline=new_outline, kb=kb)
    db = PathDb(path=path, course=None)

    rebuilt = await paths.rebuild_path_from_kb(path.id, body=None, db=db, user=owner)

    sql = statement_sql(db)
    assert rebuilt is path
    assert db.committed
    assert not any(
        table in single
        for single in sql
        for table in (
            "DELETE FROM exercise_submissions",
            "DELETE FROM exercises",
            "DELETE FROM chapters",
        )
    )
    assert not any("UPDATE conversations" in single for single in sql)

    snapshots = [
        item
        for item in db.added
        if isinstance(item, models.LearningPath) and item.status == "archived"
    ]
    assert len(snapshots) == 1
    assert snapshots[0].outline == old_outline
    assert snapshots[0].user_id == owner.id
    reparent = next(
        statement
        for statement in db.statements
        if str(statement).startswith("UPDATE chapters")
    )
    assert reparent.compile().params["path_id"] == snapshots[0].id
    assert [item.title for item in db.added if isinstance(item, models.Chapter)] == [
        "New One",
        "New Two",
    ]
    assert path.outline == new_outline


@pytest.mark.anyio
@pytest.mark.parametrize("role", ["creator", "admin"])
async def test_mapped_published_course_path_cannot_be_deleted(role):
    author = actor("creator")
    caller = author if role == "creator" else actor("admin")
    path = legacy_path(author.id)
    path.chapters = [legacy_chapter(path.id)]
    course = mapped_course(author.id, path.id)
    db = PathDb(path=path, course=course)

    with pytest.raises(HTTPException) as error:
        await paths.delete_path(path.id, db=db, user=caller)

    assert error.value.status_code == 409
    assert db.deleted == []
    assert not db.committed


@pytest.mark.anyio
async def test_mapped_draft_course_path_delete_requires_admin():
    author = actor("creator")
    path = legacy_path(author.id)
    course = mapped_course(author.id, path.id, status="draft", visibility="private")

    author_db = PathDb(path=path, course=course)
    with pytest.raises(HTTPException) as error:
        await paths.delete_path(path.id, db=author_db, user=author)
    assert error.value.status_code == 403
    assert author_db.deleted == []

    admin_db = PathDb(path=path, course=course)
    assert await paths.delete_path(path.id, db=admin_db, user=actor("admin")) is None
    assert admin_db.deleted == [path]


@pytest.mark.anyio
async def test_personal_unmapped_legacy_path_is_still_deletable():
    owner = actor("learner")
    path = legacy_path(owner.id)
    db = PathDb(path=path, course=None)

    assert await paths.delete_path(path.id, db=db, user=owner) is None
    assert db.deleted == [path]
    assert db.committed


@pytest.mark.anyio
async def test_path_knowledge_bases_follow_shared_legacy_access_rule(monkeypatch):
    admin = actor("admin")
    path = legacy_path(uuid.uuid4(), knowledge_bases=[])
    calls = []

    async def allow(_db, target, user):
        calls.append((target, user))
        return True

    async def deny(_db, _target, _user):
        return False

    monkeypatch.setattr(paths, "can_access_legacy_path", allow)
    assert await paths.get_path_knowledge_bases(path.id, db=PathDb(path=path), user=admin) == []
    assert calls == [(path, admin)]

    monkeypatch.setattr(paths, "can_access_legacy_path", deny)
    with pytest.raises(HTTPException) as error:
        await paths.get_path_knowledge_bases(
            path.id, db=PathDb(path=path), user=actor("learner")
        )
    assert error.value.status_code == 404


class ChapterDb:
    def __init__(self, *, chapter, exercises=(), next_chapter=None):
        self.chapter = chapter
        self.exercises = list(exercises)
        self.next_chapter = next_chapter
        self.chapter_lookups = 0

    async def execute(self, statement):
        sql = str(statement)
        if "FROM exercise_submissions" in sql:
            return ScriptedResult(scalars=[])
        if "FROM exercises" in sql:
            return ScriptedResult(scalars=self.exercises)
        self.chapter_lookups += 1
        if self.chapter_lookups == 1:
            return ScriptedResult(scalar=self.chapter)
        return ScriptedResult(scalar=self.next_chapter)

    async def scalar(self, _statement):
        return None


def published_exercise(chapter_id):
    return models.Exercise(
        id=uuid.uuid4(),
        chapter_id=chapter_id,
        language="python",
        title="Leaked",
        description="Secret draft exercise",
        difficulty="medium",
        status="published",
        test_cases=[],
        tags=[],
        judge_mode="judge0",
        validation_status="verified",
        created_at=datetime.now(timezone.utc),
    )


@pytest.mark.anyio
async def test_chapter_practice_denies_callers_without_chapter_access(monkeypatch):
    outsider = actor("learner")
    chapter = legacy_chapter(uuid.uuid4())
    checked = []

    async def deny(_db, chapter_id, user, **kwargs):
        checked.append((chapter_id, user, kwargs))
        return False

    monkeypatch.setattr(exercises, "can_access_legacy_chapter", deny)
    db = ChapterDb(
        chapter=chapter,
        exercises=[published_exercise(chapter.id)],
        next_chapter=legacy_chapter(chapter.path_id, sort_order=2, title="Next secret"),
    )

    with pytest.raises(HTTPException) as error:
        await exercises.get_chapter_practice(chapter.id, db=db, user=outsider)

    assert error.value.status_code == 404
    assert error.value.detail == "章节不存在"
    assert checked[0][0] == chapter.id
    assert checked[0][2] == {"require_enrollment": True}


@pytest.mark.anyio
async def test_chapter_practice_serves_authorized_enrolled_learner(monkeypatch):
    learner = actor("learner")
    chapter = legacy_chapter(uuid.uuid4())
    next_chapter = legacy_chapter(chapter.path_id, sort_order=2, title="Next")

    async def allow(*_args, **_kwargs):
        return True

    monkeypatch.setattr(exercises, "can_access_legacy_chapter", allow)
    db = ChapterDb(
        chapter=chapter,
        exercises=[published_exercise(chapter.id)],
        next_chapter=next_chapter,
    )

    payload = await exercises.get_chapter_practice(chapter.id, db=db, user=learner)

    assert [item["title"] for item in payload["exercises"]] == ["Leaked"]
    assert payload["next_chapter"] is next_chapter


@pytest.mark.anyio
async def test_chapter_exercise_list_denies_unauthorized_and_unauthenticated(monkeypatch):
    chapter = legacy_chapter(uuid.uuid4())
    seen = []

    async def deny(_db, chapter_id, user, **kwargs):
        seen.append(user)
        return False

    monkeypatch.setattr(exercises, "can_access_legacy_chapter", deny)
    for caller in (None, actor("learner")):
        db = ChapterDb(chapter=chapter, exercises=[published_exercise(chapter.id)])
        with pytest.raises(HTTPException) as error:
            await exercises.list_exercises_by_chapter(chapter.id, db=db, user=caller)
        assert error.value.status_code == 404
        assert error.value.detail == "章节不存在"
    assert seen == [None, seen[1]]


@pytest.mark.anyio
async def test_anonymous_and_unrelated_sessions_cannot_reach_unpublished_chapters():
    anonymous = actor("learner", auth_provider="anonymous")
    draft = mapped_course(uuid.uuid4(), uuid.uuid4(), status="draft", visibility="private")
    enrolled = mapped_course(uuid.uuid4(), uuid.uuid4())

    class AuthzDb:
        def __init__(self, *, row=None, owner=None):
            self.row = row
            self.owner = owner

        async def execute(self, _statement):
            return ScriptedResult(rows=[self.row] if self.row else [])

        async def scalar(self, _statement):
            return self.owner

    assert not await can_access_legacy_chapter(
        AuthzDb(row=(draft, None)), uuid.uuid4(), anonymous, require_enrollment=True
    )
    assert not await can_access_legacy_chapter(
        AuthzDb(row=(enrolled, None)),
        uuid.uuid4(),
        actor("learner"),
        require_enrollment=True,
    )
    assert await can_access_legacy_chapter(
        AuthzDb(row=(enrolled, SimpleNamespace(id=uuid.uuid4()))),
        uuid.uuid4(),
        actor("learner"),
        require_enrollment=True,
    )


def test_legacy_rebuild_eligibility_reports_governed_course_and_role():
    owner = actor("creator")
    path = legacy_path(owner.id)
    course = mapped_course(owner.id, path.id)

    governed = paths.legacy_rebuild_eligibility(
        path=path, mapped_course=course, user=owner
    )
    assert governed["can_rebuild"] is False
    assert governed["reason"] == "governed_course"
    assert governed["mapped_course_id"] == course.id
    assert governed["mapped_course_status"] == "published"

    assert paths.legacy_rebuild_eligibility(
        path=path, mapped_course=None, user=owner
    ) == {
        "can_rebuild": True,
        "reason": "eligible",
        "mapped_course_id": None,
        "mapped_course_status": None,
    }
    assert paths.legacy_rebuild_eligibility(
        path=path, mapped_course=None, user=actor("admin")
    )["can_rebuild"] is True
    outsider = paths.legacy_rebuild_eligibility(
        path=path, mapped_course=None, user=actor("learner")
    )
    assert outsider["can_rebuild"] is False
    assert outsider["reason"] == "forbidden"


@pytest.mark.anyio
async def test_rebuild_eligibility_endpoint_requires_legacy_path_access(monkeypatch):
    owner = actor("creator")
    path = legacy_path(owner.id)
    course = mapped_course(owner.id, path.id)

    async def allow(*_args, **_kwargs):
        return True

    async def deny(*_args, **_kwargs):
        return False

    monkeypatch.setattr(paths, "can_access_legacy_path", allow)
    payload = await paths.get_path_rebuild_eligibility(
        path.id, db=PathDb(path=path, course=course), user=owner
    )
    assert payload["mapped_course_id"] == course.id
    assert payload["can_rebuild"] is False

    monkeypatch.setattr(paths, "can_access_legacy_path", deny)
    with pytest.raises(HTTPException) as error:
        await paths.get_path_rebuild_eligibility(
            path.id, db=PathDb(path=path, course=course), user=actor("learner")
        )
    assert error.value.status_code == 404
