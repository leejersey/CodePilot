from app.services.backfill_package_candidates import auto_approve_known_safe_hints


def test_auto_approve_known_safe_hints_promotes_pending_only():
    candidates = [
        {"name": "httpx", "status": "pending", "source": "import"},
        {"name": "evil-pkg", "status": "pending", "source": "import"},
        {"name": "numpy", "status": "approved", "source": "import"},
        {"name": "pandas", "status": "rejected", "source": "import", "reason": "no"},
    ]
    updated, promoted = auto_approve_known_safe_hints(candidates)
    assert promoted == ["httpx"]
    assert updated[0]["status"] == "approved"
    assert updated[1]["status"] == "pending"
    assert updated[2]["status"] == "approved"
    assert updated[3]["status"] == "rejected"
    assert updated[3]["reason"] == "no"
