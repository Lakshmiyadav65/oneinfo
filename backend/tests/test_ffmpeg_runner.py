from app.providers.ffmpeg_runner import escape_drawtext


def test_escapes_colons_and_quotes_but_leaves_percent_alone():
    # % is deliberately not escaped. drawtext rejects a backslash-escaped
    # percent outright and takes the whole render down with it, and
    # rendering_service passes expansion=none, so a percent carries no
    # special meaning to escape away from.
    assert escape_drawtext("9:30 - 100% 'done'") == "9\\:30 - 100% ’done’"


def test_escapes_backslashes():
    assert escape_drawtext("a\\b") == "a\\\\b"


def test_leaves_plain_text_unchanged():
    assert escape_drawtext("hello world") == "hello world"
