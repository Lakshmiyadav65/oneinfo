from typing import cast

from app.models.tanglish import LocalizedLanguage
from app.providers.llm.base import LLMProvider
from app.schemas.agents import TanglishOutput

# Each language needs its own instruction: the two code-mixed variants stay in
# Latin script (so they read the way creators actually type), while Telugu is
# written in its own script. Spelling this out per language matters — asking
# for "Telugu" without saying which script gets inconsistent output.
_LANGUAGE_INSTRUCTIONS: dict[LocalizedLanguage, str] = {
    LocalizedLanguage.tanglish: (
        "natural, spoken Tanglish (Tamil-English code-mixed) written in the "
        "Latin alphabet, the way a real Tamil creator would actually say it "
        "out loud — keep common English words in English rather than forcing "
        "literary Tamil equivalents"
    ),
    LocalizedLanguage.tenglish: (
        "natural, spoken Tenglish (Telugu-English code-mixed) written in the "
        "Latin alphabet, the way a real Telugu creator would actually say it "
        "out loud — keep common English words in English rather than forcing "
        "literary Telugu equivalents"
    ),
    LocalizedLanguage.telugu: (
        "natural, spoken Telugu written in the Telugu script (తెలుగు). Use "
        "conversational spoken Telugu, not formal literary Telugu. Widely "
        "used English loan words may stay in Latin script where a Telugu "
        "speaker would naturally say them that way"
    ),
}


async def run_tanglish_agent(
    llm: LLMProvider, *, english_script: str, language: LocalizedLanguage
) -> TanglishOutput:
    instruction = _LANGUAGE_INSTRUCTIONS[language]
    prompt = (
        "SYSTEM: You are OneInfo's script localization assistant. Rewrite "
        f"the following English script as {instruction} — not a mechanical "
        "word-for-word translation. Preserve the hook's punch, the structure, "
        "and roughly the same spoken length.\n\n"
        f"ENGLISH SCRIPT: {english_script}\n"
    )
    result = await llm.generate_structured(prompt, TanglishOutput)
    return cast(TanglishOutput, result)
