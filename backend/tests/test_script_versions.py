"""
Regenerating keeps what it replaced, and keeps the hook.

A regenerate used to overwrite a draft in place, so a creator who preferred
the previous take had no way back to it. And it rewrote the hook along with
everything else, undoing a choice made a step earlier.
"""

from app.agents.script_agent import HOOK_LABEL, carry_hook_over, parse_script, render_script
from app.schemas.agents import ScriptBeat


def _beats(hook: str, cta: str) -> list[ScriptBeat]:
    return [ScriptBeat(label="Hook", line=hook), ScriptBeat(label="CTA", line=cta)]


def test_parse_reads_back_what_render_wrote():
    beats = _beats("Original hook.", "Comment SARVAM.")
    assert parse_script(render_script(beats)) == beats


def test_prose_is_not_mistaken_for_beats():
    assert parse_script("One long paragraph with no labels at all.") is None


def test_regenerating_keeps_the_previous_hook_and_nothing_else():
    previous = render_script(_beats("The hook they chose.", "Old CTA."))
    fresh = _beats("A REWRITTEN hook the model invented.", "New CTA.")

    carried = carry_hook_over(fresh, previous)

    assert carried[0].line == "The hook they chose."
    # Only the hook is pinned; the rest is the new take.
    assert carried[1].line == "New CTA."


def test_the_hook_is_matched_by_label_not_position():
    previous = render_script(
        [ScriptBeat(label="Intro", line="not the hook"), ScriptBeat(label="Hook", line="the real hook")]
    )
    carried = carry_hook_over(_beats("fresh hook", "cta"), previous)

    assert carried[0].line == "the real hook"


def test_an_unparseable_previous_version_leaves_the_new_take_alone():
    """
    A script from before the beat format has no hook to carry. Falling back to
    the fresh one beats refusing to regenerate.
    """
    fresh = _beats("fresh hook", "cta")

    assert carry_hook_over(fresh, "old prose script with no structure") == fresh


def test_the_hook_label_matches_the_first_declared_beat():
    """Guards against the label and the carry-over drifting apart."""
    assert HOOK_LABEL == "Hook"
