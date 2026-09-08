from app.core.errors import AppError
from app.providers.ffmpeg_runner import FFmpegError
from app.services.generation_service import GenerationError, _describe_failure


def test_ffmpeg_failure_is_explained_and_keeps_the_raw_text():
    exc = FFmpegError("ffmpeg failed: Error initializing filter 'drawtext'")
    message, detail = _describe_failure(exc, "Rendering final video")

    assert "stitching" in message.lower()
    # The creator-facing sentence must not be the filter graph itself.
    assert "drawtext" not in message
    assert "drawtext" in detail


def test_an_exception_with_no_message_still_says_something():
    """
    The bug this exists for: NotImplementedError stringifies to "", which was
    stored verbatim and rendered as an error box containing no words at all.
    """
    message, detail = _describe_failure(NotImplementedError(), "Generating scene 1 of 6")

    assert message.strip()
    assert "generating scene 1 of 6" in message
    assert detail == "NotImplementedError"


def test_a_message_written_for_a_person_is_passed_through():
    exc = GenerationError("Veo's safety filter blocked this scene.")
    message, detail = _describe_failure(exc, "Generating scene 2 of 6")

    assert message == "Veo's safety filter blocked this scene."
    assert "GenerationError" in detail


def test_an_unexpected_error_names_the_stage_it_died_in():
    message, _ = _describe_failure(RuntimeError("connection reset"), "Rendering final video")

    assert "while rendering final video" in message


def test_a_failure_with_no_stage_still_reads_as_a_sentence():
    message, _ = _describe_failure(RuntimeError("boom"), None)

    assert message.startswith("Video generation stopped unexpectedly.")
    assert isinstance(AppError("x"), Exception)
