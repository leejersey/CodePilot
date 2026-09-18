"""TOS / chat image persistence unit tests."""

from app.services.chat_images import decode_data_url, persist_chat_images
from app.services import tos_storage


TINY_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def test_decode_data_url_png():
    decoded = decode_data_url(TINY_PNG)
    assert decoded is not None
    raw, mime = decoded
    assert mime == "image/png"
    assert raw.startswith(b"\x89PNG")


def test_persist_skips_when_tos_not_configured(monkeypatch):
    monkeypatch.setattr("app.services.tos_storage.tos_configured", lambda: False)
    assert persist_chat_images(
        [{"mime": "image/png", "url": TINY_PNG}],
        user_id="u1",
        conversation_id="c1",
    ) == []


def test_persist_uploads_when_configured(monkeypatch):
    monkeypatch.setattr("app.services.tos_storage.tos_configured", lambda: True)

    def fake_upload(*, data, content_type, key_prefix, extension):
        assert data.startswith(b"\x89PNG")
        assert content_type == "image/png"
        assert "u1" in key_prefix and "c1" in key_prefix
        assert extension == "png"
        return {
            "key": f"{key_prefix}/abc.png",
            "url": "https://cdn.example/abc.png",
            "mime": "image/png",
        }

    monkeypatch.setattr("app.services.tos_storage.upload_bytes", fake_upload)
    stored = persist_chat_images(
        [{"mime": "image/png", "url": TINY_PNG}],
        user_id="u1",
        conversation_id="c1",
    )
    assert len(stored) == 1
    assert stored[0]["url"] == "https://cdn.example/abc.png"
    assert stored[0]["key"].endswith(".png")


def test_enrich_image_metadata_refreshes_url(monkeypatch):
    monkeypatch.setattr(tos_storage, "tos_configured", lambda: True)
    monkeypatch.setattr(
        tos_storage,
        "resolve_object_url",
        lambda key: f"https://signed.example/{key}",
    )
    meta = {
        "images": [
            {"key": "chat-images/a.png", "url": "https://old.example/a.png", "mime": "image/png"}
        ]
    }
    out = tos_storage.enrich_image_metadata(meta)
    assert out["images"][0]["url"] == "https://signed.example/chat-images/a.png"
