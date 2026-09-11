"""
The glossary of words the transcriber reliably gets wrong.

The substitution itself is the part worth pinning hardest: it rewrites every
transcript from the moment it is saved, so a rule that fires where it should
not is a mistake that spreads silently through a creator's whole knowledge
layer rather than showing up once.
"""

import pytest

from app.services.correction_service import apply_corrections
from tests.conftest import auth_headers


def test_a_mishearing_is_fixed_at_every_mention():
    """The real case. A name the model has never heard comes back wrong the
    same way each time it is said, which is exactly why remembering the fix
    is worth more than making it."""
    text = "three months-lo MagMain ayithe konali. AI thoti ayithe MagMain ayithe konali."

    fixed = apply_corrections(text, [("magmain", "Mac Mini")])

    assert "MagMain" not in fixed
    assert fixed.count("Mac Mini") == 2


def test_the_longest_rule_wins():
    """
    Given both "mac" -> "Mac" and "magmain" -> "Mac Mini", applying the short
    one first turns "magmain" into "Macmain" and the longer rule can never
    match again. Sorting by length is what stops one rule eating another.
    """
    fixed = apply_corrections("magmain", [("mac", "Mac"), ("magmain", "Mac Mini")])

    assert fixed == "Mac Mini"


def test_capitalisation_is_ignored_but_the_replacement_keeps_its_own():
    """A transcriber varies its capitalisation; the creator typed theirs on
    purpose."""
    fixed = apply_corrections("magmain MAGMAIN MagMain", [("magmain", "Mac Mini")])

    assert fixed == "Mac Mini Mac Mini Mac Mini"


@pytest.mark.parametrize(
    "heard,text,expected",
    [
        ("c++", "I use C++ daily", "I use Rust daily"),
        ("node.js", "node.js not nodexjs", "Rust not nodexjs"),
        ("a.b", "a.b but not axb", "Rust but not axb"),
    ],
)
def test_a_name_with_regex_characters_is_matched_literally(heard, text, expected):
    """Product names are full of dots and plus signs, and an unescaped one
    would quietly match things nobody asked it to."""
    assert apply_corrections(text, [(heard, "Rust")]) == expected


def test_a_replacement_containing_a_backslash_is_not_treated_as_a_group():
    r"""re.sub reads \1 in the replacement as a backreference. A creator
    typing one would otherwise get an error, or someone else's text."""
    assert apply_corrections("x", [("x", r"a\b")]) == r"a\b"


def test_an_empty_rule_changes_nothing():
    """It would otherwise match at every position in the text."""
    assert apply_corrections("leave me alone", [("", "X")]) == "leave me alone"


async def test_fixing_a_word_while_editing_remembers_it(client, seeded_dev_creators):
    """The whole point: the correction outlives the transcript it was made
    in, because the next reel will contain the same mistake."""
    headers = auth_headers("creator-a")
    created = await client.post(
        "/knowledge/text", json={"title": "Notes", "content": "MagMain is good"}, headers=headers
    )

    await client.patch(
        f"/knowledge/{created.json()['id']}",
        json={
            "content": "Mac Mini is good",
            "corrections": [{"heard": "MagMain", "corrected": "Mac Mini"}],
        },
        headers=headers,
    )

    glossary = await client.get("/knowledge/corrections", headers=headers)
    assert [(c["heard"], c["corrected"]) for c in glossary.json()] == [("magmain", "Mac Mini")]


async def test_a_rule_that_replaces_a_word_with_itself_is_refused(client, seeded_dev_creators):
    """It does nothing, and still costs a pass over every future transcript."""
    resp = await client.post(
        "/knowledge/corrections",
        json={"heard": "same", "corrected": "SAME"},
        headers=auth_headers("creator-a"),
    )

    assert resp.status_code == 422, resp.text


async def test_correcting_the_same_word_twice_updates_rather_than_duplicates(
    client, seeded_dev_creators
):
    """A creator who corrects, looks at it, and corrects again meant the
    second answer — not both at once, fighting over the same text."""
    headers = auth_headers("creator-a")
    await client.post(
        "/knowledge/corrections", json={"heard": "magmain", "corrected": "Mac"}, headers=headers
    )

    await client.post(
        "/knowledge/corrections",
        json={"heard": "MagMain", "corrected": "Mac Mini"},
        headers=headers,
    )

    glossary = (await client.get("/knowledge/corrections", headers=headers)).json()
    assert len(glossary) == 1
    assert glossary[0]["corrected"] == "Mac Mini"


async def test_one_creators_glossary_is_not_anothers(client, seeded_dev_creators):
    await client.post(
        "/knowledge/corrections",
        json={"heard": "magmain", "corrected": "Mac Mini"},
        headers=auth_headers("creator-a"),
    )

    theirs = await client.get("/knowledge/corrections", headers=auth_headers("creator-b"))

    assert theirs.json() == []
