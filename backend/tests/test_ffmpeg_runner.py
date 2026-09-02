from app.providers.ffmpeg_runner import escape_drawtext


def test_escapes_colons_and_quotes_and_percent():
    assert escape_drawtext("9:30 - 100% 'done'") == "9\\:30 - 100\\% ’done’"


def test_escapes_backslashes():
    assert escape_drawtext("a\\b") == "a\\\\b"


def test_leaves_plain_text_unchanged():
    assert escape_drawtext("hello world") == "hello world"
