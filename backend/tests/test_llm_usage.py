import uuid
from decimal import Decimal
from types import SimpleNamespace

from app.services.llm_usage import (
    calculate_estimated_cost,
    estimate_tokens,
    resolve_monthly_quota,
    should_enforce_platform_quota,
)


def test_estimate_tokens_uses_safe_character_fallback():
    assert estimate_tokens("") == 0
    assert estimate_tokens("abcdefgh") == 2
    assert estimate_tokens("中" * 8) == 2


def test_cost_uses_per_million_token_rates():
    cost = calculate_estimated_cost(
        input_tokens=1_000_000,
        output_tokens=500_000,
        rates={"input": 0.5, "output": 2.0},
    )

    assert cost == Decimal("1.500000")


def test_only_platform_key_consumes_platform_quota():
    assert should_enforce_platform_quota("platform")
    assert not should_enforce_platform_quota("user")


def test_user_quota_override_replaces_default():
    user = SimpleNamespace(
        id=uuid.uuid4(),
        preferences={"llm_monthly_token_quota": 250_000},
    )

    assert resolve_monthly_quota(user, 1_000_000) == 250_000
    assert resolve_monthly_quota(SimpleNamespace(preferences={}), 1_000_000) == 1_000_000
