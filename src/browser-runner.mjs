const runTimeout = 45000;

export function attachRunner(root, { getSource, getEndpoint, filename, configure }) {
  const run = root.querySelector("#run");
  const stop = root.querySelector("#stop");
  const consoleOutput = root.querySelector("#run-output");
  const status = root.querySelector("#run-status");
  const ptx = root.querySelector("#ptx-output");
  const ptxPanel = root.querySelector("#ptx-panel");
  let worker;
  let timer;
  let busy = false;

  function setStatus(message, failed = false) {
    status.textContent = message;
    status.classList.toggle("error", failed);
  }

  function resetOutput() {
    consoleOutput.hidden = true;
    consoleOutput.textContent = "";
    ptxPanel.hidden = true;
    ptxPanel.open = false;
    ptx.textContent = "";
  }

  function setBusy(value) {
    busy = value;
    run.disabled = value;
    stop.hidden = !value;
    if (!value && document.activeElement === stop) run.focus();
  }

  function dispose() {
    clearTimeout(timer);
    worker?.terminate();
    worker = undefined;
  }

  function cancel(message) {
    dispose();
    setBusy(false);
    if (message) setStatus(message);
  }

  function start() {
    if (busy) return;
    const endpoint = getEndpoint();
    if (!endpoint) {
      setStatus("Set a compiler URL to run this program in the browser.");
      configure();
      return;
    }
    resetOutput();
    setBusy(true);
    setStatus("Starting…");
    try {
      worker ??= new Worker(new URL("./run-worker.mjs", import.meta.url), { type: "module" });
      const running = worker;
      running.onmessage = ({ data }) => {
        if (worker !== running) return;
        if (data.status) {
          setStatus(data.status);
          return;
        }
        clearTimeout(timer);
        setBusy(false);
        const output = [data.stdout?.trimEnd(), data.error].filter(Boolean).join("\n\n");
        consoleOutput.textContent = output;
        consoleOutput.hidden = !output;
        ptx.textContent = data.ptx ?? "";
        ptxPanel.hidden = !data.ptx;
        setStatus(data.error ? "Execution stopped with an error."
          : data.launched ? "Ran in GPGPU-Sim." : "Python finished without a CUDA launch.", Boolean(data.error));
      };
      running.onerror = () => {
        if (worker !== running) return;
        cancel();
        setStatus("Could not start the Python and GPGPU-Sim runtime. Try running again.", true);
      };
      timer = setTimeout(() => {
        cancel();
        setStatus("The run took too long. Check the launch size and loops, then try again.", true);
      }, runTimeout);
      running.postMessage({ source: getSource(), filename, endpoint });
    } catch (error) {
      cancel();
      setStatus(error.message, true);
    }
  }

  function reset() {
    if (busy) cancel();
    resetOutput();
    setStatus("");
  }

  run.addEventListener("click", start);
  stop.addEventListener("click", () => cancel("Run stopped. Your program is still in the editor."));
  return { start, dispose, reset };
}
