"""
Exporting a finished video for somewhere it is going.

The point being pinned here is not the arithmetic. It is that an export
names its frame for one run only: a creator exporting for YouTube is saying
where this file is going, not changing what their next scene is generated
as — and the next scene is the one that costs money.
"""

import pytest

from app.models.generation_job import GenerationJob
from app.schemas.export import ExportFormat, ExportRequest
from app.schemas.output_settings import AspectRatio, OutputSettings, Resolution
from app.services.generation_service import _render_size
from app.services.project_service import export_size, output_size


@pytest.mark.parametrize(
    ("fmt", "resolution", "expected"),
    [
        (ExportFormat.vertical, Resolution.full_hd, (1080, 1920)),
        (ExportFormat.vertical, Resolution.hd, (720, 1280)),
        (ExportFormat.landscape, Resolution.full_hd, (1920, 1080)),
        (ExportFormat.landscape, Resolution.hd, (1280, 720)),
        (ExportFormat.square, Resolution.full_hd, (1080, 1080)),
        (ExportFormat.square, Resolution.hd, (720, 720)),
    ],
)
def test_each_frame_exports_at_the_size_the_platform_expects(fmt, resolution, expected):
    assert export_size(fmt, resolution) == expected


def test_every_exported_dimension_is_even():
    """libx264 with yuv420p rejects an odd dimension outright, and the run
    that finds out has already collected every clip."""
    for fmt in ExportFormat:
        for resolution in Resolution:
            width, height = export_size(fmt, resolution)
            assert width % 2 == 0 and height % 2 == 0


def test_square_is_a_frame_only_an_export_can_ask_for():
    """The reason export has its own type rather than reusing the generation
    settings: Veo generates two shapes, and this is not one of them."""
    assert {fmt.value for fmt in ExportFormat} - {ratio.value for ratio in AspectRatio} == {
        "1:1"
    }


def test_generation_settings_still_decide_an_ordinary_run():
    """A stitch that names no export is what combining has always been."""
    job = GenerationJob(stitch_only=True, export_aspect_ratio=None, export_resolution=None)
    output = OutputSettings(aspect_ratio=AspectRatio.vertical, resolution=Resolution.hd)

    assert _render_size(job, output) == output_size(output) == (720, 1280)


def test_an_export_overrides_the_shape_the_project_generates_at():
    """A vertical project exported for YouTube renders landscape. The clips
    are padded into it rather than stretched, so this costs black bars down
    the sides and not a squashed face."""
    job = GenerationJob(
        stitch_only=True,
        export_aspect_ratio=ExportFormat.landscape.value,
        export_resolution=Resolution.full_hd.value,
    )
    vertical_project = OutputSettings(
        aspect_ratio=AspectRatio.vertical, resolution=Resolution.hd
    )

    assert _render_size(job, vertical_project) == (1920, 1080)


def test_an_export_that_lost_its_resolution_still_renders():
    """Null on every run from before the column existed. Defaulting beats
    failing a run that has already collected every clip."""
    job = GenerationJob(
        stitch_only=True,
        export_aspect_ratio=ExportFormat.square.value,
        export_resolution=None,
    )

    assert _render_size(job, OutputSettings()) == (1080, 1080)


def test_an_export_request_defaults_to_the_commonest_cut():
    request = ExportRequest()

    assert request.format is ExportFormat.vertical
    assert request.resolution is Resolution.full_hd
