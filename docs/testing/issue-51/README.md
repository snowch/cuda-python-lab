# Issue 51 · Who writes the last element?

In the 33-element vector-add lesson, the learner can now select an element and find its owner, select a launched thread and follow its guard, and run the same program in the editor. The investigation asks a question that output values alone cannot answer. If the last value is numerically correct, did any thread actually write it? [Issue and acceptance criteria](https://github.com/snowch/cuda-python-lab/issues/51) · [PR #52](https://github.com/snowch/cuda-python-lab/pull/52)

## What the programs did

For the original inputs, element 32 contains 33 + 66. A transfer to the device initializes the output before each launch. The table combines printed values from GPGPU-Sim with ownership calculated from the source. An active thread here means one that enters this kernel’s guarded store. The simulator’s printed array does not establish which SM executed a block or how long a thread took.

| Elements and launch | Launched / active / guard false | Covered / uncovered | Last element’s owner | Last value printed, original inputs and zero initialization |
| --- | --- | --- | --- | --- |
| 33, 2 × 32 | 64 / 33 / 31 | 33 / 0 | block 1, thread 0 | 99 |
| 33, 3 × 16 | 48 / 33 / 15 | 33 / 0 | block 2, thread 0 | 99 |
| 33, 1 × 32 | 32 / 32 / 0 | 32 / 1 | none | 0 |
| 32, 1 × 32 | 32 / 32 / 0 | 32 / 0 | block 0, thread 31 | 96 |

For the counterexample, the final inputs were 33 and −33. The first 32 values in the returned array were correct in all three runs. Follow the links to compare the actual editable host and kernel code.

| Experiment | Correct arithmetic value | Printed last value | What can be concluded |
| --- | ---: | ---: | --- |
| [1 × 32, zero initialization](programs/n33-1x32-opposite-init0.py) | 0 | 0 | An all-elements numerical check passes. The largest launched index is 31, so element 32 still holds its initializer. |
| [1 × 32, initialize to −1](programs/n33-1x32-opposite-init-1.py) | 0 | −1 | A value outside the valid sums survives in the final cell. |
| [2 × 32, initialize to −1](programs/n33-2x32-opposite-init-1.py) | 0 | 0 | With only the launch changed, block 1, thread 0 can now reach the store. The observed last value changes. |

All 28 supported fixture/program pairs ran through the bundled browser compiler and GPGPU-Sim. There are 16 different complete programs because both 33-element starter cases can select the same settings. Each ledger row identifies the starter case, exported source SHA-256, compiled PTX SHA-256, actual stdout, arithmetic reference, launch-aware CPU reference and prediction. The CPU oracle enumerates block/thread pairs independently of the production mapper. [Run ledger](recorded-runs.json) · [Exact programs](programs) · [Execution log](logs/mapper-runs.txt) · [Replay harness](run-mapper.mjs)

## Acceptance evidence

| Gate | Verification and result |
| --- | --- |
| Ownership in either direction | Every valid thread and element was checked for every supported program against a separate enumeration. Boundary indices include 31, 32, 33 and the last launched thread. Reverse selection distinguishes a skipped thread from a cell with no launched owner. Out-of-domain selections raise errors. [Tests](../../../tests/thread-map.test.mjs) · [Results](logs/mapper-tests.txt) |
| Editing, prediction and evidence | The experiment preview displays the proposed Python statements. Only explicit Apply changes the open host program and its prediction context. Undo restores the previous program, including across case selections with an independently edited kernel. A case note survives editing and reload and is labelled as potentially earlier. After changing the source, the old run is identified as stale. A deliberately malformed edit produced a real syntax error. A valid subtraction edit ran with the mapper withdrawn. After a deliberately injected storage quota error, the visible program and unsaved note exported correctly and retry succeeded. [Browser observations](logs/inspection.json) · [Storage and kernel regression](../../../tests/thread-map.test.mjs) |
| Interaction, responsive layout and accessibility | Reviewed the course outline, first-value, vector-add and grid-stride. Captured the owner, skipped thread, preview, uncovered cell, comparison and repair at 320, 390, 820 and 1440 CSS px in light and dark themes with reduced motion. All 48 states had zero page overflow. Eight axe scans of the owner and preview at 320 and 820 px returned zero violations. Verified touch activation, tab order, both mapping directions, opening the genuine store expression, Escape/Tab to Run, prediction focus and keyboard execution. Native 200% zoom changed the viewport from 1280 to 640 CSS px with no page overflow. [Full captures including before](screenshots/all-widths.zip) · [Accessible table and control names](logs/accessible-tree.txt) · [Zoom capture](screenshots/zoom-200.jpg) · [Measured zoom](logs/zoom.json) |
| Original course experiments and regression suites | Replayed the 17 lessons, 38 pristine cases and 51 authored instructions through 58 phases, including 56 guided runs and 12 source-reasoning phases. The 96-record ledger is byte-identical to the accepted one (SHA-256 `75afe1df75b14f7115c9b5e99924c94780c0d879ec216fa87166d196b31afc4f`). The replay checks the applied vector launch question in the workbench. All original audit edit-pair, source and output checks remain. GitHub Actions passed all 54 browser/unit tests and the dedicated GPGPU-Sim regression on the source head. The dedicated runner also passed locally, alongside eight CPU notebook tests and CPU-only native PTX compilation. [Fresh guided ledger](logs/guided-runs.jsonl) · [Previous ledger](../issue-45/guided-runs.jsonl) · [General suite](logs/npm-test.txt) · [Runner](logs/runner.txt) · [Notebooks](logs/notebooks.txt) · [PTX](logs/native-ptx.txt) |
| Media, offline installation and upgrade | In two tabs the #50 release still executed edited Python and played its first-value movie offline after the update was downloaded. Explicit restart switched both tabs while offline. Exported programs were byte-identical, selected case, predictions and completion survived, and new sentinel code executed. The vector-add recording played offline with captions. A clean install cached all 48 retained media files and made zero observed first-value media requests. The all-recordings regression opens each remaining player and transcript, checking playback, cues and headings. [Offline results](logs/offline-upgrade.json) · [Upgrade harness](offline-upgrade.mjs) · [Recording parity and recovery](recording-parity.md) |
| Reviewable scope | The production change is limited to the vector-add mapper and first-value recording retirement, with small shared workbench integration changes. Source and evidence are on the dedicated PR. Independent acceptance of vector-add recording parity is pending. [Source commit](https://github.com/snowch/cuda-python-lab/commit/26a6b1f2e5d5ea0f38848778b4de51fdcfeec8ee) · [Source CI](https://github.com/snowch/cuda-python-lab/actions/runs/46155799166) |

## Teaching and interface decisions

The workbench opens with the case prediction. The four steps let a learner reveal the index calculation, guard and cell table at their own pace. “Show source” selects the corresponding launch, index, guard or store in the editable Python. Two native selects provide direct forward and reverse lookup without a keyboard stop for every thread. A block button selects its first thread. The block name and index range are both visible and available to assistive technology. Stripes, outlines and text communicate different states. At phone width, table values wrap inside their cells. [Before](screenshots/original-390-light.jpg) · [Owner](screenshots/owner-390-light.jpg) · [Skipped](screenshots/skipped-320-dark.jpg)

The optional investigation names the case, which settings to vary, which settings to hold fixed and what to inspect after running. A preview leaves the prediction and previous result attached to the applied Python. Host-only preparation reuses the existing save/undo mechanism and preserves other cases’ kernel ownership. Strict matching of the entire open program keeps the boundary simple. An arbitrary edit, including a harmless comment, can still run, but its ownership diagram is withdrawn. Named cases and native notebook starter checks retain their original meaning. [Preview](screenshots/proposal-820-light.jpg) · [Uncovered](screenshots/uncovered-320-light.jpg) · [Comparison](screenshots/comparison-390-dark.jpg) · [Repair](screenshots/repair-820-dark.jpg)

A pure module contains the single-index model. The controller uses the existing step, editor, prediction and transaction facilities. This rule applies to one-dimensional guarded vector addition where each thread visits at most one output. A future grid-stride lesson needs to model multiple visits per thread. The 32-element exact-fit case already supplies a small boundary control. [Ownership model](../../../src/thread-map-model.mjs) · [Controller](../../../src/thread-mapper.mjs)

## Offline download size

The two clean builds used the same locked dependencies. The complete offline manifests were checked against the bytes and SHA-256 of every listed file. The 16 retained recordings, captions and posters were byte-identical across releases.

| Clean release | Files in manifest | Total offline bytes |
| --- | ---: | ---: |
| [Merged #50, 0275c4a](logs/baseline-release.json) | 133 | 63,297,297 |
| [Mapper, 26a6b1f](logs/mapper-release.json) | 132 | 60,298,011 |
| Net reduction per complete download | 1 | **2,999,286** |

The retired MP4 accounts for 2,992,665 bytes, its poster 20,908 and captions 1,118. Together they remove 3,014,691 bytes. The other release changes add a net 15,405 bytes. The figures describe manifest payloads, before any HTTP transfer compression. A learner who keeps the previous downloaded version can still use that version’s recording.

## Reproduction and limits

The application and screenshots were exercised on the clean source commit `26a6b1f2e5d5ea0f38848778b4de51fdcfeec8ee` against the merged baseline `0275c4a4c22983e3d8c748b1bba6b192a07bf6ea`. The evidence-only follow-up changes the commit stamped into a clean build. PR checks run again on that head. Local tools included Node 24.22.3, Playwright Core 1.65.1, Chromium 156.0.8078.79, axe-core 4.14.1, Python 3.12.14, NumPy 2.4.6 and numba-cuda-mlir 0.6.0. Native page zoom used full Chromium 159.0.8154.6.

From a clean checkout, run the following. Build the baseline in a separate clean worktree and point the upgrade harness at its dist directory. Set `AXE_PATH` to a local axe-core 4.14.1 `axe.min.js`. The zoom harness requires full Chromium with its Settings UI. The browser harnesses serve the builds on loopback.

```sh
npm ci
npx playwright-core install chromium --no-shell
npm test
npm run test:runner
python -m pip install -r src/gpu/requirements.txt nbformat ipython
python tests/test_notebooks.py
python scripts/check_native.py --ptx --cpu-only
GUIDE_EVIDENCE=file:///tmp/mapper-guides/ node docs/testing/issue-45/run-guides.mjs
cmp /tmp/mapper-guides/guided-runs.jsonl docs/testing/issue-45/guided-runs.jsonl
node docs/testing/issue-51/run-mapper.mjs dist /tmp/mapper-runs
node docs/testing/issue-51/inspect.mjs dist /tmp/mapper-screens
node docs/testing/issue-51/inspect.mjs /path/to/baseline/dist /tmp/baseline-screens before
node docs/testing/issue-51/offline-upgrade.mjs /path/to/baseline/dist dist /tmp/mapper-upgrade
node docs/testing/issue-51/zoom.mjs dist /tmp/mapper-zoom
```

GPGPU-Sim executed the Python/CUDA experiments in Chromium. Native verification covered CPU notebook checks and PTX cross-compilation. Physical GPU execution, Colab, Jetson, a physical touchscreen, speech input, a screen reader, human audio listening and uncoached learner testing were outside this verification. The requested configuration was GPT-6.2 Astra with High reasoning. This session exposed no independent readout of the active model or reasoning setting.
