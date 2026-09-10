"""
The shape a finished video is handed over in.

Kept apart from OutputSettings on purpose. Those settings decide what Veo is
asked to generate, and Veo generates two shapes; an export is ffmpeg alone,
working on clips that already exist, so it can hand back a square that no
generation setting could ever ask for.

Exporting also spends nothing. It stitches clips already paid for, which is
why a creator can export the same video for three platforms and think
nothing of it.
"""

import enum

from pydantic import BaseModel

from app.schemas.output_settings import Resolution


class ExportFormat(str, enum.Enum):
    """Named by the frame, not by the platform: the platforms change."""

    vertical = "9:16"
    landscape = "16:9"
    square = "1:1"


class ExportRequest(BaseModel):
    """
    Defaults match the commonest case rather than the project's own settings.
    A caller that wants the project's shape uses the stitch route instead,
    which is exactly what "combine" already means.
    """

    format: ExportFormat = ExportFormat.vertical
    resolution: Resolution = Resolution.full_hd
