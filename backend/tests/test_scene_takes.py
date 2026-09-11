"""
Keeping the clip a regenerate replaced.

Regenerating a scene used to delete what came before it, which left the
creator with no way to tell whether the new clip was an improvement - the
thing they pressed the button to find out. A scene now holds its last two
runs, and these pin which runs that keeps and which it lets go.
"""

import uuid

from app.services.generation_service import _runs_to_discard

RUN_ONE = uuid.uuid4()
RUN_TWO = uuid.uuid4()
RUN_THREE = uuid.uuid4()


def test_a_scene_on_its_first_run_lets_nothing_go():
    assert _runs_to_discard([(0, RUN_ONE)], keep=1) == set()


def test_the_run_a_regenerate_replaces_is_kept():
    """The whole point. Before this, take 0 was deleted as take 1 was
    written, and the creator was comparing the new clip against nothing."""
    takes = [(0, RUN_ONE), (1, RUN_TWO)]

    assert _runs_to_discard(takes, keep=2) == set()


def test_a_third_run_drops_the_oldest_and_not_the_newest():
    takes = [(0, RUN_ONE), (1, RUN_TWO), (2, RUN_THREE)]

    assert _runs_to_discard(takes, keep=2) == {RUN_ONE}


def test_every_take_of_a_run_is_kept_or_dropped_together():
    """Four takes were one price. Half a run on screen is not a comparison."""
    takes = [
        (0, RUN_ONE), (1, RUN_ONE),
        (2, RUN_TWO), (3, RUN_TWO), (4, RUN_TWO), (5, RUN_TWO),
    ]

    assert _runs_to_discard(takes, keep=1) == {RUN_ONE}


def test_clips_from_before_runs_were_recorded_count_as_one_run():
    """They all carry a null id. Treating each as its own run would delete
    them one at a time and leave a scene holding a single stray take."""
    takes = [(0, None), (1, None), (2, RUN_TWO)]

    assert _runs_to_discard(takes, keep=1) == {None}
    assert _runs_to_discard(takes, keep=2) == set()


def test_runs_are_ordered_by_take_index_not_by_the_order_they_arrive():
    """Two runs committed in the same second tie on created_at, so the index
    is what decides which is newer."""
    takes = [(2, RUN_THREE), (0, RUN_ONE), (1, RUN_TWO)]

    assert _runs_to_discard(takes, keep=1) == {RUN_ONE, RUN_TWO}


def test_a_scene_with_no_clips_lets_nothing_go():
    assert _runs_to_discard([], keep=1) == set()
