"""
What a video is generated at, as choices the creator makes per project.

These are the levers Google Flow puts next to its generate button, and the
reason they belong to the creator rather than to a config file is that every
one of them changes what the run costs. A setting that changes the bill is a
decision, and a decision belongs on screen.

Deliberately absent: clip length. Flow offers it here, but a scene's length
is decided per scene in the storyboard, where it can be weighed against what
the scene actually has to say. A second copy on this panel would silently
overwrite that.
"""

import enum
from typing import Literal

from pydantic import BaseModel


class AspectRatio(str, enum.Enum):
    landscape = "16:9"
    vertical = "9:16"


class Resolution(str, enum.Enum):
    hd = "720p"
    full_hd = "1080p"


class ModelTier(str, enum.Enum):
    """
    Named by what the creator is choosing, not by model id. Ids change with
    every Veo release; "cheapest that works" does not.
    """

    lite = "lite"
    fast = "fast"


# Pricing deliberately lives in the client, in
# frontend/src/lib/workflow/scene-cost.ts, because the estimate is only ever
# displayed and never enforced: nothing on this side reads a rupee figure.
# A second copy here had no callers at all and claimed in its own comment to
# be the single source of truth, which made it worse than absent.


class OutputSettings(BaseModel):
    """One project's generation settings. Every field has a working default,
    so a creator who never opens the panel still generates the same video
    they would have before it existed."""

    aspect_ratio: AspectRatio = AspectRatio.vertical
    resolution: Resolution = Resolution.hd
    # The tier b-roll runs on. A scene with the creator in frame ignores this
    # and uses the reference tier regardless: Lite rejects reference images
    # outright, so there is no cheaper option to offer.
    model_tier: ModelTier = ModelTier.lite
    # How many takes of each scene to generate, so a creator can pick the one
    # that came out best instead of paying for a whole re-run. Multiplies the
    # cost of the run by exactly this number.
    takes: Literal[1, 2, 3, 4] = 1
