# Independent review follow-up for PR #44

I reproduced both save-feedback defects on the reviewed revision, `82828e6`. With no recovery copies, Chromium showed “Learner work saved in this browser” even though a fresh tab opened a different program and answer. While an IndexedDB write transaction was held, the completion note said progress was stored before any completion value existed in the mirror. [Independent review](https://github.com/snowch/cuda-python-lab/pull/44#issuecomment-7237879618) · [Observed baseline](before.log)

## 1. Open work and the saved version

The status compares the visible editor and prediction with the latest confirmed values for the active lesson and case. The program is reconstructed with the same function used on reopening, including the shared kernel and the case-specific host. In the regression, the stored case-one program still embeds the old kernel, yet the notice and preview correctly show that its effective program has changed. Saving in another lesson or changing only a different case’s host leaves the notice hidden. Background commits preserve the open editor, focus and text selection. [Workbench](../../../../src/app.mjs) · [Checkpoint](../../../../src/learner-work.mjs)

**Review saved version** opens a read-only preview of the differing fields. A learner can export the exact open program and prediction before choosing **Load reviewed version**. Loading reads the database again, verifies the lesson, case, visible text and preview, and checks for pending or failed writes. A newer relevant value requires a fresh review. Loading updates the tab’s view without issuing another learner edit. A concurrent local edit or failed transaction blocks replacement. [Preview and load guards](../../../../src/saved-version.mjs)

In the three-tab experiment, the stale tab executed and exported the open addition program. Its 33 outputs ranged from 3 to 99 in steps of 3. A reopened tab executed and exported the merged subtraction program, with outputs from −1 to −33. The assertions compare all 33 values and compare each complete exported program byte for byte with the source recorded for that run. Explicitly loading the preview made the stale tab’s export match the reopened program. [Chromium regressions](../../../../tests/learner-work.test.mjs) · [Simulator output](npm-test.log)

## 2. Completion while a transaction is pending

A pending completion change displays **Saving progress…**. The checkbox references a polite status message that changes only when its feedback changes. Confirmation requires the recorded completion value and an acknowledged transaction. A denied write preserves the learner’s checkbox choice and offers recovery. While an uncheck was failing, the tab continued to show its unchecked choice and the mirror still held the previous checked value. Retry committed the unchecked value. [Observed messages and mirror values](completion.log) · [Pending on phone](screenshots/completion-pending-390.png) · [Confirmed on desktop](screenshots/completion-confirmed-1440.png) · [Failed on phone](screenshots/completion-failed-390.png)

## 3. Mixed-release compatibility

The sequential check ran the actual earlier and upgraded builds on one origin. A fresh upgraded tab recovered its committed code, its current answer and the conflicting answer from the old writer. A second experiment held the real new transaction after its legacy-mirror read and before its mirror write. The old tab then wrote a stencil answer. The newer writer replaced the mirror and the stencil answer was absent from a fresh tab and recovery history. Its original tab still displayed the text. This deliberately controlled schedule demonstrates the residual race. [Executable handoff check](../check-handoff.mjs) · [Output and accessibility checks](handoff.log)

The guarantee covers committed transactions in the upgraded course and legacy values the upgraded course observes. Before switching releases, pause edits, export code and copy predictions from each old tab, then close those tabs or finish the managed restart. Check the reopened work before continuing. [Learner instructions](../../../../README.md#browser-code-runner-and-offline-access)

## Verification and reproduction

From the repository root, run `npm ci`, `npm test` and `npm run test:runner`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a system Chromium. The browser tests start the built course on a local origin, hold real IndexedDB transactions and exercise the UI through Playwright. The runner compiles CUDA kernels and checks the output for all 38 configured cases across 17 lessons. The command for replaying the mixed-build experiment is in the [parent verification guide](../README.md).

Each PR build attaches the 30 save-panel screenshots produced by its own browser run to the GitHub Actions checks for 14 days. The artifact name contains the pull request head SHA. The table below keeps a permanent copy of the locally inspected states.

The local review used Debian 13 x86-64, Node 24.22.3, npm 11.19.1, Playwright Core 1.65.1 and Chromium 156.0.8078.79. The legacy build for the mixed-release check came from a clean checkout of `cdfb58ee009ff221bde5062154a5b3ea4319f8a6`. The save and preview implementation landed in [b9b2d6c](https://github.com/snowch/cuda-python-lab/commit/b9b2d6cd7e2240227fddbd64d89e26469a08c8cd). [Main suite](npm-test.log) · [Actual simulator suite](npm-test-runner.log)

The corrected pre-handoff run passed all 43 main-suite tests and the separate simulator suite. The final clean-checkout run, including the checkbox’s accessible status association, is recorded in the PR review response and its linked GitHub Actions run.

The first full revision run passed 42 of 43 tests. Both local Chromium and CI read the deployment test’s old import immediately after Undo. Holding a transaction reproduced the prior import during “Saving” and the exact restored import after commit. The test now waits for the saved indicator and compares the entire stored program after both migration and Undo, including the learner’s edit to 43. [Transaction trace](import-undo.log) · [Deployment regression](../../../../tests/deployment-assets.test.mjs) · [Initial CI failure](https://github.com/snowch/cuda-python-lab/actions/runs/46135891563/job/140950987229)

## Rendered evidence

I inspected the save, stale, preview, full-storage and conflict states in both themes at all three widths. The saved message occupies one line below the prediction. On a narrow viewport, the stale notice wraps and the preview keeps the saved code, prediction, load and export controls in one column. The failed state keeps the typed answer visible above retry and export. The regression checks page width and each visible save-panel control at every size. Each capture is a running Chromium viewport. Keyboard checks cover a selected line in the editor, opening the preview, reviewing a newer answer, loading it, and returning focus to the affected editor or prediction.

| Viewport and theme | Saved | Stale | Review open | Storage full | Recovery copies |
| --- | --- | --- | --- | --- | --- |
| 390 × 900 · light | [Saved](screenshots/saved-390-light.png) | [Stale](screenshots/stale-390-light.png) | [Preview](screenshots/review-390-light.png) | [Failed](screenshots/failed-390-light.png) | [Copies](screenshots/conflict-390-light.png) |
| 390 × 900 · dark | [Saved](screenshots/saved-390-dark.png) | [Stale](screenshots/stale-390-dark.png) | [Preview](screenshots/review-390-dark.png) | [Failed](screenshots/failed-390-dark.png) | [Copies](screenshots/conflict-390-dark.png) |
| 820 × 900 · light | [Saved](screenshots/saved-820-light.png) | [Stale](screenshots/stale-820-light.png) | [Preview](screenshots/review-820-light.png) | [Failed](screenshots/failed-820-light.png) | [Copies](screenshots/conflict-820-light.png) |
| 820 × 900 · dark | [Saved](screenshots/saved-820-dark.png) | [Stale](screenshots/stale-820-dark.png) | [Preview](screenshots/review-820-dark.png) | [Failed](screenshots/failed-820-dark.png) | [Copies](screenshots/conflict-820-dark.png) |
| 1440 × 900 · light | [Saved](screenshots/saved-1440-light.png) | [Stale](screenshots/stale-1440-light.png) | [Preview](screenshots/review-1440-light.png) | [Failed](screenshots/failed-1440-light.png) | [Copies](screenshots/conflict-1440-light.png) |
| 1440 × 900 · dark | [Saved](screenshots/saved-1440-dark.png) | [Stale](screenshots/stale-1440-dark.png) | [Preview](screenshots/review-1440-dark.png) | [Failed](screenshots/failed-1440-dark.png) | [Copies](screenshots/conflict-1440-dark.png) |

## Verification limits

Storage failures were injected at browser API boundaries. The old/new race was deliberately scheduled using real writes. Its frequency in normal use remains unmeasured. A forced browser shutdown can discard edits held only in memory.

The 390 px and 820 px captures use desktop Chromium viewports. Physical touch devices, other browser engines, screen-reader listening and learner studies were outside this run. The five axe-core scans cover the save panel. Simulator execution verifies program behavior in the bundled toolchain. No physical NVIDIA GPU or hardware timing was used.
