import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium" });
const c = await b.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: "block",
  }),
  p = await c.newPage();
await p.addInitScript(() =>
  localStorage.setItem("cuda-python-lab:code-runner-intro:3", "1"),
);
const url = "http://localhost:8012/#lesson/first-value";
await p.goto(url);
const cdp = await c.newCDPSession(p);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 120,
  downloadThroughput: 3000000,
  uploadThroughput: 1000000,
});
await c.route("**/runtime/nvptx.wasm", (r) => r.abort("internetdisconnected"));
await p.click("#run");
await p.waitForFunction(
  () => !document.querySelector("#runtime-recovery").hidden,
  null,
  { timeout: 90000 },
);
console.log(
  "Interrupted cold download:",
  await p.locator("#run-status").innerText(),
  await p.locator("#runtime-error").textContent(),
);
await c.unroute("**/runtime/nvptx.wasm");
await p.locator("[data-runtime-reload]").click();
await p.getByRole("heading", { name: "Write your first GPU value" }).waitFor();
for (const label of ["first successful run after recovery", "warm run"]) {
  const start = Date.now();
  await p.click("#run");
  await p
    .locator("#run-status")
    .filter({ hasText: "Ran in GPGPU-Sim" })
    .waitFor({ timeout: 90000 });
  console.log(
    label,
    Date.now() - start,
    "ms browser elapsed",
    await p.locator("#run-output").innerText(),
  );
}
for (const route of ["first-value", "coalescing", "gpu"]) {
  await p.goto("http://localhost:8012/#" + route);
  console.log(
    "1280x800",
    route,
    await p.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      heading: document.querySelector("main h1").textContent,
    })),
  );
}
const cold = await b.newContext({ offline: true }),
  q = await cold.newPage();
try {
  await q.goto(url);
} catch (e) {
  console.log("First visit offline", String(e));
}
await b.close();
