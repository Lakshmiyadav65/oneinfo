"""
Whether a generated clip has a person's face in it.

Exists for b-roll. A b-roll scene is told nobody is in frame, and Veo still
sometimes seats a stranger in it to read the line - in one test run, one
b-roll clip in four. Wording could not stop that, so the clip is looked at
after it comes back, and a clip with a face in it is generated again.

Runs locally with OpenCV's YuNet detector rather than through a vision model:
it is free, takes a fraction of a second, and does not stop working when an
API quota runs out halfway through a paid run.
"""

import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

import cv2

from app.providers.ffmpeg_runner import run_ffmpeg

_MODEL = Path(__file__).resolve().parents[1] / "assets" / "models" / "face_detection_yunet_2023mar.onnx"

# Confident detections only. A phone screen showing a profile picture or an
# out-of-focus poster scores well below a real face in the shot.
_SCORE_THRESHOLD = 0.85
# Faces smaller than this share of the frame's shorter side are ignored: a
# thumbnail in an app UI is not a person in the scene.
_MIN_FACE_FRACTION = 0.08
# A person in frame is in frame for most of the clip, so one stray frame is
# not enough to spend a regeneration on.
_MIN_FRAMES_WITH_FACE = 2
_FRAMES_PER_SECOND = 1


@dataclass
class FaceCheck:
    frames_checked: int
    frames_with_face: int

    @property
    def has_person(self) -> bool:
        return self.frames_with_face >= min(_MIN_FRAMES_WITH_FACE, self.frames_checked)


def _faces_in(image_path: Path, detector) -> bool:
    image = cv2.imread(str(image_path))
    if image is None:
        return False
    height, width = image.shape[:2]
    detector.setInputSize((width, height))
    _, faces = detector.detect(image)
    if faces is None:
        return False
    smallest = min(width, height) * _MIN_FACE_FRACTION
    return any(face[2] >= smallest and face[3] >= smallest for face in faces)


async def check_clip(ffmpeg_path: str, clip_path: Path) -> FaceCheck:
    scratch = Path(tempfile.gettempdir()) / f"oneinfo-faces-{uuid.uuid4()}"
    scratch.mkdir()
    try:
        await run_ffmpeg(
            ffmpeg_path,
            [
                "-i", str(clip_path),
                "-vf", f"fps={_FRAMES_PER_SECOND}",
                str(scratch / "frame-%03d.png"),
            ],
        )
        detector = cv2.FaceDetectorYN.create(
            str(_MODEL), "", (320, 320), _SCORE_THRESHOLD
        )
        frames = sorted(scratch.glob("frame-*.png"))
        with_face = sum(1 for frame in frames if _faces_in(frame, detector))
        return FaceCheck(frames_checked=len(frames), frames_with_face=with_face)
    finally:
        for file in scratch.glob("*"):
            file.unlink(missing_ok=True)
        scratch.rmdir()
