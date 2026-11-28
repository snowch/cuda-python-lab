# M1.3 notebook verification

The [edited precision notebook](examples/precision.ipynb) and the [wide softmax notebook](examples/softmax.ipynb) are actual browser downloads. Open either in Jupyter to inspect every case in that lesson. The precision export preserves a learner’s regrouping edit while the numbered regrouping task still starts with the original expression.

The [baseline](baseline.log) was recorded on merged main `a81efa43ec2b61192bd667239a1d442856ddaeb3`. The second vector-add notebook had one program and sent the learner back to the site. The original checker reported “1 of 1 values match” for an int32 array when float32 was required. Reproduce by running `node scripts/test-cases.mjs > baseline.json` at that revision, then running this branch’s [baseline probe](baseline.py) against that JSON. [Issue and gates](https://github.com/snowch/cuda-python-lab/issues/47) · [Audit A06](../../course-audit/README.md) · [Platform decisions](https://github.com/snowch/cuda-python-lab/issues/43)

## Acceptance evidence

| Gate | What was exercised | Evidence |
| --- | --- | --- |
| 1. Self-contained cases and sequence | Chromium downloaded every lesson. Separately, all 38 choices of selected fixture produced valid nbformat 4 notebooks. Tests checked the complete exported source, all recovered starting programs, cell headers, case/task bindings, and Python syntax. The guide replay checked the starting and edited sources and named observations. | [Lesson and phase inventory](inventory.md), [browser downloads](logs/browser-exports.log), [notebook checks](logs/cpu-checks.log), [case-by-case execution ledger](logs/guided-runs.jsonl) |
| 2. Trustworthy objectives | CPU tests supplied wrong shape, dtype, value, NaN, Inf, just-inside and just-outside softmax tolerances, incorrect secondary prints, and custom Python. They also reconciled 40 distinct phase starting sources with archived simulator runs, checked each of the 46 runnable starts, and compared all 46 task targets with independent simulator observations. Twenty runnable tasks require an edit after the starting check. A run that raised and a later run without an assignment could not reuse an earlier array. Mismatched case and task keys were rejected. | [CPU regression code](../../../tests/test_notebooks.py), [test log](logs/cpu-checks.log), [worked target reports](logs/checker-examples.log), [prerequisite and race reports](review/prerequisites.log), [real Jupyter failure and rerun](logs/jupyter-preflight.log) |
| 3. Learner work and browser continuity | Browser tests downloaded edits to both the kernel and host in notebook and Python form. A markerless program with legacy imports retained its full body after the documented native import adaptation. The whole-work JSON retained both independent softmax programs and the unadapted open text. Existing storage, concurrent editing, preparation and undo regressions passed. An offline reload after a two-tab course update downloaded the selected vector-add program with all three fixtures, then ran the simulator. | [Export regressions](../../../tests/browser.test.mjs), [offline lifecycle regression](../../../tests/lifecycle.test.mjs), [49 passing tests](logs/npm-test.log) |
| 4. Execution and portability | The bundled Numba/GPGPU-Sim path ran 38 pristine fixtures plus 56 guided program executions across 51 instructions. Twelve of the 58 phases asked for source reasoning. The separate runner regression passed. The installed native compiler produced SM 8.0 PTX for 17 lesson kernels and the native examples. A first-value kernel retrieved from its notebook execution namespace also produced SM 8.7 PTX. | [Guided replay](logs/guided-replay.log), [runner](logs/npm-runner.log), [PTX](logs/ptx.log), [SM 8.7 probe](logs/notebook-sm87.log), [driver probe](logs/preflight.log), [ARM package resolution](logs/arm-resolver.log) |
| 5. Rendered use | All 17 actual downloads opened and ran setup in separate local IPython kernels. Their first exported cell stopped at the unavailable driver. The CPU isolation probe ran separately. Chromium/Playwright inspected JupyterLab and the browser download, focused whole-work backup and optional setup at 390 and 1440 CSS pixels, in both course themes. | [Kernel results](logs/jupyter-kernels.log), [JupyterLab views](logs/jupyter-ui.log), [screenshots](screenshots/), [visual observations below](#rendered-review) |
| 6. Independent handoff | This record identifies the app commit, environment, two downloadable notebooks, regeneration commands, package limitations and the physical validation procedure. | [Implementation PR](https://github.com/snowch/cuda-python-lab/pull/48), [hardware protocol](../../native-notebooks.md#physical-verification-on-colab-local-linux-or-jetson) |

## How the notebook works

One labeled program per task keeps the case, prerequisite edits, prediction and evidence beside the code. Running a different cell leaves earlier edits intact. The trade-off is repeated source and a longer document. Setup is shared once per kernel session. It registers the IPython cell magic without downloading course code. A source-only question shows its starting code and asks for an explanation. The selected export retains the editor’s complete program. Remaining cases use the authored sources. The browser’s whole-work backup includes other saved drafts.

Each program prints its case, task and source fingerprint. Execution uses a fresh namespace. A program that raises stops before checking. An earlier output visible below another cell represents its last execution. The learner can duplicate a cell before experimenting or retrieve its original body with `lab_start(case, task)`. Result identity and program recovery are independent of browser storage.

The starter and objective reports answer different learner questions. The checker uses authored inputs, expected arrays and explicit edit contracts. It compares the returned array without flattening it or casting away its dtype. Exact integer and exactly representable float32 fixtures use zero tolerance. For softmax, individual values allow `atol=1e-7` and `rtol=1e-5`; stable probability rows must stay in [0, 1] and sum to one within `2e-6`. A source match is deliberately conservative. An unfamiliar but equivalent solution receives its observed starter comparison and an unassessed objective.

- The edited precision program returned `[1.0, 1.0]` in GPGPU-Sim. Only one element matches the starter. Both match the regrouping objective and its mathematical sum.
- Removing the maximum shift in the extreme softmax fixture produced nine NaNs and one zero. The objective requires that particular mask, a stable zero in the expected position, and the requested host observations. A NaN in the stable version fails.
- The non-atomic histogram produced `[0, 0, 2, 0]` in each of four simulator runs. The checker accepts observations within the hot-bin bounds, including a coincidental full count. Four identical observations cannot establish race safety.
- Numerical agreement after changing padding, launch geometry or fusion establishes the returned values for that fixture. The learner must still inspect the code or measure hardware to explain accesses, transactions or performance.

## Rendered review

In the browser, the run and notebook download actions are adjacent. On the phone the optional setup link wraps to a separate line. The keyboard-focusable whole-work control is inside Editor tools. The setup appendix gives the browser route first, then the native steps. The editor retains its dark code surface in both themes. [Phone export](screenshots/export-390-light.png) · [Desktop export](screenshots/export-1440-dark.png) · [Phone backup](screenshots/backup-390-dark.png) · [Desktop backup](screenshots/backup-1440-light.png) · [Phone setup](screenshots/setup-390-light.png) · [Desktop setup](screenshots/setup-1440-dark.png)

In local JupyterLab, the opening view places the selected case and starter prediction above setup. The registration code is collapsed in this frontend. The program view identifies the selected task, the exact-source boundary and the recovery instructions before the editable cell. In the precision and overflow views, the prediction, edit and expected evidence are visible together above the program. The Frontend Design review covered hierarchy, wrapping and controls. The Instructional Design review followed prediction, edit, execution and interpretation for each phase. The precision extension now names a separate Python cell and the scan extension names the exact host insertion point. No new architecture diagram was needed to explain switching these independent program cells. [Opening view](screenshots/jupyter-softmax-opening.png) · [Selected case](screenshots/jupyter-softmax-export.png) · [Overflow](screenshots/jupyter-softmax-task.png) · [Regrouping](screenshots/jupyter-precision-task.png)

## Environment and limits

Revised implementation commit `938f8d43d9b1fed711456866fa5de766871d070c`, clean browser replay release `dfac417e2e64f0ff01ad51540905cdda3861e43d5d218692229f5ad470584e75`. The two downloads, screenshots, Jupyter kernel runs and full browser regression were regenerated from this implementation. The [review response](review/README.md) identifies the original defect and its reproducer. Local verification used Debian 13 x86-64, Linux 6.18.57, Node 24.22.3, npm 11.19.1, playwright-core 1.65.1, Chromium 156.0.8078.79, Python 3.12.14, JupyterLab 4.6.6, IPython 9.19.1, ipykernel 7.4.0 and nbformat 5.11.1. The requested model and effort were GPT-6.2 Astra and Extra high, as confirmed by the operator. An independent runtime configuration readout was unavailable.

On x86-64 the actual pinned MLIR backend 0.6.0 and NumPy 2.4.6 installed. CUDA bindings 12.9.11 loaded the 12.9 runtime. Driver loading failed because this host lacked the NVIDIA driver library. No physical device, hardware launch, timing, profiling, Colab allocation or Jetson installation was verified. The CPU checker’s arrays and the cross-compiler’s PTX output have separate logs from the GPGPU-Sim results.

The ARM64 wheel resolver succeeded for the primary backend on CPython 3.12 and failed on 3.10. The separate Numba-CUDA 0.30.4 stack resolved on ARM64 CPython 3.10. It still needs an explicit port and device qualification. JetPack libraries, driver compatibility, thermal behavior, profiler access and actual SM 8.7 kernel execution remain physical release gates. The responsive samples use emulated viewport sizes. Physical touch devices, assistive technology, hosted Colab rendering and learner outcomes were not evaluated. [Resolver commands and results](logs/arm-resolver.log) · [Device validation procedure](../../native-notebooks.md)

## Reproduce

Use the repository’s normal Node dependencies and Chromium. On the recorded host, the tests selected the installed browser with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`. Use a fresh isolated Python environment. Package installation needs a package index or a populated wheelhouse.

```sh
npm ci
npx playwright-core install chromium --no-shell
npm test
npm run test:runner
python -m pip install -r src/gpu/requirements.txt jupyterlab nbformat nbclient nbconvert ipykernel
python tests/test_notebooks.py
python scripts/check_native.py --ptx --cpu-only
python scripts/check_native.py --preflight
```

The last command reports whether the running environment can attempt native execution. On an available NVIDIA GPU, follow the [hardware protocol](../../native-notebooks.md) and run `python scripts/check_native.py` without flags to launch the exported programs.

```sh
npm run build
mkdir -p /tmp/cuda-47/books /tmp/cuda-47/screenshots /tmp/cuda-47/guides
EVIDENCE_DIR=/tmp/cuda-47/screenshots BOOK_DIR=/tmp/cuda-47/books node docs/testing/issue-47/inspect.mjs
GUIDE_EVIDENCE=file:///tmp/cuda-47/guides/ node docs/testing/issue-45/run-guides.mjs
python docs/testing/issue-47/compile_notebook_target.py /tmp/cuda-47/books/first-value.ipynb
# The following kernel probe specifically expects a host without an accessible GPU.
python docs/testing/issue-47/open_notebooks.py /tmp/cuda-47/books /tmp/cuda-47/previews
jupyter lab --no-browser --ServerApp.root_dir=/tmp/cuda-47/books
```

For Jupyter UI captures, point `JUPYTER_URL` at the local server origin for an isolated local test environment (the server’s token query parameter is supported) and set `EVIDENCE_DIR` to the capture directory. Run `node docs/testing/issue-47/inspect-jupyter.mjs`. The local inspection used a loopback-only test server with a disposable notebook directory. [Browser inspection](inspect.mjs) · [JupyterLab inspection](inspect-jupyter.mjs) · [Jupyter kernel probe](open_notebooks.py)
