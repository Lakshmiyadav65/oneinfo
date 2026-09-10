"""
Bugs a review found in the takes / stitch / inclusion work, pinned so they
cannot come back quietly.

Each one shipped and each one was wrong in a way that produced a plausible
screen rather than an error, which is why they survived manual testing.
"""

import pytest

from app.core.config import get_settings
from app.models.project import Project
from app.schemas.output_settings import AspectRatio, OutputSettings, Resolution
from app.services.storyboard_service import _aspect_label


def _project(**output) -> Project:
    """A Project not attached to any session — enough for the pure helpers."""
    return Project(
        creator_id="creator-a",
        title="t",
        idea="i",
        language="english",
        output_settings=OutputSettings(**output).model_dump(mode="json"),
    )


@pytest.mark.parametrize(
    ("aspect", "resolution", "expected"),
    [
        (AspectRatio.vertical, Resolution.hd, "9:16 Vertical (720x1280)"),
        (AspectRatio.vertical, Resolution.full_hd, "9:16 Vertical (1080x1920)"),
        (AspectRatio.landscape, Resolution.hd, "16:9 Horizontal (1280x720)"),
    ],
)
def test_prompt_aspect_header_follows_the_project_not_the_config(
    aspect, resolution, expected
):
    """
    The header used to come from VIDEO_WIDTH/VIDEO_HEIGHT. Once shape became
    a per-project choice, the prompt could tell Veo "16:9 Horizontal" in its
    text while the request beside it asked for 9:16 - two instructions in one
    call, disagreeing.
    """
    settings = get_settings()
    label = _aspect_label(_project(aspect_ratio=aspect, resolution=resolution))

    assert label == expected
    # The bug is only visible when the two actually differ, so the fixture
    # would pass vacuously if the config happened to match.
    if aspect is AspectRatio.vertical:
        assert f"{settings.video_width}x{settings.video_height}" not in label


def test_a_project_with_no_settings_still_gets_a_label():
    """Null on every project created before the panel existed."""
    project = Project(creator_id="creator-a", title="t", idea="i", language="english")
    assert _aspect_label(project).startswith("9:16")


def test_pricing_is_not_duplicated_on_the_backend():
    """
    The backend carried its own rate tables with no callers, whose comment
    claimed to be the single source of the estimate. A second copy nothing
    reads is worse than no copy: it invites someone to "fix" the wrong one.
    """
    import app.schemas.output_settings as module

    assert not hasattr(module, "TIER_RUPEES_PER_SECOND")
    assert not hasattr(module, "RESOLUTION_MULTIPLIER")
