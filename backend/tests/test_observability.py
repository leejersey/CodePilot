import re

from app.services.observability import (
    new_error_id,
    sanitize_context,
    should_send_burst_alert,
)


def test_sensitive_values_are_redacted_recursively():
    value = {
        "email": "learner@example.com",
        "authorization": "Bearer secret",
        "nested": {"api_key": "sk-secret", "password": "12345678"},
    }

    assert sanitize_context(value) == {
        "email": "learner@example.com",
        "authorization": "[REDACTED]",
        "nested": {"api_key": "[REDACTED]", "password": "[REDACTED]"},
    }


def test_error_id_is_short_and_traceable():
    error_id = new_error_id()

    assert re.fullmatch(r"err_[0-9a-f]{12}", error_id)


def test_sensitive_tokens_inside_text_are_redacted():
    value = "request failed Authorization: Bearer abc.def.ghi api_key=sk-secret"

    sanitized = sanitize_context(value)

    assert "abc.def.ghi" not in sanitized
    assert "sk-secret" not in sanitized
    assert sanitized.count("[REDACTED]") == 2


def test_burst_alert_fires_only_when_threshold_is_crossed():
    assert not should_send_burst_alert(4, threshold=5)
    assert should_send_burst_alert(5, threshold=5)
    assert not should_send_burst_alert(6, threshold=5)
