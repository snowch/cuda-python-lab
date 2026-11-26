// Copyright © 2026 Christopher Snow.
// Run from a checkout with Playwright installed, against already-served built courses.
const { chromium, expect } = require("playwright/test");
const assert = require("node:assert/strict");
(async () => {
  assert(process.argv.length > 2, "Pass one or more built course URLs.");
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM || process.env.CHROMIUM_PATH || undefined,
  });
  try {
    for (const url of process.argv.slice(2)) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 900 },
        reducedMotion: "reduce",
      });
      try {
        const page = await context.newPage(),
          errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(url, { waitUntil: "load" });
        const theme = page.getByRole("button", {
          name: /^Switch to (dark|light) theme$/,
        });
        const status = page.locator("#app-status-open,#status-open");
        await expect(theme).toHaveCount(1, { timeout: 45000 });
        await expect(status).toHaveCount(1);
        for (const width of [320, 390, 820, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          for (const target of ["dark", "light"]) {
            if (
              (await theme.getAttribute("aria-label")) ===
              `Switch to ${target} theme`
            )
              await theme.click();
            const action = `Switch to ${target === "dark" ? "light" : "dark"} theme`;
            await expect(theme).toHaveAttribute("aria-label", action);
            await expect(theme).toHaveAttribute("title", action);
            for (const control of [theme, status]) {
              const box = await control.boundingBox();
              assert(
                box && box.width >= 48 && box.height >= 48,
                "48px touch target",
              );
              await control.focus();
              await page.keyboard.press("Tab");
              await page.keyboard.press("Shift+Tab");
              await expect(control).toBeFocused();
              assert(
                await control.evaluate(
                  (node) => getComputedStyle(node).outlineStyle !== "none",
                ),
                "keyboard focus outline",
              );
              assert(
                (await control.locator("svg:visible").count()) >= 1,
                "bundled visible SVG icon",
              );
            }
            assert(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
              "no page overflow",
            );
            await status.click();
            const modal = page.locator("#app-status-dialog,#status-dialog");
            await expect(modal).toBeVisible();
            assert(
              await modal.evaluate((node) => node.matches(":modal")),
              "native modal dialog",
            );
            assert(
              !["transparent", "rgba(0, 0, 0, 0)"].includes(
                await modal.evaluate(
                  (node) =>
                    getComputedStyle(node, "::backdrop").backgroundColor,
                ),
              ),
              "visible backdrop",
            );
            await page.keyboard.press("Escape");
            await expect(modal).toBeHidden();
            await expect(status).toBeFocused();
          }
        }
        await theme.click();
        const action = await theme.getAttribute("aria-label");
        await page.reload({ waitUntil: "load" });
        await expect(
          page.getByRole("button", { name: action, exact: true }),
        ).toBeVisible();
        assert.deepEqual(errors, [], "no page script errors");
        console.log(
          "PASS",
          url,
          "header icons, 48px targets, both themes, widths, keyboard/modal and persistence",
        );
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
