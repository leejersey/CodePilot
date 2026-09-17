"""chat_images 单元测试。"""

from app.services.chat_images import (
    build_user_content_for_llm,
    compose_stored_user_text,
    normalize_chat_images,
)


TINY_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def test_normalize_accepts_valid_and_drops_invalid():
    images = normalize_chat_images(
        [
            {"dataUrl": TINY_PNG},
            {"dataUrl": "https://evil.example/x.png"},
            {"dataUrl": "data:text/plain;base64,aaaa"},
            {"url": TINY_PNG},
        ]
    )
    assert len(images) == 2
    assert images[0]["mime"] == "image/png"
    assert images[0]["url"].startswith("data:image/png;base64,")


def test_normalize_caps_at_four():
    raw = [{"dataUrl": TINY_PNG} for _ in range(6)]
    assert len(normalize_chat_images(raw)) == 4


def test_compose_stored_user_text_with_images():
    assert compose_stored_user_text("帮我看报错", 2).endswith("[已附 2 张图片]")
    assert "请分析这" in compose_stored_user_text("", 1)


def test_build_user_content_multimodal():
    content = build_user_content_for_llm("看图", [{"mime": "image/png", "url": TINY_PNG}])
    assert isinstance(content, list)
    assert content[0]["type"] == "text"
    assert content[1]["type"] == "image_url"
    assert content[1]["image_url"]["url"] == TINY_PNG


def test_build_user_content_text_only():
    assert build_user_content_for_llm("hello", []) == "hello"
