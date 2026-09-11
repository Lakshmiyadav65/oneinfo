"""
The words this creator's transcriber reliably gets wrong.

Applied on the way out of transcription, before the text is filed, so a name
the model has never heard is fixed once and stays fixed — rather than being
corrected by hand in every reel from now until someone gives up.
"""

import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationAppError
from app.models.transcript_correction import TranscriptCorrection

# A glossary is a list a person maintains, not a data set. Past this it has
# stopped being corrections and started being a find-and-replace script, and
# every transcription pays for the whole list.
MAX_CORRECTIONS = 100


def apply_corrections(text: str, pairs: list[tuple[str, str]]) -> str:
    """
    Substitutes every known mishearing, longest first.

    Longest first is the part that matters. Given both "mac" -> "Mac" and
    "magmain" -> "Mac Mini", applying the short one first turns "magmain"
    into "Macmain" and the longer rule then never matches. Sorting by length
    means the most specific rule always gets its chance.

    Case-insensitive and escaped, matching what the editor does when a
    creator uses "fix a word everywhere" — the two must agree, or a rule
    learned from an edit would behave differently the next time round.
    """
    for heard, corrected in sorted(pairs, key=lambda pair: len(pair[0]), reverse=True):
        if not heard:
            continue
        text = re.sub(re.escape(heard), corrected.replace("\\", r"\\"), text, flags=re.IGNORECASE)
    return text


async def list_corrections(db: AsyncSession, creator_id: str) -> list[TranscriptCorrection]:
    result = await db.execute(
        select(TranscriptCorrection)
        .where(TranscriptCorrection.creator_id == creator_id)
        .order_by(TranscriptCorrection.created_at.desc())
    )
    return list(result.scalars().all())


async def corrections_for(db: AsyncSession, creator_id: str) -> list[tuple[str, str]]:
    """The glossary as substitution pairs, ready for apply_corrections."""
    return [(row.heard, row.corrected) for row in await list_corrections(db, creator_id)]


async def remember(
    db: AsyncSession, creator_id: str, heard: str, corrected: str
) -> TranscriptCorrection | None:
    """
    Records one correction, or updates the target of an existing one.

    Returns None for anything not worth keeping rather than raising: these
    arrive as a side effect of saving an edit, and a creator who typed
    something odd into the fix box should still get their edit saved.
    """
    heard = heard.strip().lower()
    corrected = corrected.strip()

    # A blank rule matches everything; a rule that maps a word to itself is a
    # no-op that still costs a pass over every future transcript.
    if not heard or not corrected or heard == corrected.lower():
        return None

    existing = (
        await db.execute(
            select(TranscriptCorrection).where(
                TranscriptCorrection.creator_id == creator_id,
                TranscriptCorrection.heard == heard,
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        existing.corrected = corrected
        await db.commit()
        await db.refresh(existing)
        return existing

    if len(await list_corrections(db, creator_id)) >= MAX_CORRECTIONS:
        return None

    row = TranscriptCorrection(creator_id=creator_id, heard=heard, corrected=corrected)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def add_correction(
    db: AsyncSession, creator_id: str, heard: str, corrected: str
) -> TranscriptCorrection:
    """
    The same thing, asked for directly, where saying no out loud is right.

    `remember` is called while saving something else and stays quiet; this is
    someone typing into the glossary and waiting to see what happened.
    """
    if not heard.strip() or not corrected.strip():
        raise ValidationAppError("Both the misheard word and the correction are needed.")
    if heard.strip().lower() == corrected.strip().lower():
        raise ValidationAppError("That correction is the same as what it replaces.")
    if len(await list_corrections(db, creator_id)) >= MAX_CORRECTIONS:
        raise ValidationAppError(
            f"That is {MAX_CORRECTIONS} corrections, which is as many as this list holds. "
            "Remove one you no longer need."
        )

    row = await remember(db, creator_id, heard, corrected)
    if row is None:
        raise ValidationAppError("That correction could not be saved.")
    return row


async def delete_correction(db: AsyncSession, creator_id: str, correction_id: uuid.UUID) -> None:
    row = (
        await db.execute(
            select(TranscriptCorrection).where(
                TranscriptCorrection.id == correction_id,
                TranscriptCorrection.creator_id == creator_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        # 404 rather than 403, so one creator's list cannot be probed for
        # another's rows — the same rule the knowledge documents follow.
        raise NotFoundError("Correction not found.")
    await db.delete(row)
    await db.commit()
