"""
Restating work that already exists in a different language.

Separate from the agents that write. Those are given an idea and asked for
something new; this one is given the creator's own approved lines and asked
to say the same thing in another language. The difference matters: a
regeneration would quietly replace the hook they picked and the sentences
they edited, and the creator asked for a language change, not a rewrite.

Everything here is defensive about counts. A model that returns nine lines
for ten leaves a scene silently holding someone else's dialogue, so a
mismatched answer is thrown away whole and the originals stand.
"""

from typing import cast

from app.providers.llm.base import LLMProvider
from app.schemas.agents import TranslatedLines, TranslatedScript

# Keyed by the project's own language values, not by LocalizedLanguage: this
# runs when a creator changes the project language, and the wording has to
# match what the script agent would have written had they picked it first.
LANGUAGE_INSTRUCTIONS: dict[str, str] = {
    "english": (
        "plain spoken English, the way a creator talks to camera - not "
        "formal or written English"
    ),
    "tenglish": (
        "natural, spoken Tenglish (Telugu-English code-mixed) written in the "
        "Latin alphabet, the way a real Telugu creator would actually say it "
        "out loud - keep the English words a Telugu speaker would naturally "
        "use rather than forcing literary Telugu equivalents"
    ),
    "telugu": (
        "natural, spoken Telugu written in the Telugu script (తెలుగు). Use "
        "conversational spoken Telugu, not formal literary Telugu. Widely "
        "used English loan words may stay in Latin script where a Telugu "
        "speaker would naturally say them that way"
    ),
}

# What never changes language, whatever the target. Brand and product names
# are said the same way in every one of these languages, and a creator whose
# video is about Amazon does not want it to be about something else.
_KEEP_AS_IS = (
    "Keep brand names, product names, people's names, numbers, prices and "
    "units exactly as they appear. Keep the tone and roughly the spoken "
    "length of each line - these are timed to video clips."
)


def instruction_for(language: str) -> str:
    """Falls back to English rather than letting the model guess, which is
    how a line quietly comes back in a language nobody asked for."""
    return LANGUAGE_INSTRUCTIONS.get(language, LANGUAGE_INSTRUCTIONS["english"])


async def run_line_translation_agent(
    llm: LLMProvider, *, lines: list[str], language: str
) -> list[str]:
    """
    The same lines, in another language, in the same order.

    Returns the originals unchanged if the model answers with a different
    number of lines. Half a translation is worse than none: the creator can
    see that nothing happened, but they cannot see that line seven is now
    line six's translation.
    """
    if not lines:
        return []

    numbered = "\n".join(f"{index + 1}. {line}" for index, line in enumerate(lines))
    prompt = (
        "SYSTEM: You are OneInfo's localization assistant. Rewrite each "
        f"numbered line below as {instruction_for(language)}. This is not a "
        "mechanical word-for-word translation - say what the line says, the "
        "way someone speaking that language would say it.\n"
        f"{_KEEP_AS_IS}\n"
        f"Return exactly {len(lines)} lines in `lines`, in the same order, "
        "with the numbering removed.\n\n"
        f"LINES:\n{numbered}\n"
    )
    result = cast(TranslatedLines, await llm.generate_structured(prompt, TranslatedLines))

    if len(result.lines) != len(lines):
        return lines
    # A blank where a line was is the same failure in a different shape.
    return [
        new.strip() if new.strip() else old
        for new, old in zip(result.lines, lines, strict=True)
    ]


async def run_script_translation_agent(
    llm: LLMProvider, *, script: str, language: str
) -> str:
    """
    A whole script restated, keeping the labelled-beat layout intact.

    The labels are structure, not content: the script view parses them to
    show the beats, and the storyboard reads dialogue out from under them.
    Translating "Hook" into Telugu breaks both.
    """
    if not script.strip():
        return script

    prompt = (
        "SYSTEM: You are OneInfo's localization assistant. Rewrite the "
        f"following video script as {instruction_for(language)} - not a "
        "mechanical word-for-word translation. Preserve the hook's punch, "
        "the structure, and roughly the same spoken length.\n"
        f"{_KEEP_AS_IS}\n"
        "The script is written as labelled beats: a bare label on its own "
        "line (Hook, Curiosity, Value, CTA) followed by the spoken line in "
        "double quotes. Keep that exact layout, and keep the labels in "
        "English, unchanged. Rewrite only the quoted lines.\n\n"
        f"SCRIPT:\n{script}\n"
    )
    result = cast(TranslatedScript, await llm.generate_structured(prompt, TranslatedScript))
    return result.script.strip() or script
