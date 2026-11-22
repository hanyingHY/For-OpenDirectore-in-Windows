/** Browser launcher for the verification journeys in this repository.
 *
 * The pinned upstream tree already owns the policy — which engine, which
 * container flags, which environment variables — in `tests/browser/engine.mjs`.
 * Running the journey inside that checkout (the way `.github/workflows/canvas.yml`
 * does: it copies these files into `tests/`) must therefore reuse it verbatim, so
 * that a flag change upstream shows up here instead of silently diverging.
 *
 * The local copy exists for the second case: a script run straight from this
 * repository, with a source tree mounted next to it or no tree at all (a container
 * that only wants the recorded reel). It reads the same variables and passes the
 * same Chromium flags.
 */
const upstreamPaths = [
  "../source/tests/browser/engine.mjs", // this repository, with the pinned checkout mounted
  "./browser/engine.mjs", // copied into upstream's tests/ directory by CI
];

export async function launchBrowser() {
  for (const relative of upstreamPaths) {
    try {
      const engine = await import(new URL(relative, import.meta.url).href);
      if (typeof engine.launchBrowser === "function") return engine.launchBrowser();
    } catch (error) {
      if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    }
  }
  const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
  const name = process.env.BROWSER ?? "chromium";
  const engine = playwright[name];
  if (!engine) throw new Error(`unknown BROWSER=${name}`);
  const executablePath = process.env.BROWSER_PATH ?? process.env.CHROMIUM_PATH;
  return engine.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    ...(name === "chromium" ? { args: ["--no-sandbox", "--disable-dev-shm-usage"] } : {}),
  });
}
