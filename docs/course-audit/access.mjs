import { chromium } from "playwright-core";
import fs from "node:fs";
import { lessons } from "../../src/course.mjs";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium" });
const p = await b.newPage({ viewport: { width: 390, height: 850 } });
const out = new URL("evidence/access.jsonl", import.meta.url);
fs.writeFileSync(out, "");
for (const route of ["course", ...Object.keys(lessons), "gpu", "compiler"]) {
  await p.goto("http://localhost:8012/#" + route);
  await p.locator("main h1").waitFor();
  await p.addScriptTag({
    path:
      process.env.AXE_PATH ||
      "/tmp/course-a11y/node_modules/axe-core/axe.min.js",
  });
  for (const theme of ["light", "dark"]) {
    await p.emulateMedia({ colorScheme: theme });
    await p.waitForFunction(
      (t) => document.documentElement.dataset.theme === t,
      theme,
    );
    const result = await p.evaluate(async () => {
      const { violations } = await axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
        },
      });
      return {
        version: axe.version,
        violations: violations.map((v) => ({
          rule: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            detail: n.failureSummary,
          })),
        })),
      };
    });
    fs.appendFileSync(out, JSON.stringify({ route, theme, ...result }) + "\n");
  }
}
await b.close();
