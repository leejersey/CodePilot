"""Judge0 CE client and deterministic test evaluation."""

import asyncio
import time
from dataclasses import asdict, dataclass
from typing import Any

import httpx

from app.core.config import get_settings

settings = get_settings()

LANGUAGE_IDS = {
    "python": 71,
    "python3": 71,
    "javascript": 63,
    "js": 63,
    "typescript": 74,
    "go": 60,
    "golang": 60,
    "rust": 73,
    "cpp": 54,
    "c++": 54,
    "java": 62,
}


class JudgeUnavailable(RuntimeError):
    """Remote Judge0 is unavailable or its circuit is open."""


class UnsupportedLanguageError(ValueError):
    pass


def build_auth_headers(auth_header: str, token: str, rapidapi_host: str) -> dict[str, str]:
    if rapidapi_host:
        return {
            "X-RapidAPI-Key": token,
            "X-RapidAPI-Host": rapidapi_host,
        } if token else {"X-RapidAPI-Host": rapidapi_host}
    return {auth_header: token} if auth_header and token else {}


class Judge0CircuitBreaker:
    def __init__(
        self,
        *,
        failure_threshold: int,
        cooldown_seconds: float,
        clock=time.monotonic,
    ):
        self.failure_threshold = max(1, failure_threshold)
        self.cooldown_seconds = max(0.0, cooldown_seconds)
        self.clock = clock
        self.failures = 0
        self.opened_at: float | None = None

    def allow_request(self) -> bool:
        if self.opened_at is None:
            return True
        if self.clock() - self.opened_at >= self.cooldown_seconds:
            self.failures = 0
            self.opened_at = None
            return True
        return False

    def record_failure(self) -> None:
        self.failures += 1
        if self.failures >= self.failure_threshold:
            self.opened_at = self.clock()

    def record_success(self) -> None:
        self.failures = 0
        self.opened_at = None


_circuit = Judge0CircuitBreaker(
    failure_threshold=settings.JUDGE0_FAILURE_THRESHOLD,
    cooldown_seconds=settings.JUDGE0_COOLDOWN_SECONDS,
)


@dataclass(slots=True)
class JudgeResult:
    status_id: int
    status: str
    stdout: str | None = None
    stderr: str | None = None
    compile_output: str | None = None
    message: str | None = None
    time: str | None = None
    memory: int | None = None
    token: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def language_id_for(language: str) -> int:
    language_id = LANGUAGE_IDS.get(language.strip().lower())
    if language_id is None:
        raise UnsupportedLanguageError(f"Judge0 暂不支持语言: {language}")
    return language_id


def normalize_output(value: str | None) -> str:
    if not value:
        return ""
    lines = value.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    return "\n".join(line.rstrip() for line in lines).strip()


def _parse_result(payload: dict[str, Any]) -> JudgeResult:
    status = payload.get("status") or {}
    return JudgeResult(
        status_id=int(status.get("id") or payload.get("status_id") or 0),
        status=str(status.get("description") or payload.get("status") or "Unknown"),
        stdout=payload.get("stdout"),
        stderr=payload.get("stderr"),
        compile_output=payload.get("compile_output"),
        message=payload.get("message"),
        time=str(payload["time"]) if payload.get("time") is not None else None,
        memory=payload.get("memory"),
        token=payload.get("token"),
    )


def evaluate_test_results(
    test_cases: list[dict[str, Any]],
    runs: list[JudgeResult],
) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    passed_count = 0
    has_runtime_error = False

    for index, case in enumerate(test_cases):
        run = runs[index] if index < len(runs) else JudgeResult(0, "Judge Error")
        passed = run.status_id == 3 and normalize_output(run.stdout) == normalize_output(case.get("expected"))
        if passed:
            passed_count += 1
        elif run.status_id != 3:
            has_runtime_error = True

        status = "Accepted" if passed else ("Wrong Answer" if run.status_id == 3 else run.status)
        item: dict[str, Any] = {
            "case": index + 1,
            "passed": passed,
            "hidden": bool(case.get("hidden")),
            "status": status,
            "time": run.time,
            "memory": run.memory,
        }
        if not item["hidden"]:
            item.update({
                "input": case.get("input", ""),
                "expected": case.get("expected", ""),
                "actual": run.stdout or "",
                "stderr": run.stderr or run.compile_output or run.message,
            })
        results.append(item)

    total = len(test_cases)
    score = round((passed_count / total) * 100) if total else 0
    return {
        "result": "pass" if total and passed_count == total else ("error" if has_runtime_error else "fail"),
        "score": score,
        "test_results": results,
    }


class Judge0Client:
    def __init__(self, client: httpx.AsyncClient | None = None):
        token = settings.JUDGE0_RAPIDAPI_KEY or settings.JUDGE0_AUTH_TOKEN
        headers = build_auth_headers(
            settings.JUDGE0_AUTH_HEADER,
            token,
            settings.JUDGE0_RAPIDAPI_HOST,
        )
        self._owned_client = client is None
        self.client = client or httpx.AsyncClient(
            base_url=settings.JUDGE0_URL.rstrip("/"),
            headers=headers,
            timeout=settings.JUDGE0_TIMEOUT_SECONDS,
        )

    def _submission(self, source_code: str, language: str, stdin: str = "") -> dict[str, Any]:
        return {
            "source_code": source_code,
            "language_id": language_id_for(language),
            "stdin": stdin,
            "cpu_time_limit": settings.JUDGE0_CPU_TIME_LIMIT,
            "wall_time_limit": settings.JUDGE0_WALL_TIME_LIMIT,
            "memory_limit": settings.JUDGE0_MEMORY_LIMIT_KB,
        }

    async def close(self) -> None:
        if self._owned_client:
            await self.client.aclose()

    async def run(self, source_code: str, language: str, stdin: str = "") -> JudgeResult:
        response = await self.client.post(
            "/submissions",
            params={"base64_encoded": "false", "wait": "true"},
            json=self._submission(source_code, language, stdin),
        )
        response.raise_for_status()
        return _parse_result(response.json())

    async def run_tests(
        self,
        source_code: str,
        language: str,
        test_cases: list[dict[str, Any]],
    ) -> list[JudgeResult]:
        response = await self.client.post(
            "/submissions/batch",
            params={"base64_encoded": "false"},
            json={
                "submissions": [
                    self._submission(source_code, language, str(case.get("input", "")))
                    for case in test_cases
                ]
            },
        )
        response.raise_for_status()
        created = response.json()
        if not isinstance(created, list) or len(created) != len(test_cases):
            raise ValueError("Judge0 返回了无效的批量任务响应")
        tokens: list[str] = []
        for item in created:
            token = item.get("token") if isinstance(item, dict) else None
            if not token:
                detail = item.get("error") if isinstance(item, dict) else item
                raise ValueError(f"Judge0 创建任务失败: {detail}")
            tokens.append(token)
        deadline = asyncio.get_running_loop().time() + settings.JUDGE0_TIMEOUT_SECONDS

        while True:
            poll = await self.client.get(
                "/submissions/batch",
                params={
                    "tokens": ",".join(tokens),
                    "base64_encoded": "false",
                    "fields": "token,stdout,stderr,compile_output,message,time,memory,status",
                },
            )
            poll.raise_for_status()
            submissions = poll.json().get("submissions", [])
            by_token = {
                item.get("token"): _parse_result(item)
                for item in submissions
                if isinstance(item, dict) and item.get("token")
            }
            runs = [by_token.get(token) for token in tokens]
            if all(run is not None and run.status_id > 2 for run in runs):
                return [run for run in runs if run is not None]
            if asyncio.get_running_loop().time() >= deadline:
                raise TimeoutError("Judge0 执行超时")
            await asyncio.sleep(0.25)


async def run_code(source_code: str, language: str, stdin: str = "") -> JudgeResult:
    if not settings.JUDGE0_URL or not _circuit.allow_request():
        raise JudgeUnavailable("远程 Judge0 未配置或暂时熔断")
    client = Judge0Client()
    try:
        result = await client.run(source_code, language, stdin)
        if result.status_id == 13:
            raise JudgeUnavailable(result.message or "Judge0 internal error")
        _circuit.record_success()
        return result
    except UnsupportedLanguageError:
        raise
    except (httpx.HTTPError, TimeoutError, ValueError, JudgeUnavailable) as exc:
        _circuit.record_failure()
        raise JudgeUnavailable(str(exc)) from exc
    finally:
        await client.close()


async def run_test_cases(
    source_code: str,
    language: str,
    test_cases: list[dict[str, Any]],
) -> dict[str, Any]:
    if not settings.JUDGE0_URL or not _circuit.allow_request():
        raise JudgeUnavailable("远程 Judge0 未配置或暂时熔断")
    client = Judge0Client()
    try:
        runs = await client.run_tests(source_code, language, test_cases)
        if any(run.status_id == 13 for run in runs):
            raise JudgeUnavailable("Judge0 internal error")
        _circuit.record_success()
        return evaluate_test_results(test_cases, runs)
    except UnsupportedLanguageError:
        raise
    except (httpx.HTTPError, TimeoutError, ValueError, JudgeUnavailable) as exc:
        _circuit.record_failure()
        raise JudgeUnavailable(str(exc)) from exc
    finally:
        await client.close()


async def judge0_available() -> bool:
    if not settings.JUDGE0_URL or not _circuit.allow_request():
        return False
    client = Judge0Client()
    try:
        response = await client.client.get("/system_info", timeout=2.0)
        return response.is_success
    except httpx.HTTPError:
        return False
    finally:
        await client.close()
