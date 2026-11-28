import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "playwright-core";

const dist = new URL("../dist/", import.meta.url);
const mime = new Map([
  ["html", "text/html"], ["css", "text/css"], ["js", "text/javascript"], ["mjs", "text/javascript"],
  ["json", "application/json"], ["wasm", "application/wasm"],
  ["mp4", "video/mp4"], ["vtt", "text/vtt"], ["webp", "image/webp"],
]);

export async function serveBuild(t, {directory=dist,prefix="/"}={}) {
  const server = createServer(async (request, response) => {
    if (request.method !== "GET") {
      response.writeHead(405).end();
      return;
    }
    try {
      const pathname=new URL(request.url,"http://localhost").pathname;
      if(!pathname.startsWith(prefix)) {response.writeHead(404).end();return;}
      const path = pathname.slice(prefix.length) || "index.html";
      const contents = await readFile(new URL(path,typeof directory==="function"?directory():directory));
      response.setHeader("Content-Type", mime.get(path.split(".").at(-1)) ?? "application/octet-stream");
      response.end(contents);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}${prefix}`;
}

export async function launchChromium(t) {
  // Use the installed Playwright browser, rather than an unrelated CI image browser.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch({ executablePath, channel: executablePath ? undefined : "chromium" });
  t.diagnostic(`Browser: ${browser.version()}`);
  t.after(() => browser.close());
  return browser;
}

export async function reviewPreparation(page) {
  const panel=page.locator('#program-options');
  if (!await panel.evaluate(element=>element.open)) await panel.locator('summary').click();
}
