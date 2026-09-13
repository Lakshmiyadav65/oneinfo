"""
Moving a project that already exists into another language.

Changing the language used to change one column and nothing else, and the
creator was told so: "applies from the next generation, anything already
written stays as it is." That is a true sentence describing the wrong
behaviour. Someone three steps in who realises the language is wrong is
looking at five English hooks while the badge says Tenglish, and their only
way out is to regenerate - which throws away the hook they picked, the
script they edited and every setup on the storyboard.

So the language change carries the work with it. Nothing is regenerated:
each piece of existing text is restated in the new language and put back
where it was, keeping ids, selections, approvals, scene setups and
on-camera choices exactly as they were. The creator asked for a different
language, not for different work.

What is deliberately not done here is touching video. Clips already
generated speak the old language, and they were paid for - so they are left
alone and marked, the same way an edited line marks them, and it is the
creator who decides which to replace.
"""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.environment_prompt import replace_dialogue, replace_spoken_language
from app.agents.translation_agent import (
    run_line_translation_agent,
    run_script_translation_agent,
)
from app.core.config import Settings
from app.models.hook import Hook
from app.models.project import Project
from app.models.script import Script
from app.models.storyboard import Storyboard, StoryboardScene
from app.providers.llm import get_llm_provider
from app.providers.speech import speech_seconds
from app.providers.video import get_supported_durations
from app.providers.video.base import fit_duration


@dataclass
class Retranslation:
    """What actually moved, so the creator can be told rather than guess."""

    language: str
    hooks: int = 0
    script: bool = False
    scenes: int = 0
    # Scenes whose clips now speak the old language. Not regenerated here -
    # see the module docstring - but worth saying out loud, because they are
    # the only part of this that costs money to put right.
    scenes_with_clips: list[int] = field(default_factory=list)

    @property
    def changed_anything(self) -> bool:
        return self.hooks > 0 or self.script or self.scenes > 0


async def retranslate_project(
    db: AsyncSession, settings: Settings, creator_id: str, project: Project
) -> Retranslation:
    """
    Restates everything this project has already written in project.language.

    Called after the language column has been set, so the new language is
    read from the project itself. Commits once at the end: a half-translated
    project is worse than an untranslated one, because nothing on screen
    says which half.
    """
    llm = get_llm_provider(settings)
    language = project.language
    summary = Retranslation(language=language)

    await _retranslate_hooks(db, llm, project.id, language, summary)
    await _retranslate_script(db, llm, project.id, language, summary)
    await _retranslate_scenes(db, settings, llm, creator_id, project, language, summary)

    # Committed even when nothing was rewritten: the script's language
    # column is normalised on the way through, and leaving that uncommitted
    # would make the next change do the same work again.
    await db.commit()
    return summary


async def _retranslate_hooks(
    db: AsyncSession, llm, project_id: uuid.UUID, language: str, summary: Retranslation
) -> None:
    """
    Every hook, including the ones not chosen and the ones the creator typed
    themselves.

    All of them, because the hooks screen is a comparison: leaving the
    unchosen ones in the old language turns a choice between five hooks into
    a choice between one hook and four reminders that the language changed.
    """
    result = await db.execute(
        select(Hook).where(Hook.project_id == project_id).order_by(Hook.created_at)
    )
    hooks = list(result.scalars().all())
    if not hooks:
        return

    # The reason travels with its hook in the same call. It is shown directly
    # under it, and a Telugu hook explained in English reads as a bug.
    sources: list[str] = []
    for hook in hooks:
        sources.append(hook.text)
        if hook.reason:
            sources.append(hook.reason)

    translated = await run_line_translation_agent(llm, lines=sources, language=language)
    if translated == sources:
        return

    cursor = 0
    for hook in hooks:
        hook.text = translated[cursor]
        cursor += 1
        if hook.reason:
            hook.reason = translated[cursor]
            cursor += 1
    summary.hooks = len(hooks)


async def _retranslate_script(
    db: AsyncSession, llm, project_id: uuid.UUID, language: str, summary: Retranslation
) -> None:
    """
    The current version only, and in place.

    In place rather than as a new version, and keeping its approval: a new
    draft would send an approved project back a step for a change the
    creator just asked for, and the words are the same words. What changes
    is the language column beside them, which is what everything downstream
    reads to decide how to speak.
    """
    result = await db.execute(
        select(Script)
        .where(Script.project_id == project_id)
        .order_by(Script.version.desc())
        .limit(1)
    )
    script = result.scalar_one_or_none()
    if script is None:
        return

    # Compared case-insensitively, and stored back in the project's own
    # spelling. The column holds whatever the writing agent called the
    # language it wrote in - "Tenglish" as often as "tenglish" - and a
    # comparison that trusts the casing retranslates a script into the
    # language it is already in, every time the creator opens the menu.
    if script.language.strip().lower() == language:
        script.language = language
        return

    translated = await run_script_translation_agent(
        llm, script=script.content, language=language
    )
    script.language = language
    if translated == script.content:
        return
    script.content = translated
    summary.script = True


async def _retranslate_scenes(
    db: AsyncSession,
    settings: Settings,
    llm,
    creator_id: str,
    project: Project,
    language: str,
    summary: Retranslation,
) -> None:
    """
    Scene dialogue and captions, with every production choice left standing.

    The prompt is the part that is easy to get wrong. It carries both the
    line and a header naming the language to speak it in, and the two
    disagreeing is worse than either being stale: told Telugu words under an
    English instruction, Veo speaks English. So both move, and a prompt the
    creator wrote by hand has those two pieces swapped inside it rather than
    being rebuilt over.
    """
    result = await db.execute(
        select(Storyboard)
        .where(Storyboard.project_id == project.id)
        .options(selectinload(Storyboard.scenes))
    )
    storyboard = result.scalar_one_or_none()
    if storyboard is None or not storyboard.scenes:
        return

    scenes = sorted(storyboard.scenes, key=lambda scene: scene.order)
    sources: list[str] = []
    for scene in scenes:
        sources.append(scene.voiceover)
        sources.append(scene.caption)

    translated = await run_line_translation_agent(llm, lines=sources, language=language)
    if translated == sources:
        return

    edited_at = datetime.now(UTC)
    for index, scene in enumerate(scenes):
        scene.voiceover = translated[index * 2]
        scene.caption = translated[index * 2 + 1]
        # Same marker an edited line sets, for the same reason: any clip
        # already generated now says something the scene no longer says.
        scene.dialogue_edited_at = edited_at
        _retarget_prompt(scene, language)

        if scene.duration_override is None:
            allowed = get_supported_durations(
                settings, with_reference=scene.features_creator
            )
            scene.duration_seconds = fit_duration(
                speech_seconds(scene.voiceover), allowed, fallback=scene.duration_seconds
            )

    summary.scenes = len(scenes)
    summary.scenes_with_clips = await _scenes_with_clips(db, creator_id, scenes)


def _retarget_prompt(scene: StoryboardScene, language: str) -> None:
    """
    The line and the spoken-language header, swapped in place.

    Deliberately surgical even for prompts nobody hand-edited. Rebuilding
    would work here, but it needs the creator, the project and a scene count
    read back per scene, and this already runs once per scene in a loop the
    creator is waiting on.
    """
    prompt = replace_dialogue(scene.visual_prompt, scene.voiceover)
    if prompt is None:
        return
    retargeted = replace_spoken_language(prompt, language)
    scene.visual_prompt = retargeted if retargeted is not None else prompt


async def _scenes_with_clips(
    db: AsyncSession, creator_id: str, scenes: list[StoryboardScene]
) -> list[int]:
    """Scene numbers that already have video, in order."""
    from app.models.asset import Asset

    result = await db.execute(
        select(Asset.scene_id)
        .where(
            Asset.creator_id == creator_id,
            Asset.scene_id.in_([scene.id for scene in scenes]),
        )
        .distinct()
    )
    generated = set(result.scalars().all())
    return [scene.order for scene in scenes if scene.id in generated]
