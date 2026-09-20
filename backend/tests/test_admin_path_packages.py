"""Admin approve/reject API for path/chapter package candidates."""

import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core.deps import require_admin
from app.schemas.schemas import PackageCandidateOut, PackageStatusUpdate


@pytest.fixture
def anyio_backend():
    return "asyncio"


def actor(role: str):
    return SimpleNamespace(id=uuid.uuid4(), role=role, status="active")


def candidate(name, *, status="pending", source="import", reason=None):
    item = {"name": name, "status": status, "source": source}
    if reason is not None:
        item["reason"] = reason
    return item


class PackagesDb:
    """Minimal async DB stub for path + chapter package lookups."""

    def __init__(self, path=None):
        self.path = path
        self.committed = False
        self.refreshed = []

    async def execute(self, _query):
        return SimpleNamespace(scalar_one_or_none=lambda: self.path)

    async def commit(self):
        self.committed = True

    async def refresh(self, obj):
        self.refreshed.append(obj)


def make_path(*, path_candidates=None, chapters=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        package_candidates=list(path_candidates or []),
        chapters=list(chapters or []),
    )


def make_chapter(path_id, *, candidates=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        path_id=path_id,
        package_candidates=list(candidates or []),
    )


def test_package_status_update_schema_accepts_approved_and_rejected():
    assert PackageStatusUpdate(
        name="httpx", status="approved", scope="path"
    ).status == "approved"
    body = PackageStatusUpdate(
        name="numpy",
        status="rejected",
        scope="chapter",
        chapter_id=uuid.uuid4(),
        reason="unsafe",
    )
    assert body.reason == "unsafe"


def test_package_candidate_out_includes_scope():
    item = PackageCandidateOut(
        name="langchain",
        status="pending",
        source="import",
        scope="path",
        chapter_id=None,
    )
    assert item.scope == "path"


@pytest.mark.anyio
async def test_require_admin_rejects_creator_and_learner():
    with pytest.raises(HTTPException) as creator_err:
        await require_admin(actor("creator"))
    assert creator_err.value.status_code == 403

    with pytest.raises(HTTPException) as learner_err:
        await require_admin(actor("learner"))
    assert learner_err.value.status_code == 403


@pytest.mark.anyio
async def test_list_packages_flattens_path_and_chapter_scopes():
    from app.api.v1 import admin_path_packages

    path_id = uuid.uuid4()
    chapter = make_chapter(
        path_id,
        candidates=[candidate("httpx", status="pending")],
    )
    path = make_path(
        path_candidates=[candidate("langchain", status="approved", source="provider")],
        chapters=[chapter],
    )
    path.id = path_id
    db = PackagesDb(path=path)

    items = await admin_path_packages.list_path_packages(
        path_id, db=db, _=actor("admin")
    )

    assert len(items) == 2
    by_name = {i.name: i for i in items}
    assert by_name["langchain"].scope == "path"
    assert by_name["langchain"].chapter_id is None
    assert by_name["langchain"].status == "approved"
    assert by_name["langchain"].source == "provider"
    assert by_name["httpx"].scope == "chapter"
    assert by_name["httpx"].chapter_id == chapter.id


@pytest.mark.anyio
async def test_list_packages_404_when_path_missing():
    from app.api.v1 import admin_path_packages

    with pytest.raises(HTTPException) as err:
        await admin_path_packages.list_path_packages(
            uuid.uuid4(), db=PackagesDb(path=None), _=actor("admin")
        )
    assert err.value.status_code == 404


@pytest.mark.anyio
async def test_admin_approve_flips_path_candidate_status():
    from app.api.v1 import admin_path_packages

    path = make_path(
        path_candidates=[candidate("langchain", status="pending")],
    )
    db = PackagesDb(path=path)
    body = PackageStatusUpdate(name="langchain", status="approved", scope="path")

    result = await admin_path_packages.update_package_status(
        path.id, body, db=db, _=actor("admin")
    )

    assert result.status == "approved"
    assert result.scope == "path"
    assert path.package_candidates[0]["status"] == "approved"
    assert db.committed


@pytest.mark.anyio
async def test_admin_reject_chapter_candidate_with_reason():
    from app.api.v1 import admin_path_packages

    path_id = uuid.uuid4()
    chapter = make_chapter(
        path_id,
        candidates=[candidate("numpy", status="pending")],
    )
    path = make_path(chapters=[chapter])
    path.id = path_id
    db = PackagesDb(path=path)
    body = PackageStatusUpdate(
        name="numpy",
        status="rejected",
        scope="chapter",
        chapter_id=chapter.id,
        reason="not needed",
    )

    result = await admin_path_packages.update_package_status(
        path_id, body, db=db, _=actor("super_admin")
    )

    assert result.status == "rejected"
    assert result.reason == "not needed"
    assert result.chapter_id == chapter.id
    assert chapter.package_candidates[0]["status"] == "rejected"
    assert chapter.package_candidates[0]["reason"] == "not needed"


@pytest.mark.anyio
async def test_patch_rejects_unknown_name_in_scope():
    from app.api.v1 import admin_path_packages

    path = make_path(path_candidates=[candidate("langchain")])
    db = PackagesDb(path=path)
    body = PackageStatusUpdate(name="evil", status="approved", scope="path")

    with pytest.raises(HTTPException) as err:
        await admin_path_packages.update_package_status(
            path.id, body, db=db, _=actor("admin")
        )
    assert err.value.status_code == 404


@pytest.mark.anyio
async def test_chapter_scope_requires_chapter_belonging_to_path():
    from app.api.v1 import admin_path_packages

    path = make_path(
        chapters=[make_chapter(uuid.uuid4(), candidates=[candidate("httpx")])],
    )
    db = PackagesDb(path=path)
    foreign_chapter_id = uuid.uuid4()
    body = PackageStatusUpdate(
        name="httpx",
        status="approved",
        scope="chapter",
        chapter_id=foreign_chapter_id,
    )

    with pytest.raises(HTTPException) as err:
        await admin_path_packages.update_package_status(
            path.id, body, db=db, _=actor("admin")
        )
    assert err.value.status_code in (400, 404)
