"""Static contract guard for the desktop.11 fix batch (RFC #362).

`verification/export_signal_contract.mjs` and
`verification/open_elsewhere_autoretry.mjs` assert the behaviour in a real
browser; this test pins the *contract* between the parts the journeys cannot
see together: the WebView2 host reads a data attribute the renderer sets, the
renderer's signal is a documented refcount wired into all three render entry
points, the open-elsewhere wait is a documented retry with strings in both
locales, and both fixes ship through `scripts/package.py` in a fixed order.
If any side of the contract is renamed or reordered, this fails before a
Windows build spends twenty minutes discovering it.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class ExportSignalContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.host = (ROOT / "desktop" / "Host.cs").read_text(encoding="utf-8")
        self.pack = (ROOT / "scripts" / "package.py").read_text(encoding="utf-8")
        self.patch = (ROOT / "patches" / "export-signal-contract.patch").read_text(encoding="utf-8")
        self.retry = (ROOT / "patches" / "open-elsewhere-autoretry.patch").read_text(encoding="utf-8")

    def test_host_reads_the_export_signal_attribute_first(self) -> None:
        # The attribute is the public contract (PR #397 wires Electron to the
        # same state); the legacy view-query selectors remain as a fallback so
        # an older bundle keeps its exit guard. The script must OR them with
        # the attribute first.
        self.assertIn("data-od-exporting", self.host)
        self.assertLess(
            self.host.index("data-od-exporting"),
            self.host.index("cw-render-status"),
            "Host.cs must prefer the renderer contract over view internals",
        )

    def test_renderer_contract_is_a_documented_refcount(self) -> None:
        for needle in (
            "src/canvas/exportSignal.ts",
            "data-od-exporting",
            "opendirectorDesktop.setExporting",
            "exportStarted",
            "useExportSignal",
            "exportInFlight",
            "refcounted",
        ):
            self.assertIn(needle, self.patch)
        # All three render entry points hold the signal; each gate matches the
        # component's own notion of "export in flight" (finished/failed cards
        # must not hold the host hostage).
        self.assertIn("useExportSignal(renderProgress !== null);", self.patch)  # DirectorStage
        self.assertIn("useExportSignal(renderProgress !== null || packageProgress !== null);", self.patch)  # TimelineEditor
        self.assertIn('state.phase === "rendering" || state.phase === "publishing"', self.patch)  # TimelineOutput

    def test_failure_text_tells_windows_users_the_next_step(self) -> None:
        # I3: an error that names Windows N/KN must say what to install.
        self.assertEqual(self.patch.count("Media Feature Pack"), 5)
        for locale_file in (
            "src/i18n/messages/en-US/errors.ts",
            "src/i18n/messages/zh-CN/errors.ts",
        ):
            self.assertIn(locale_file, self.patch)

    def test_open_elsewhere_retry_is_documented_and_user_visible(self) -> None:
        for needle in (
            "project_open_elsewhere",
            "openElsewhereWait",
            "canvas-loading-waiting",
            "canvas.workspace.loading.openElsewhere",
        ):
            self.assertIn(needle, self.retry)
        for locale_file in (
            "src/i18n/messages/en-US/canvasWorkspace.ts",
            "src/i18n/messages/zh-CN/canvasWorkspace.ts",
        ):
            self.assertIn(locale_file, self.retry)

    def test_patches_ship_through_the_package_chain(self) -> None:
        chain = re.search(r"for patch in \((.*?)\)", self.pack, re.M | re.S)
        self.assertIsNotNone(chain, "package.py must declare its patch chain")
        names = re.findall(r"'([\w-]+\.patch)'", chain.group(1))
        self.assertEqual(
            names,
            [
                "canvas-placement.patch",
                "bundled-agent.patch",
                "timeline-output-dismiss.patch",
                "agent-gateway-terminal-failure.patch",
                "export-signal-contract.patch",
                "open-elsewhere-autoretry.patch",
                "agent-run-lease.patch",
                "work-mode.patch",
            ],
            "the patch chain order is part of the contract",
        )


if __name__ == "__main__":
    unittest.main()
