"""Static guard: A3 plan/build execution modes are server-enforced.

The web UI may offer a Plan toggle, but the refusal must live at the one choke
point every built-in runtime passes through (ToolGateway -> AgentTools.execute),
so no client and no native CLI path can write while a plan turn is active.
"""

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCH = (ROOT / "patches" / "agent-plan-mode.patch").read_text(encoding="utf-8")


class AgentPlanModeTests(unittest.TestCase):
    def test_the_refusal_lives_at_the_business_tool_entry(self) -> None:
        # A3: the enforcement point is AgentTools.execute, keyed on the run mode.
        self.assertIn("+                      execution_directory: Path | None = None, mode: str = 'build') -> JsonValue:", PATCH)
        self.assertIn("async def execute(self, project_id: UUID, turn_id: UUID, session: str, call_id: str,", PATCH)
        self.assertIn("if mode == 'plan' and command.type in COMMANDS:", PATCH)
        self.assertIn("if mode == 'plan' and name in {'timeline_package_import', 'voice_create', 'voice_delete'}:", PATCH)
        self.assertEqual(PATCH.count("code='plan_readonly'"), 2)
        # Reads stay allowed so a plan can inspect state before proposing writes.
        self.assertNotIn("if mode == 'plan' and command.type not in COMMANDS:", PATCH)

    def test_the_gateway_threads_the_run_mode_through(self) -> None:
        self.assertIn("self.execution_directory, self.run.mode)", PATCH)
        # The refusal must be a ProjectError the API can localize, not a bare string.
        self.assertIn("ProjectError('计划模式为只读，写入被拒绝。切换到执行模式后再执行此操作。', 403, code='plan_readonly')", PATCH)

    def test_the_api_persists_the_mode_on_the_turn(self) -> None:
        # RunContext + payload: 'build' stays the default for every older client.
        self.assertIn("mode: str = 'build'", PATCH)
        self.assertEqual(PATCH.count("mode: Literal['plan', 'build'] = 'build'"), 2)
        self.assertIn("'mode': value.mode,", PATCH)
        self.assertIn("mode=value.mode)", PATCH)
        # The mode is saved with the messages so a reloaded conversation keeps its labels.
        self.assertIn("'thinking': value.thinking, 'tools': activities,", PATCH)
        self.assertIn("'mode': value.mode,", PATCH)

    def test_direct_http_clients_get_an_english_refusal(self) -> None:
        self.assertIn('"plan_readonly": "Plan mode is read-only. Switch to Build mode, then run this action again.",', PATCH)

    def test_the_composer_offers_a_real_radiogroup_with_a_plan_badge(self) -> None:
        self.assertIn('role="radiogroup"', PATCH)
        self.assertIn('role="radio"', PATCH)
        self.assertIn("assistant.mode.planHint", PATCH)
        self.assertIn("chat.selectAgent({ mode: option })", PATCH)
        self.assertIn("cw-assistant-plan-badge", PATCH)
        self.assertIn("assistant.mode.planBadge", PATCH)

    def test_the_tool_error_is_localized_in_the_web_ui(self) -> None:
        self.assertIn('"assistant.reply.toolPlanReadonly":', PATCH)
        self.assertIn('"计划模式为只读，写入被拒绝。切换到执行模式后再执行此操作。":', PATCH)
        self.assertIn('"assistant.reply.toolPlanReadonly":', PATCH)
        self.assertIn("Plan mode is read-only. Switch to Build mode, then run this action again.", PATCH)

    def test_the_browser_fixture_proves_the_server_refusal(self) -> None:
        # The fixture refuses an armed write through the real ToolGateway.
        self.assertIn("from opendirector.agent.gateway import ToolGateway", PATCH)
        self.assertIn("'plan-refusal-probe', 'execute_command',", PATCH)
        self.assertIn("plan_refusals.append(dict(name=name, mode=run.mode,", PATCH)
        self.assertIn("assistantModes=assistant_modes, planRefusals=plan_refusals,", PATCH)

    def test_the_journey_is_bilingual_and_checks_the_refusal_contract(self) -> None:
        journey = (ROOT / "verification" / "agent_plan_mode.mjs").read_text(encoding="utf-8")
        self.assertIn("plan_readonly", journey)
        self.assertIn("cw-assistant-plan-badge", journey)
        self.assertIn('agent_plan_mode ${LOCALE}: PASS', journey)

    def test_the_patch_chain_stays_declared_in_the_packager(self) -> None:
        pack = (ROOT / "scripts" / "package.py").read_text(encoding="utf-8")
        chain = re.search(r"for patch in \((.*?)\)", pack, re.M | re.S)
        self.assertIsNotNone(chain, "package.py must declare its patch chain")
        self.assertIn("'agent-plan-mode.patch'", chain.group(1))


if __name__ == "__main__":
    unittest.main()
