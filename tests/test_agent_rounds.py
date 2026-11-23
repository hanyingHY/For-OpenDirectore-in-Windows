"""Agent round ledger: review and undo one turn's writes as a unit (agent_rounds)."""
from uuid import uuid4

from opendirector.application.agent_rounds import read_ledger, record_change, round_changes, undo_round
from opendirector.domain.creation.base import agent_command_id
from opendirector.domain.creation.commands import parse_command
from test_creation_canvas_service import project, media, ver


def agent(store, pid, session, turn, call, kind, versions=(), **payload):
    command = parse_command(dict(commandId=agent_command_id(turn, call), projectId=pid, type=kind,
                                 expectedVersions=versions, payload=payload))
    receipt = store.execute(command, session=session, source='agent')
    record_change(store, pid, turn, call, kind, receipt)
    return receipt


def ui(store, pid, session, kind, versions=(), **payload):
    command = parse_command(dict(commandId=uuid4(), projectId=pid, type=kind, expectedVersions=versions, payload=payload))
    return store.execute(command, session=session, source='ui')


def item(store, pid, item_id):
    return next(i for i in store.snapshot(pid).canvasItems if i.id == item_id)


def test_round_undo_reverts_every_agent_write_of_the_turn_newest_first(project):
    store, pid, session = project
    node, _ = media(project)
    turn = uuid4()
    first = agent(store, pid, session, turn, 'call-1', 'canvas.move', versions=[ver('canvas_item', node)],
                  items=[dict(itemId=node.id, position=dict(x=40, y=10))])
    assert first.status == 'applied' and first.eventCursor
    second = agent(store, pid, session, turn, 'call-2', 'canvas.hide', versions=[ver('canvas_item', item(store, pid, node.id))],
                   itemId=node.id)
    assert second.status == 'applied'
    changes = round_changes(store, pid, turn)
    assert [i['state'] for i in changes['items']] == ['applied', 'applied']
    assert changes['undoable'] == 2
    assert [i['callId'] for i in read_ledger(store, pid, turn)] == ['call-1', 'call-2']

    result = undo_round(store, pid, turn, session)
    assert [r['status'] for r in result['results']] == ['applied', 'applied']
    assert result['complete'] is True
    assert [i['state'] for i in result['items']] == ['undone', 'undone']
    restored = item(store, pid, node.id)
    assert restored.visible and (restored.position.x, restored.position.y) != (40, 10)


def test_a_later_user_edit_stops_the_round_without_overwriting_it(project):
    store, pid, session = project
    node, _ = media(project)
    turn = uuid4()
    moved = agent(store, pid, session, turn, 'call-1', 'canvas.move', versions=[ver('canvas_item', node)],
                  items=[dict(itemId=node.id, position=dict(x=40, y=10))])
    assert moved.status == 'applied'
    user = ui(store, pid, session, 'canvas.move', versions=[ver('canvas_item', item(store, pid, node.id))],
              items=[dict(itemId=node.id, position=dict(x=77, y=77))])
    assert user.status == 'applied'

    result = undo_round(store, pid, turn, session)
    assert result['results'][0]['status'] == 'rejected'
    assert result['complete'] is False
    current = item(store, pid, node.id)
    assert (current.position.x, current.position.y) == (77, 77)


def test_unknown_turn_has_an_empty_round_and_undo_is_a_no_op(project):
    store, pid, session = project
    turn = uuid4()
    assert round_changes(store, pid, turn) == dict(turnId=str(turn), items=[], undoable=0)
    result = undo_round(store, pid, turn, session)
    assert result['results'] == [] and result['complete'] is True


def test_non_undoable_agent_writes_are_not_recorded(project):
    store, pid, session = project
    turn = uuid4()
    record_change(store, pid, turn, 'call-x', 'project.rename', type('R', (), {'status': 'applied', 'eventCursor': 3, 'commandId': uuid4()})())
    assert read_ledger(store, pid, turn) == []
