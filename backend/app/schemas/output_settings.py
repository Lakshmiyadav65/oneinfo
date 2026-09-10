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


# Rupees per second of generated video, by tier. Kept beside the tiers so the
# estimate the creator reads and the model the request actually uses can
# never come from two different places.
#
# These are converted list prices, not observed invoices. The GCP bill is the
# authority; this is a forecast, and it is labelled as one on screen.
TIER_RUPEES_PER_SECOND: dict[ModelTier, float] = {
    ModelTier.lite: 4.78,
    ModelTier.fast: 14.33,
}

# 1080p is billed above 720p on the full tiers. Applied as a multiplier
# rather than a second table so a tier's price stays in one place.
RESOLUTION_MULTIPLIER: dict[Resolution, float] = {
    Resolution.hd: 1.0,
    Resolution.full_hd: 2.0,
}


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
