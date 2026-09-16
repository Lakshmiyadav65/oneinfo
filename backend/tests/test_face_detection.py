"""
The check that decides whether a b-roll clip gets generated again.

Each wrong "yes" is a paid clip thrown away, and each wrong "no" is a
stranger in the finished video - so one stray frame is not a person, and a
clip too short to have two frames is judged on the one it has.
"""

from app.providers.face_detection import FaceCheck


def test_a_face_across_the_clip_is_a_person():
    assert FaceCheck(frames_checked=8, frames_with_face=8).has_person


def test_one_stray_frame_is_not_worth_a_regeneration():
    assert not FaceCheck(frames_checked=8, frames_with_face=1).has_person


def test_no_faces_is_no_person():
    assert not FaceCheck(frames_checked=6, frames_with_face=0).has_person


def test_a_one_frame_clip_is_judged_on_that_frame():
    assert FaceCheck(frames_checked=1, frames_with_face=1).has_person


def test_the_silent_retake_request_keeps_everything_but_the_speech():
    """
    The retake request used dataclasses.replace on a pydantic model, so the
    run died with a TypeError - and only ever on a scene that came back with
    a person in it, five paid clips into a six-scene video.
    """
    from app.providers.video.base import VideoGenerationRequest
    from app.services.generation_service import silent_request

    request = VideoGenerationRequest(
        visual_prompt='SCENE:\nA laptop.\n\nDIALOGUE:\n"Idhi chudandi."\n\n'
        "NEGATIVE PROMPT:\nNo captions.",
        duration_seconds=6,
        aspect_ratio="9:16",
        resolution="720p",
        sample_count=1,
    )

    retake = silent_request(request, request.visual_prompt)

    assert "DIALOGUE:" not in retake.visual_prompt
    assert "Nobody speaks" in retake.visual_prompt
    # Everything that decides what is billed stays exactly as it was.
    assert retake.duration_seconds == 6
    assert retake.aspect_ratio == "9:16"
    assert retake.resolution == "720p"
    assert retake.sample_count == 1
    assert request.visual_prompt != retake.visual_prompt
