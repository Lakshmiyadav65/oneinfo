"""
The script's shape on the page.

A script used to arrive as one paragraph of prose. It is now written as
labelled beats and rendered into the editor as a bare label followed by the
spoken line in quotes - the format the storyboard also relies on to tell
dialogue from structure.
"""

import pytest

from app.agents.script_agent import BEATS, _LANGUAGE_INSTRUCTIONS, render_script
from app.schemas.agents import ScriptBeat


def test_render_puts_the_label_above_the_quoted_line():
    rendered = render_script(
        [
            ScriptBeat(label="Hook", line="Naa community lo unna 50 members ni teesukoni pothunna."),
            ScriptBeat(label="CTA", line="Interested aithe naku DM cheyyandi."),
        ]
    )

    assert rendered == (
        'Hook\n"Naa community lo unna 50 members ni teesukoni pothunna."\n\n'
        'CTA\n"Interested aithe naku DM cheyyandi."'
    )


def test_render_strips_stray_whitespace_inside_the_quotes():
    rendered = render_script([ScriptBeat(label="Hook", line="  padded line  ")])

    assert rendered == 'Hook\n"padded line"'


def test_the_beats_are_the_four_the_format_calls_for():
    assert [label for label, _ in BEATS] == ["Hook", "Curiosity", "Value", "CTA"]


@pytest.mark.parametrize("language", ["english", "tenglish", "telugu"])
def test_every_project_language_has_its_own_instruction(language):
    assert _LANGUAGE_INSTRUCTIONS[language]


def test_an_unknown_language_falls_back_to_english_rather_than_failing():
    """
    A missing key must not raise mid-generation. English is the safe default;
    silently omitting the rule would let the model pick for itself.
    """
    assert _LANGUAGE_INSTRUCTIONS.get("klingon", _LANGUAGE_INSTRUCTIONS["english"]) == (
        _LANGUAGE_INSTRUCTIONS["english"]
    )
