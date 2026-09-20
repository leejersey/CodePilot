"""Daytona Sandbox runner for framework / LangChain-style Python demos."""

from __future__ import annotations

import asyncio

from app.services.modal_sandbox import ModalRunResult, sanitize_install_packages


class DaytonaUnavailable(Exception):
    """Daytona is not configured or the SDK call failed."""


def _run_python_sync(
    code: str,
    packages: list[str],
    env_vars: dict[str, str] | None = None,
    *,
    api_key: str,
) -> ModalRunResult:
    key = (api_key or "").strip()
    if not key:
        raise DaytonaUnavailable(
            "未配置 Daytona：请在个人中心配置 Daytona API Key 后再使用云端运行"
        )

    try:
        from daytona import CodeRunParams, Daytona, DaytonaConfig
    except ImportError as exc:
        raise DaytonaUnavailable(
            "未安装 daytona 包，请在 backend 执行 pip install daytona"
        ) from exc

    env: dict[str, str] = {k: v for k, v in (env_vars or {}).items() if v is not None}

    daytona = Daytona(DaytonaConfig(api_key=key))
    sandbox = daytona.create()
    try:
        if packages:
            # Packages already sanitized / course-allowlisted by the caller.
            install = sandbox.process.exec("pip install " + " ".join(packages))
            if getattr(install, "exit_code", 0) not in (0, None):
                err = str(getattr(install, "result", "") or "")
                return ModalRunResult(
                    stdout="",
                    stderr=err or "pip install failed",
                    exit_code=int(install.exit_code),
                    status=f"Exit {install.exit_code}",
                )

        if env:
            dotenv_body = "\n".join(f"{k}={v}" for k, v in env.items()) + "\n"
            try:
                sandbox.fs.upload_file(dotenv_body.encode("utf-8"), "/tmp/.env")
            except Exception:
                # Best-effort; code_run env still applies.
                pass

        params = CodeRunParams(env=env) if env else None
        response = sandbox.process.code_run(code, params)
        stdout = ""
        stderr = ""
        artifacts = getattr(response, "artifacts", None)
        if artifacts is not None:
            stdout = str(getattr(artifacts, "stdout", "") or "")
            stderr = str(getattr(artifacts, "stderr", "") or "")
        if not stdout:
            stdout = str(getattr(response, "result", "") or "")
        exit_code = int(getattr(response, "exit_code", None) or 0)
        status = "Finished" if exit_code == 0 else f"Exit {exit_code}"
        return ModalRunResult(
            stdout=stdout,
            stderr=stderr,
            exit_code=exit_code,
            status=status,
        )
    finally:
        try:
            daytona.delete(sandbox)
        except Exception:
            pass


async def run_python_in_daytona(
    code: str,
    packages: list[str] | None = None,
    *,
    api_key: str,
    env_vars: dict[str, str] | None = None,
) -> ModalRunResult:
    """Run Python in Daytona with learner BYOK API key.

    ``packages`` must already be course-allowlisted by the caller.
    """
    pkgs = sanitize_install_packages(packages)
    return await asyncio.to_thread(
        _run_python_sync,
        code,
        pkgs,
        env_vars,
        api_key=api_key,
    )
