import math
import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.environment_prompt import (
    aspect_ratio_label,
    compose_visual_prompt,
    replace_dialogue,
)
from app.agents.qa_agent import run_qa_agent
from app.agents.storyboard_agent import run_storyboard_agent
from app.core.config import Settings, get_settings
from app.core.errors import NotFoundError, ValidationAppError
from app.models.creator import Creator
from app.models.project import Project, ProjectStatus
from app.models.script import ContentStatus
from app.models.storyboard import Storyboard, StoryboardScene
from app.providers.llm import get_llm_provider
from app.providers.speech import speech_seconds
from app.providers.video import get_supported_durations
from app.providers.video.base import SPEECH_HEADROOM, fit_duration, snap_duration
from app.schemas.agents import StoryboardOutput
from app.schemas.agents import StoryboardScene as AgentScene
from app.schemas.environment import SceneEnvironment, environment_for_preset
from app.schemas.output_settings import OutputSettings
from app.services import (
    creator_face_service,
    project_service,
    script_service,
    tanglish_service,
)
from app.services.project_service import output_size, project_output_settings

# Matches the ceiling the storyboard prompt asks the model to respect. It
# bounds what the agent writes, never what the creator afterwards chooses:
# see set_scene_on_camera.
MAX_ON_CAMERA_SCENES = 2


def scene_environment(scene: StoryboardScene) -> SceneEnvironment:
    """
    A scene's setup, defaulted rather than nullable.

    Scenes written before setups existed have nothing stored. Handing every
    caller a null to think about would spread that history through the whole
    codebase; they get the default instead.
    """
    if not scene.environment:
        return SceneEnvironment()
    return SceneEnvironment.model_validate(scene.environment)


def project_environment(project: Project) -> SceneEnvironment:
    """The setup new scenes start from."""
    if not project.default_environment:
        return SceneEnvironment()
    return SceneEnvironment.model_validate(project.default_environment)


def _resolved(environment: SceneEnvironment, reset_to_preset: bool) -> SceneEnvironment:
    """
    The setup to store.

    Picking a preset chip means "give me that whole look", so the controls
    behind it are rebuilt from the preset's own defaults. The creator's free
    text is theirs and survives either way.
    """
    if not reset_to_preset:
        return environment
    rebuilt = environment_for_preset(environment.preset)
    rebuilt.custom_setup = environment.custom_setup
    rebuilt.custom_background = environment.custom_background
    rebuilt.additional_requirements = environment.additional_requirements
    return rebuilt


def _aspect_label(project: Project | None) -> str:
    """
    The Aspect Ratio header, from the same setting that becomes the request's
    aspectRatio parameter.

    It used to come from VIDEO_WIDTH/VIDEO_HEIGHT, so once shape became a
    per-project choice the prompt could tell Veo "16:9 Horizontal" in its
    text while the request beside it asked for 9:16. Two instructions in one
    call, disagreeing.
    """
    output = project_output_settings(project) if project else OutputSettings()
    width, height = output_size(output)
    return aspect_ratio_label(width, height)


async def _rebuild_visual(
    db: AsyncSession, creator_id: str, scene: StoryboardScene
) -> None:
    """
    Recomposes the visual prompt from the scene's setup.

    Never touches a scene whose visual the creator wrote themselves - that
    check belongs to the caller, which knows whether the creator was asked.
    """
    creator = await db.get(Creator, creator_id)
    settings = get_settings()

    # The language and the scene's position both belong in the prompt, and
    # neither is on the scene itself. These paths run when a creator edits a
    # setup, not inside the generation loop, so the extra reads are cheap.
    storyboard = await db.get(Storyboard, scene.storyboard_id)
    project = await db.get(Project, storyboard.project_id) if storyboard else None
    result = await db.execute(
        select(func.count())
        .select_from(StoryboardScene)
        .where(StoryboardScene.storyboard_id == scene.storyboard_id)
    )
    scene_count = result.scalar_one()

    scene.visual_prompt = compose_visual_prompt(
        scene_environment(scene),
        action=scene.visual_action or "",
        features_creator=scene.features_creator,
        appearance_description=creator.appearance_description if creator else None,
        voice_description=creator.voice_description if creator else None,
        dialogue=scene.voiceover,
        language=project.language if project else "english",
        aspect_ratio=_aspect_label(project),
        scene_number=scene.order,
        scene_count=scene_count,
    )


async def refresh_visual_prompts(
    db: AsyncSession, creator_id: str, scenes: list[StoryboardScene]
) -> None:
    """
    Recomposes the prompt of every scene nobody wrote by hand.

    Called immediately before a run, because the prompt is the one piece of
    a scene that is derived rather than chosen: it is built from the setup,
    the line, the language and whether the creator is in frame, and it is
    stored so the creator can read it. Stored means it can fall behind, and
    a prompt that has fallen behind is not a stale label - it is what the
    video is actually generated from.

    It is what let a b-roll scene keep asking for a presenter after the
    prompt stopped putting one there. Composing it again here costs three
    small reads against a call that costs money and a minute.

    A prompt the creator wrote themselves is never touched.
    """
    for scene in scenes:
        if not scene.visual_is_custom:
            await _rebuild_visual(db, creator_id, scene)


def _normalize_scenes(
    output: StoryboardOutput,
    allowed_durations: tuple[int, ...] | None,
    reference_durations: tuple[int, ...] | None = None,
) -> None:
    """
    Make the model's storyboard renderable before anything acts on it.

    Two things the LLM gets wrong often enough to matter: it repeats or
    skips scene numbers, and it invents durations the video provider can't
    render. Veo rejects any clip that isn't 4, 6 or 8 seconds - and because
    scenes are generated one at a time, discovering that at scene 2 means
    scene 1 has already been generated and billed. Fixing both here keeps
    the stored storyboard consistent with what generation can actually do.

    The length comes from the line, not from the number the model put next
    to it. Measured across real storyboards, that number left 27% to 43% of
    the finished video with nothing being said - a nine-word hook in an
    eight-second clip, billed in full and delivered at half speed.
    """
    scenes = sorted(output.scenes, key=lambda scene: scene.order)
    for index, scene in enumerate(scenes, start=1):
        scene.order = index
        # An on-camera scene is bound by the reference-to-video limit, which
        # is far tighter than text-to-video - on Veo it is 8 seconds and
        # nothing else. fit_duration still runs: with one option it returns
        # it, and the agent is separately told to write a line that fills it.
        allowed = reference_durations if scene.features_creator else allowed_durations
        scene.duration_seconds = fit_duration(
            speech_seconds(scene.voiceover),
            allowed,
            # A scene with no dialogue has no line to measure, so the model's
            # own figure is the only thing left to go on.
            fallback=snap_duration(scene.duration_seconds, allowed),
        )
    output.scenes = scenes


def _sentences(text: str) -> list[str]:
    """The line broken where a speaker would stop, not where a word ends."""
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [part for part in parts if part.strip()]


def _pack_to_fit(text: str, max_seconds: float) -> list[str]:
    """
    The line split into as few pieces as each will fit in.

    Splits between sentences only. A scene break mid-sentence is worse than
    a slightly long scene, and a single sentence that will not fit anywhere
    is left whole for QA to report - shortening it is a wording decision and
    belongs to the creator.
    """
    # The same headroom fit_duration leaves, so a piece that packs here is a
    # piece that gets a clip it fits in there.
    budget = max_seconds / SPEECH_HEADROOM
    total = speech_seconds(text)
    if total <= budget:
        return [text]

    # Spread evenly rather than filling each piece before starting the next.
    # Greedy packing leaves a runt at the end - a two-second tail still buys
    # a four-second clip, which is dead air bought at full price. Splitting
    # the same words across equal pieces avoids the stub entirely.
    pieces = math.ceil(total / budget)
    even = total / pieces

    chunks: list[str] = []
    current: list[str] = []
    for sentence in _sentences(text):
        candidate = [*current, sentence]
        if current and speech_seconds(" ".join(candidate)) > even:
            chunks.append(" ".join(current))
            current = [sentence]
        else:
            current = candidate
    if current:
        chunks.append(" ".join(current))
    return chunks or [text]


def _split_overlong_scenes(
    output: StoryboardOutput, allowed_durations: tuple[int, ...] | None
) -> None:
    """
    Gives a line that outruns the longest clip the extra scenes it needs.

    The prompt asks for a word count per duration and the model mostly
    obliges, but "mostly" is not a guarantee - asked for a 15-second video
    it came back with 43 words in an 8-second scene, sixteen seconds of
    speech in a clip that cannot exceed eight. Telling the prompt more
    firmly is not the fix; this is the same lesson carry_hook_over already
    learned, that an instruction a model can decline cannot hold an
    invariant. So the storyboard is repaired instead of re-requested.

    The picture and the caption are reused across the pieces. They were
    written for this beat of the script and still describe it; what changes
    is how long the beat takes to say.

    The caption used to be left blank on every piece but the first, so that
    it would not stutter on screen. It no longer appears on screen at all -
    rendering stopped burning captions in, because they put a second line of
    text over video already carrying the spoken line. All the blank did was
    fail QA, which is how a storyboard with nothing wrong with it greeted
    the creator with three red errors.
    """
    longest = max(allowed_durations) if allowed_durations else 0
    if not longest:
        return

    rebuilt: list[StoryboardScene] = []
    for scene in output.scenes:
        pieces = _pack_to_fit(scene.voiceover, longest)
        if len(pieces) == 1:
            rebuilt.append(scene)
            continue
        for piece in pieces:
            rebuilt.append(
                scene.model_copy(
                    update={
                        "voiceover": piece,
                        # Renumbered wholesale by _normalize_scenes straight
                        # after this; spaced here only to keep the sort
                        # stable in between.
                        "order": scene.order,
                    }
                )
            )
    output.scenes = rebuilt


def _on_camera_ceiling(scene_count: int) -> int:
    """
    How many scenes may feature the creator, for a storyboard this long.

    A flat two stopped being a cap once videos got short. Asked for fifteen
    seconds the storyboard comes back as two scenes - and two of two were
    on camera, which is every scene on the expensive tier and the most
    costly way to make the cheapest video on the menu.

    On camera is meant to be the shot that earns it, the hook or the closing
    line, so it is held to at most half the video and never more than two.

    This is where the storyboard starts, not where it has to stay. The
    creator can put themselves in every scene afterwards if that is the
    video they want - the ceiling exists because the model spending their
    money has no idea what any of it costs, and they do.
    """
    return min(MAX_ON_CAMERA_SCENES, max(1, scene_count // 2))


def _cap_on_camera_scenes(output: StoryboardOutput, allowed: bool) -> None:
    """
    On-camera scenes cost several times a b-roll scene, so the model is asked
    for a couple at most and held to it here. Left unchecked, an LLM that
    decides every scene should feature the creator turns a Rs.482 video into
    Rs.1,719 with no one having chosen that.
    """
    if not allowed:
        for scene in output.scenes:
            scene.features_creator = False
        return
    ceiling = _on_camera_ceiling(len(output.scenes))
    seen = 0
    for scene in output.scenes:
        if scene.features_creator:
            seen += 1
            if seen > ceiling:
                scene.features_creator = False


async def generate_storyboard(
    db: AsyncSession, settings: Settings, creator_id: str, project_id: uuid.UUID
) -> Storyboard:
    project = await project_service.get_owned_project(db, creator_id, project_id)

    english_script = await script_service.get_current_script(db, creator_id, project_id)
    if english_script.status != ContentStatus.approved:
        raise ValidationAppError("Approve the script before generating a storyboard.")

    # A localized script is optional - used only if the creator approved one,
    # and only while it is still in the project's language. Changing the
    # language restates the script itself, so a localized version left over
    # from the previous one would otherwise outrank it and put the whole
    # storyboard back into the language the creator just moved away from.
    source_content = english_script.content
    tanglish = await tanglish_service.get_latest_tanglish(db, project_id)
    if (
        tanglish is not None
        and tanglish.status == ContentStatus.approved
        and tanglish.language.value == project.language
    ):
        source_content = tanglish.content

    # The creator can only be written into the storyboard if they could
    # actually be generated: a reference photo on file and consent given.
    creator = await db.get(Creator, creator_id)
    on_camera_available = (
        creator is not None
        and creator.face_consent_at is not None
        and bool(await creator_face_service.list_faces(db, creator_id))
    )

    llm = get_llm_provider(settings)
    allowed_durations = get_supported_durations(settings)
    reference_durations = get_supported_durations(settings, with_reference=True)
    # The creator's target wins over the script's own estimate. The estimate
    # is the model guessing how long its words take to say; the target is
    # someone saying how long they want the video, and it is what the run is
    # billed against.
    target_seconds = (
        project_output_settings(project).target_duration_seconds
        or english_script.estimated_duration_seconds
    )
    output = await run_storyboard_agent(
        llm,
        script_content=source_content,
        estimated_duration_seconds=target_seconds,
        allowed_durations=allowed_durations,
        reference_durations=reference_durations,
        creator_on_camera=on_camera_available,
        appearance_description=creator.appearance_description if creator else None,
        voice_description=creator.voice_description if creator else None,
    )
    # Split first: it changes how many scenes there are, and the on-camera
    # ceiling is a fraction of that count. Then cap, because _normalize_scenes
    # picks each duration from whether the scene is on camera, so the flags
    # have to be settled before it runs.
    _split_overlong_scenes(output, allowed_durations)
    _cap_on_camera_scenes(output, on_camera_available)
    _normalize_scenes(output, allowed_durations, reference_durations)
    qa_result = run_qa_agent(output, estimated_duration_seconds=target_seconds)

    result = await db.execute(select(Storyboard).where(Storyboard.project_id == project.id))
    storyboard = result.scalar_one_or_none()
    if storyboard is None:
        storyboard = Storyboard(project_id=project.id, creator_id=creator_id)
        db.add(storyboard)
        await db.flush()
    else:
        await db.execute(delete(StoryboardScene).where(StoryboardScene.storyboard_id == storyboard.id))

    storyboard.qa_passed = qa_result.passed
    storyboard.qa_issues = qa_result.issues

    # New scenes inherit the project's default setup, so a creator picks a
    # look once instead of once per scene. The agent's visual line is kept as
    # the action and the prompt is composed around it.
    default_environment = project_environment(project)
    for scene in output.scenes:
        db.add(
            StoryboardScene(
                storyboard_id=storyboard.id,
                creator_id=creator_id,
                order=scene.order,
                duration_seconds=scene.duration_seconds,
                voiceover=scene.voiceover,
                visual_action=scene.visual_prompt,
                visual_prompt=compose_visual_prompt(
                    default_environment,
                    action=scene.visual_prompt,
                    features_creator=scene.features_creator,
                    appearance_description=creator.appearance_description if creator else None,
                    voice_description=creator.voice_description if creator else None,
                    dialogue=scene.voiceover,
                    language=project.language,
                    aspect_ratio=_aspect_label(project),
                    scene_number=scene.order,
                    scene_count=len(output.scenes),
                ),
                environment=default_environment.model_dump(mode="json"),
                caption=scene.caption,
                features_creator=scene.features_creator,
            )
        )

    project.status = ProjectStatus.storyboard
    await db.commit()

    return await get_storyboard(db, creator_id, project_id)


async def get_storyboard(db: AsyncSession, creator_id: str, project_id: uuid.UUID) -> Storyboard:
    project = await project_service.get_owned_project(db, creator_id, project_id)
    result = await db.execute(
        select(Storyboard)
        .where(Storyboard.project_id == project_id, Storyboard.creator_id == creator_id)
        .options(selectinload(Storyboard.scenes))
    )
    storyboard = result.scalar_one_or_none()
    if storyboard is None:
        raise NotFoundError("No storyboard has been generated for this project yet.")
    await _refresh_qa(db, creator_id, project, storyboard)
    return storyboard


async def _refresh_qa(
    db: AsyncSession, creator_id: str, project: Project, storyboard: Storyboard
) -> None:
    """
    Re-checks the storyboard as it stands, rather than as it was generated.

    The QA result used to be written once and then kept, which made it a
    record of a storyboard that no longer existed. A creator who shortened a
    line to fix "the end would be cut off" still saw the warning; one whose
    storyboard was fixed by a change to the code - the blank captions this
    replaced - saw three red errors on a storyboard with nothing wrong with
    it, and no way to clear them short of regenerating and losing their work.

    Cheap enough to do on every read: the checks are plain code over a
    handful of scenes, which is why they were written as code rather than as
    another model call. Only a result that actually changed is written back.
    """
    scenes = sorted(storyboard.scenes, key=lambda scene: scene.order)
    if not scenes:
        return

    output = StoryboardOutput(
        scenes=[
            AgentScene(
                order=scene.order,
                duration_seconds=scene.duration_seconds,
                voiceover=scene.voiceover,
                visual_prompt=scene.visual_prompt,
                caption=scene.caption,
                features_creator=scene.features_creator,
            )
            for scene in scenes
        ]
    )
    result = run_qa_agent(output, estimated_duration_seconds=await _target_seconds(
        db, creator_id, project
    ))

    if result.passed == storyboard.qa_passed and result.issues == storyboard.qa_issues:
        return
    storyboard.qa_passed = result.passed
    storyboard.qa_issues = result.issues
    await db.commit()


async def _target_seconds(
    db: AsyncSession, creator_id: str, project: Project
) -> int | None:
    """
    The length this video is being judged against - the creator's target if
    they set one, otherwise the script's own estimate. The same order
    generate_storyboard uses, so a re-check cannot disagree with the check
    that ran at generation.
    """
    target = project_output_settings(project).target_duration_seconds
    if target:
        return target
    try:
        script = await script_service.get_current_script(db, creator_id, project.id)
    except NotFoundError:
        return None
    return script.estimated_duration_seconds


async def set_scene_duration(
    db: AsyncSession,
    settings: Settings,
    creator_id: str,
    project_id: uuid.UUID,
    scene_id: uuid.UUID,
    duration_seconds: int | None,
) -> Storyboard:
    """
    Sets one clip's length by hand, or hands it back to the dialogue.

    Null is Auto: the length is recomputed from the words the scene has to
    say, which is what every scene does until somebody says otherwise.

    A number is checked against what the provider will actually render. Veo
    answers a bad one with "Unsupported output video duration 10 seconds,
    supported durations are [8,4,6]" - and it answers it *during* the run,
    so scenes generated before the rejection have already been billed. That
    makes this the wrong place to be permissive.
    """
    storyboard = await get_storyboard(db, creator_id, project_id)
    scene = next((s for s in storyboard.scenes if s.id == scene_id), None)
    if scene is None:
        raise NotFoundError("No such scene in this storyboard.")

    allowed = get_supported_durations(settings, with_reference=scene.features_creator)

    if duration_seconds is None:
        scene.duration_override = None
        scene.duration_seconds = fit_duration(
            speech_seconds(scene.voiceover), allowed, fallback=scene.duration_seconds
        )
        await db.commit()
        return await get_storyboard(db, creator_id, project_id)

    if allowed and duration_seconds not in allowed:
        options = ", ".join(f"{d}s" for d in sorted(allowed))
        raise ValidationAppError(
            f"The video model only generates {options} clips"
            + (
                " while you are on camera, whatever the scene says."
                if scene.features_creator
                else ", so that length can't be generated."
            )
        )

    scene.duration_override = duration_seconds
    scene.duration_seconds = duration_seconds
    await db.commit()
    return await get_storyboard(db, creator_id, project_id)


async def set_scene_on_camera(
    db: AsyncSession,
    settings: Settings,
    creator_id: str,
    project_id: uuid.UUID,
    scene_id: uuid.UUID,
    features_creator: bool,
) -> Storyboard:
    """
    Let the creator override the agent's call on which scenes they appear in.

    Turning a scene on is gated the same way generation is - a photo and
    consent - so the refusal arrives while editing rather than at the point
    of spending. Turning one off is always allowed: nobody should have to
    satisfy a precondition to take themselves out of a video.

    Not gated on how many scenes are already on camera. There is a ceiling,
    but it belongs to the agent - see _cap_on_camera_scenes, which stops a
    model that has no idea what anything costs from putting the creator in
    every scene of a video they only asked to be in one of. A creator
    ticking the box themselves has read the surcharge printed beside it and
    the running total above it, and is spending their own money. Refusing
    them at that point was the app holding an opinion about their video.
    """
    await project_service.get_owned_project(db, creator_id, project_id)
    storyboard = await get_storyboard(db, creator_id, project_id)

    scene = next((s for s in storyboard.scenes if s.id == scene_id), None)
    if scene is None:
        raise NotFoundError("No such scene in this storyboard.")

    if features_creator and not scene.features_creator:
        creator = await db.get(Creator, creator_id)
        if creator is None:
            raise NotFoundError("Creator not found.")
        creator_face_service.require_consent(creator)
        if not await creator_face_service.list_faces(db, creator_id):
            raise ValidationAppError(
                "Upload a reference photo in Settings before putting yourself on camera."
            )
    scene.features_creator = features_creator
    # Switching a scene on or off camera changes which clip lengths the
    # provider will accept, so the duration has to move with it. Without
    # this, turning on a 6-second scene produces a storyboard Veo rejects.
    allowed = get_supported_durations(settings, with_reference=features_creator)
    # A length the creator chose is a preference; a length Veo will accept is
    # a fact. Going on camera leaves 8 seconds as the only option, so a
    # 4-second choice is not narrowed here, it stops existing - and saying so
    # beats leaving a stale number on the panel next to a clip that ignored it.
    if scene.duration_override is not None and scene.duration_override not in (allowed or ()):
        scene.duration_override = None

    if scene.duration_override is None:
        # Back to fitting the line, not merely to a legal number. Snapping
        # was leaving a scene that came off camera at the 8 seconds being on
        # camera forced on it: a two-second line in an eight-second clip,
        # which is six seconds of the dead air the lengths were derived to
        # remove, and billed.
        scene.duration_seconds = fit_duration(
            speech_seconds(scene.voiceover), allowed, fallback=scene.duration_seconds
        )
    else:
        scene.duration_seconds = snap_duration(scene.duration_override, allowed)
    # The creator's appearance is written into the prompt of an on-camera
    # scene. Toggling without rebuilding left that description in a scene no
    # longer flagged on camera, so the model drew a lookalike from the words
    # while the reference photo went unused.
    if not scene.visual_is_custom:
        await _rebuild_visual(db, creator_id, scene)
    await db.commit()
    return await get_storyboard(db, creator_id, project_id)


async def set_scene_environment(
    db: AsyncSession,
    creator_id: str,
    project_id: uuid.UUID,
    scene_id: uuid.UUID,
    environment: SceneEnvironment,
    *,
    rebuild_visual: bool,
    reset_to_preset: bool = False,
) -> Storyboard:
    """
    Replaces one scene's filming setup.

    A scene whose visual the creator wrote by hand keeps that wording unless
    `rebuild_visual` says otherwise - the UI asks before setting it, so the
    choice is always the creator's rather than ours.
    """
    await project_service.get_owned_project(db, creator_id, project_id)
    storyboard = await get_storyboard(db, creator_id, project_id)

    scene = next((s for s in storyboard.scenes if s.id == scene_id), None)
    if scene is None:
        raise NotFoundError("No such scene in this storyboard.")

    scene.environment = _resolved(environment, reset_to_preset).model_dump(mode="json")
    if rebuild_visual or not scene.visual_is_custom:
        await _rebuild_visual(db, creator_id, scene)
        scene.visual_is_custom = False
    await db.commit()
    return await get_storyboard(db, creator_id, project_id)


async def set_scene_dialogue(
    db: AsyncSession,
    settings: Settings,
    creator_id: str,
    project_id: uuid.UUID,
    scene_id: uuid.UUID,
    voiceover: str,
) -> Storyboard:
    """
    Rewrites what is said in one scene.

    The script step is where the words are written, but it is not where the
    creator finds out they were wrong. That happens here, reading a line
    against the shot it is going into - or worse, after paying to watch it
    said out loud. Sending them back to the script to fix one sentence
    regenerates the whole storyboard and loses every setup on it, which is
    why the line was read-only for as long as it was.

    Three things follow the words, and all three are the reason this is not
    just an UPDATE:

      * The clip length, unless the creator has set one by hand. A shorter
        line in an unchanged clip is the dead air measured across their
        storyboards; a longer one gets its ending cut off.
      * The prompt, which carries the dialogue verbatim - it is the only
        thing telling the video model what to say and in which language.
      * The timestamp, which is what marks clips already generated as
        speaking a line this scene no longer has.
    """
    line = voiceover.strip()
    if not line:
        raise ValidationAppError("A scene needs something to say.")

    await project_service.get_owned_project(db, creator_id, project_id)
    storyboard = await get_storyboard(db, creator_id, project_id)

    scene = next((s for s in storyboard.scenes if s.id == scene_id), None)
    if scene is None:
        raise NotFoundError("No such scene in this storyboard.")

    # Saving the line unchanged must not age the clips. The creator opened
    # the editor, thought about it, and left it as it was.
    if line == scene.voiceover.strip():
        return storyboard

    scene.voiceover = line
    scene.dialogue_edited_at = datetime.now(UTC)

    # Auto follows the new line. A length the creator picked stays picked:
    # they chose it against this scene, not against this sentence.
    if scene.duration_override is None:
        allowed = get_supported_durations(settings, with_reference=scene.features_creator)
        scene.duration_seconds = fit_duration(
            speech_seconds(line), allowed, fallback=scene.duration_seconds
        )

    if scene.visual_is_custom:
        # Their wording for the shot survives; only the quoted line inside
        # it moves. A prompt with no DIALOGUE block was written far enough
        # from the generated shape that there is nothing to swap, and
        # guessing where speech belongs in it would be worse than leaving it.
        swapped = replace_dialogue(scene.visual_prompt, line)
        if swapped is not None:
            scene.visual_prompt = swapped
    else:
        await _rebuild_visual(db, creator_id, scene)

    await db.commit()
    return await get_storyboard(db, creator_id, project_id)


async def set_scene_visual(
    db: AsyncSession,
    creator_id: str,
    project_id: uuid.UUID,
    scene_id: uuid.UUID,
    visual_prompt: str,
) -> Storyboard:
    """
    The creator's own words for what the shot looks like.

    Marks the scene custom, which is what stops a later change of setup from
    rebuilding over it without asking.
    """
    if not visual_prompt.strip():
        raise ValidationAppError("A scene needs a visual description.")

    await project_service.get_owned_project(db, creator_id, project_id)
    storyboard = await get_storyboard(db, creator_id, project_id)

    scene = next((s for s in storyboard.scenes if s.id == scene_id), None)
    if scene is None:
        raise NotFoundError("No such scene in this storyboard.")

    scene.visual_prompt = visual_prompt.strip()
    scene.visual_is_custom = True
    await db.commit()
    return await get_storyboard(db, creator_id, project_id)


async def set_project_environment(
    db: AsyncSession,
    creator_id: str,
    project_id: uuid.UUID,
    environment: SceneEnvironment,
    *,
    apply_to_all: bool,
    reset_to_preset: bool = False,
) -> Project:
    """
    The setup new scenes inherit, and optionally every existing scene too.

    `apply_to_all` still spares a scene whose visual the creator wrote: the
    setup moves, the words do not. Anything else would make one click destroy
    work across a whole storyboard.
    """
    project = await project_service.get_owned_project(db, creator_id, project_id)
    project.default_environment = _resolved(environment, reset_to_preset).model_dump(mode="json")

    if apply_to_all:
        result = await db.execute(
            select(Storyboard)
            .where(Storyboard.project_id == project_id)
            .options(selectinload(Storyboard.scenes))
        )
        storyboard = result.scalar_one_or_none()
        for scene in storyboard.scenes if storyboard else []:
            scene.environment = project.default_environment
            if not scene.visual_is_custom:
                await _rebuild_visual(db, creator_id, scene)

    await db.commit()
    await db.refresh(project)
    return project


async def set_scene_inclusion(
    db: AsyncSession,
    creator_id: str,
    project_id: uuid.UUID,
    scene_id: uuid.UUID,
    included: bool,
) -> Storyboard:
    """
    Leaves a scene out of the finished video, or puts it back.

    The scene is kept either way. Deleting it would throw away a clip the
    creator may already have paid to generate, and the usual reason to drop
    a shot is that this cut does not need it - not that it was never worth
    making.

    The last remaining scene cannot be excluded: a video with no scenes in
    it is not something to let someone build by accident.
    """
    await project_service.get_owned_project(db, creator_id, project_id)
    storyboard = await get_storyboard(db, creator_id, project_id)

    scene = next((s for s in storyboard.scenes if s.id == scene_id), None)
    if scene is None:
        raise NotFoundError("No such scene in this storyboard.")

    if not included:
        remaining = [
            s for s in storyboard.scenes if s.included_in_video and s.id != scene_id
        ]
        if not remaining:
            raise ValidationAppError(
                "This is the only scene left in the video. Leave at least one in."
            )

    scene.included_in_video = included
    await db.commit()
    return await get_storyboard(db, creator_id, project_id)

