"""Unit tests for Daytona sandbox runner (mocked SDK, no live calls)."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services.daytona_sandbox import DaytonaUnavailable, run_python_in_daytona
from app.services.modal_sandbox import ModalRunResult


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _fake_daytona_sdk(monkeypatch, *, exec_exit=0, run_exit=0, run_stdout="hello"):
    """Install a fake ``daytona`` module into sys.modules for import inside runner."""
    import sys

    exec_resp = SimpleNamespace(exit_code=exec_exit, result="ok")
    run_resp = SimpleNamespace(
        exit_code=run_exit,
        result=run_stdout,
        artifacts=SimpleNamespace(stdout=run_stdout),
    )

    process = MagicMock()
    process.exec.return_value = exec_resp
    process.code_run.return_value = run_resp

    fs = MagicMock()
    sandbox = MagicMock()
    sandbox.process = process
    sandbox.fs = fs

    client = MagicMock()
    client.create.return_value = sandbox

    daytona_mod = MagicMock()
    daytona_mod.Daytona = MagicMock(return_value=client)
    daytona_mod.DaytonaConfig = MagicMock(side_effect=lambda **kw: SimpleNamespace(**kw))
    daytona_mod.CodeRunParams = MagicMock(side_effect=lambda **kw: SimpleNamespace(**kw))

    monkeypatch.setitem(sys.modules, "daytona", daytona_mod)
    return client, sandbox, process, fs, daytona_mod


@pytest.mark.anyio
async def test_run_python_in_daytona_installs_and_runs(monkeypatch):
    client, sandbox, process, fs, daytona_mod = _fake_daytona_sdk(monkeypatch)

    result = await run_python_in_daytona(
        "print(1)",
        ["httpx"],
        api_key="dtn_test_key",
        env_vars={"FOO": "bar"},
    )

    assert isinstance(result, ModalRunResult)
    assert result.stdout == "hello"
    assert result.exit_code == 0
    assert result.status == "Finished"

    daytona_mod.DaytonaConfig.assert_called_once_with(api_key="dtn_test_key")
    client.create.assert_called_once()
    process.exec.assert_called_once()
    assert "pip install" in process.exec.call_args.args[0]
    assert "httpx" in process.exec.call_args.args[0]
    fs.upload_file.assert_called_once()
    process.code_run.assert_called_once()
    code_args, code_kwargs = process.code_run.call_args
    assert code_args[0] == "print(1)"
    params = code_args[1]
    assert params.env == {"FOO": "bar"}
    client.delete.assert_called_once_with(sandbox)


@pytest.mark.anyio
async def test_run_python_in_daytona_empty_key_raises():
    with pytest.raises(DaytonaUnavailable) as err:
        await run_python_in_daytona("print(1)", api_key="  ")
    assert "Daytona" in str(err.value)


@pytest.mark.anyio
async def test_run_python_in_daytona_import_error(monkeypatch):
    import builtins

    real_import = builtins.__import__

    def _boom(name, *args, **kwargs):
        if name == "daytona" or name.startswith("daytona."):
            raise ImportError("no daytona")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _boom)
    with pytest.raises(DaytonaUnavailable) as err:
        await run_python_in_daytona("print(1)", api_key="dtn_x")
    assert "pip install daytona" in str(err.value)
