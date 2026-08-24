"""Response parsing.

`ai.py` needs an ANTHROPIC_API_KEY at import to construct the client, so these
set a dummy one. Nothing here makes a network call — what is under test is the
parsing between the API and the route.
"""
import os
from types import SimpleNamespace

import pytest

os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-test-not-a-real-key")

import ai  # noqa: E402  — must follow the env var above


def response(*blocks, stop_reason="end_turn"):
    return SimpleNamespace(content=list(blocks), stop_reason=stop_reason)


def text_block(text):
    return SimpleNamespace(type="text", text=text)


def thinking_block(text="considering the supply rail"):
    return SimpleNamespace(type="thinking", thinking=text)


def test_extract_text_skips_thinking_blocks():
    """With extended thinking on, a ThinkingBlock arrives ahead of the TextBlock
    and `resp.content[0].text` raises AttributeError. Trace does not enable
    thinking today, so this only ever matters after someone turns it on — at
    which point the crash looks unrelated to the change that caused it.
    """
    assert ai.extract_text_block(response(thinking_block(), text_block("answer"))) == "answer"


def test_extract_text_handles_a_plain_response():
    assert ai.extract_text_block(response(text_block("answer"))) == "answer"


def test_extract_text_handles_an_empty_response():
    assert ai.extract_text_block(response()) == ""
    assert ai.extract_text_block(response(thinking_block())) == ""


def test_parse_structured_reads_the_json_body():
    parsed = ai._parse_structured(response(text_block('{"title": "555 blinker"}')))
    assert parsed == {"title": "555 blinker"}


def test_parse_structured_raises_on_a_truncated_response():
    """A JSONDecodeError here means max_tokens cut the response off.

    Returning a partial object would hand the renderer half a netlist, which
    draws a circuit that is wrong rather than one that is obviously missing.
    """
    with pytest.raises(ai.AIError, match="malformed JSON"):
        ai._parse_structured(response(text_block('{"title": "555 bli'),
                                      stop_reason="max_tokens"))


def test_parse_structured_raises_when_there_is_no_text():
    with pytest.raises(ai.AIError, match="no text content"):
        ai._parse_structured(response(thinking_block()))


@pytest.mark.asyncio
async def test_diagnose_rejects_an_unsupported_image_type():
    """Caught before the call so a bad upload costs no credit and no latency."""
    with pytest.raises(ai.AIError, match="Unsupported image type"):
        await ai.diagnose_photo(image_base64="AAAA", media_type="image/heic",
                                symptom="LED won't light")


def test_model_is_pinned():
    """A silent model swap changes cost, latency and output shape at once."""
    assert ai.MODEL == "claude-sonnet-5"
