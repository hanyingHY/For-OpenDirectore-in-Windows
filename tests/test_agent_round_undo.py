"""Static guard: E1 round review and undo stay wired into the packager, CI and journey.

The behaviour itself is pinned by the upstream unit tests (tests/test_agent_rounds.py in the
patched tree) and by verification/agent_round_undo.mjs. These guards catch a patch that is
generated but not shipped: a missing packager entry, a CI lane that does not apply it, or a
journey that stops asserting the undo contract.
"""

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCH = (ROOT / "patches" / "agent-round-undo.patch").read_text(encoding="utf-8")


class AgentRoundUndoTests(unittest.TestCase):
    def test_the_ledger_is_written_after_the_command_commits(self) -> None:
        self.assertIn("+        try:", PATCH)
        self.assertIn("await asyncio.to_thread(record_change, self.projects, project_id, turn_id, call_id, command.type, receipt)", PATCH)
        self.assertIn("agent round ledger write failed", PATCH)

    def test_undo_is_replayed_through_history_with_field_level_conflicts(self) -> None:
        self.assertIn("'type': 'history.undo',", PATCH)
        self.assertIn("'expectedVersions': current_versions(snapshot, item['changed']),", PATCH)
        self.assertIn("if status == 'rejected':", PATCH)

    def test_running_turns_refuse_round_undo(self) -> None:
        self.assertIn("if project_id in active:", PATCH)
        self.assertIn("code='agent_running'", PATCH)

    def test_the_patch_is_declared_in_the_packager_and_ci(self) -> None:
        pack = (ROOT / "scripts" / "package.py").read_text(encoding="utf-8")
        chain = re.search(r"for patch in \((.*?)\)", pack, re.M | re.S)
        self.assertIsNotNone(chain)
        self.assertIn("'agent-round-undo.patch'", chain.group(1))
        workflow = (ROOT / ".github" / "workflows" / "canvas.yml").read_text(encoding="utf-8")
        self.assertEqual(workflow.count("../patches/agent-round-undo.patch"), 2)
        self.assertIn("LOCALE=zh-CN node tests/agent_round_undo.mjs", workflow)
        self.assertIn("LOCALE=en-US node tests/agent_round_undo.mjs", workflow)

    def test_the_journey_asserts_the_full_contract(self) -> None:
        journey = (ROOT / "verification" / "agent_round_undo.mjs").read_text(encoding="utf-8")
        for needle in ("/changes", "undoButton.click()", "every((item) => item.state === \"undone\")", "agent_round_undo ${LOCALE}: PASS"):
            self.assertIn(needle, journey)


if __name__ == "__main__":
    unittest.main()
