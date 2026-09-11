"""
Turning a live capture into the creator's Veo reference set.

The browser runs the session and reports which angles it confirmed and when.
What is pinned here is the server's refusal to believe it: a capture whose
angles are missing, misnamed, out of order or past the end of its own take
is rejected before anything the creator already has is touched.
"""

import asyncio
import subprocess
import uuid
from pathlib import Path

import pytest

from app.core.config import Settings, get_settings
from app.core.errors import ValidationAppError
from app.models.creator_recording import ANGLES
from app.providers.ffmpeg_runner import VideoInfo, probe_video_info
from app.services.creator_face_service import MIN_FACE_DIMENSION, validate_face_image
from app.services.creator_recording_service import parse_angles, validate_take


def angles(*offsets: float) -> list[dict]:
    return [
        {"angle": name, "offset_seconds": offset, "yaw_degrees": 0.0}
        for name, offset in zip(ANGLES, offsets, strict=False)
    ]


def take(seconds: float = 12.0, width: int = 1280, height: int = 720) -> VideoInfo:
    return VideoInfo(
        duration_seconds=seconds,
        width=width,
        height=height,
        has_video=True,
        has_audio=True,
    )


# --- the angles a session reports -------------------------------------------


def test_a_well_formed_session_is_accepted_in_order():
    parsed = parse_angles(angles(2.0, 5.0, 8.0), duration_seconds=12.0)
    assert [a.angle for a in parsed] == list(ANGLES)
    assert [a.offset_seconds for a in parsed] == [2.0, 5.0, 8.0]


def test_front_comes_first_because_veo_weights_position_zero_hardest():
    """The order is not cosmetic. The straight-on frame has to be the
    primary reference, so a session reporting the turns first is wrong."""
    with pytest.raises(ValidationAppError):
        parse_angles(
            [
                {"angle": "left", "offset_seconds": 2.0},
                {"angle": "front", "offset_seconds": 5.0},
                {"angle": "right", "offset_seconds": 8.0},
            ],
            duration_seconds=12.0,
        )


def test_a_session_that_confirmed_fewer_than_three_angles_is_refused():
    """Half a turn is a session that went wrong, and a reference set built
    from it would be quietly worse rather than visibly broken."""
    with pytest.raises(ValidationAppError):
        parse_angles(angles(2.0, 5.0), duration_seconds=12.0)


def test_angles_out_of_recording_order_are_refused():
    with pytest.raises(ValidationAppError):
        parse_angles(angles(5.0, 2.0, 8.0), duration_seconds=12.0)


def test_two_angles_confirmed_at_the_same_instant_are_refused():
    with pytest.raises(ValidationAppError):
        parse_angles(angles(2.0, 2.0, 8.0), duration_seconds=12.0)


def test_an_angle_past_the_end_of_its_own_take_is_refused():
    with pytest.raises(ValidationAppError):
        parse_angles(angles(2.0, 5.0, 30.0), duration_seconds=12.0)


def test_a_frame_past_the_end_by_a_hair_is_kept_and_clamped():
    """MediaRecorder's clock and the container's reported duration disagree
    by a frame or two on every take. Refusing that would fail ordinary
    captures for a rounding difference nobody can see."""
    parsed = parse_angles(angles(2.0, 5.0, 12.2), duration_seconds=12.0)
    assert parsed[-1].offset_seconds == 12.0


def test_a_session_reporting_nothing_useful_is_refused():
    with pytest.raises(ValidationAppError):
        parse_angles(None, duration_seconds=12.0)
    with pytest.raises(ValidationAppError):
        parse_angles(["front", "left", "right"], duration_seconds=12.0)
    with pytest.raises(ValidationAppError):
        parse_angles([{"angle": "front"}] * 3, duration_seconds=12.0)


def test_a_missing_yaw_is_recorded_rather_than_refused():
    """Yaw is what the session measured, not something generation needs.
    A frame is no less usable for arriving without it."""
    parsed = parse_angles(
        [{"angle": name, "offset_seconds": t} for name, t in zip(ANGLES, (1.0, 2.0, 3.0))],
        duration_seconds=12.0,
    )
    assert all(a.yaw_degrees is None for a in parsed)


# --- the take itself --------------------------------------------------------


def test_an_ordinary_take_passes():
    validate_take(take())


def test_a_file_with_no_video_is_refused():
    with pytest.raises(ValidationAppError):
        validate_take(
            VideoInfo(duration_seconds=12.0, width=None, height=None,
                      has_video=False, has_audio=True)
        )


def test_a_take_too_short_to_hold_three_angles_is_refused():
    with pytest.raises(ValidationAppError) as err:
        validate_take(take(seconds=1.5))
    assert "three angles" in str(err.value)


def test_a_take_longer_than_the_limit_is_refused():
    with pytest.raises(ValidationAppError):
        validate_take(take(seconds=300.0))


def test_a_take_too_small_for_a_usable_face_is_refused():
    with pytest.raises(ValidationAppError):
        validate_take(take(width=320, height=240))
    # The same floor a reference photo has to clear, from the same constant.
    validate_take(take(width=MIN_FACE_DIMENSION, height=MIN_FACE_DIMENSION))


# --- frames arriving from a browser are not trusted -------------------------


def test_a_frame_the_browser_drew_is_probed_as_hard_as_an_uploaded_photo():
    """They arrive over the same wire either way. Drawing them ourselves
    earns them no trust, and this is the check that says so."""
    settings = Settings()
    with pytest.raises(ValidationAppError):
        validate_face_image(settings, b"not an image at all")


def test_a_frame_below_the_dimension_floor_is_refused():
    pytest.importorskip("PIL")
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (200, 200), "white").save(buffer, format="JPEG")
    with pytest.raises(ValidationAppError):
        validate_face_image(Settings(), buffer.getvalue())


# --- re-extraction, which is the only path that seeks the take --------------


def _write_take(ffmpeg_path: str, destination: Path) -> None:
    subprocess.run(
        [
            ffmpeg_path, "-y",
            "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=30:duration=6",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo:d=6",
            "-c:v", "libx264", "-c:a", "aac", "-shortest", str(destination),
        ],
        capture_output=True,
        check=True,
    )


async def test_probe_reads_a_real_recording(requires_ffmpeg, tmp_path: Path):
    """ffprobe, not the browser's Content-Type, decides what a take holds."""
    settings = get_settings()
    source = tmp_path / f"take-{uuid.uuid4()}.mp4"
    await asyncio.to_thread(_write_take, settings.ffmpeg_path, source)

    info = await probe_video_info(settings.ffprobe_path, str(source))
    assert info.has_video and info.has_audio
    assert info.width == 1280 and info.height == 720
    assert info.duration_seconds == pytest.approx(6.0, abs=0.5)
    validate_take(info)
