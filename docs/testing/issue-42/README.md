# Saving learner work across tabs

On main at `cdfb58e`, a learner could reopen vector-add and find both their code and prediction missing after another tab saved a stencil answer. A full browser store also left an edited prediction on screen with no learner-work warning. Reloading the page lost that answer. The [baseline log](baseline.log) records both reproductions.

The initial implementation was verified on source commit [890983d](https://github.com/snowch/cuda-python-lab/commit/890983d5517cbec6173ee2142926a8ac3c44e3c0). Open two lesson tabs before editing. Add a marker to the vector kernel, type a prediction there, then type a prediction in stencil. Close both tabs and reopen each lesson. The complete vector source, vector prediction and stencil prediction survived in both write and close orders. [Regression tests](../../../tests/learner-work.test.mjs) · [Browser log](npm-test.log)

## What each save owns

| Learner work | Unit of change |
| --- | --- |
| Kernel | One kernel per lesson, shared across its cases |
| Complete Python program | One per lesson and case. When source contains the course’s `# Host code` separator, a kernel-only edit keeps the latest host and a host-only edit keeps the latest shared kernel. A program without the separator remains a complete case-specific draft. |
| Prediction | One answer per lesson |
| Result | One per lesson and case, including the program that ran, console output, status and PTX |
| Restore and undo | One previous complete program per lesson and case, with support for the earlier kernel-only undo field |
| Selected case and completion | Most recently committed explicit choice per lesson. Each open window can keep a different case on screen. |

Only a changed path enters the pending batch. Under an IndexedDB read/write transaction on the `work` object store, the app reads the latest committed record, patches those paths and writes the new revision. The original value seen by the editor travels with its edit, including through a failed write or a retry. Edits typed during a transaction remain pending for the next commit. A storage event refreshes completion and recovery information without changing the text being typed. Opening a lesson or switching cases reads the relevant fields again. [Persistence code](../../../src/learner-work.mjs) · [Workbench integration](../../../src/app.mjs)

A preliminary Web Locks implementation failed intermittently under contention. Locking JavaScript callbacks around a localStorage read/modify/write did not reliably propagate the previous tab’s value to the next renderer. The checked-in regression holds an actual IndexedDB write transaction while three tabs queue edits. It verifies complete source bytes from the editor exports, the prediction, completion, case selection and undo. [Contention test](../../../tests/learner-work.test.mjs)

## Recovery and compatibility

When two tabs change the same draft or answer, the later commit becomes the current version. The earlier competing value remains available under **Review recovery copies**. Select a saved version to see its contents and where to paste them. **Export learner work** downloads JSON containing the current tab’s work, the last readable durable state and the recovery copies. A downloaded backup can be opened as text and its code or prediction pasted into the indicated lesson. Results can be inspected in the JSON.

The store keeps one current value per owned field and up to 16 distinct recovery copies across the course. At the limit, a conflicting edit stays pending and the previous durable version remains intact. Export first, then confirm removal of a copy to free a slot. Removing a copy retries the pending edit. A large legacy snapshot with more conflicts than available slots can occupy one slot as a collection. Program and result sizes still count toward browser quotas.

The existing `cuda-python-lab-v1` JSON remains readable by the previous course. The transactional writer adds a revision and a trailing newline to the mirror. The older release’s compact JSON writer removes the newline on its next save, even when it carries forward unknown properties. An upgraded writer can then reconcile that older record against its database checkpoint. Missing values are imported and conflicting learner content is recoverable. An interrupted write that left a newer mirror is also reconciled. The UI acknowledges a save after mirror readback and database transaction completion. The two browser storage systems have separate quotas.

**Working with an older release.** Compatibility covers the legacy state the upgraded writer actually reads and participating tabs that finish a managed upgrade. An older writer can change the v1 mirror between the upgraded writer’s read and write. An edit in that interval can disappear from the mirror without entering the database or recovery history. The mixed-build check deliberately reproduced this loss while the old tab still displayed the answer. Pause editing across versions, export visible code and copy predictions from each old tab, then close those tabs or finish the managed restart. Reopen the upgraded course and check the saved work before resuming edits. [Executable mixed-build check](check-handoff.mjs)

A previous per-window restart snapshot is imported once its learner work can be committed. The original snapshot remains in session storage on failure and is included in the recovery export. Current handoff snapshots hold the reading position, open sections and window-specific controls. Code and answers come from durable learner work. Planned restarts require a successful save in each participating tab. [Release handoff](../../../src/experiment-state.mjs) · [Mixed-release check](check-handoff.mjs)

On a denied or full store, keep the tab open and use **Export learner work** or **Retry save**. In-course navigation retains pending edits in memory. Chromium displayed its native leave-page prompt on a real reload with unsaved work. Dismissing it retained the edited prediction. After retry, a different tab reopened the exact answer. [Handoff and permission evidence](handoff.log)

## Verification

All 41 tests in the main suite passed. The separate runner suite also passed. The clean checkout, built release, browser, compiler and simulator asset hashes are recorded in the [environment manifest](environment.json). Five additional runs repeated the same three-tab workload under browser scheduling. [Repeated execution log](contention.log)

| Check | Evidence |
| --- | --- |
| Original failure, fresh-tab reproduction and reversed write/close order | [Baseline](baseline.log) · [Fresh-tab assertions and observed predictions](npm-test.log) |
| Queued writes, shared kernel, distinct hosts, completion, restore/undo, same-draft conflicts, recovery capacity and independent contexts | [Chromium regression coverage](../../../tests/learner-work.test.mjs) · [Execution log](npm-test.log) |
| Legacy kernel and undo, old per-tab snapshot, stale legacy writer, interrupted mirror write and retry | [Browser suite](npm-test.log) · [Actual old and new builds together](handoff.log) |
| Denied reads and writes, quota injection, native leave-page prompt and recovery export | [Storage failure tests](../../../tests/learner-work.test.mjs) · [Database abort and real reload](handoff.log) |
| Offline navigation, reload, two-window release handoff and expired runtime recovery | [Lifecycle tests](../../../tests/lifecycle.test.mjs) · [Deployment tests](../../../tests/deployment-assets.test.mjs) · [Execution log](npm-test.log) |
| Real simulator results across stale tabs | [Two vector-add cases, full output and reopened result assertions](npm-test.log) |
| All 38 configured cases across 17 lessons, edited source, offline execution, Python error and cancellation | [Runner assertions](../../../tests/runner.test.mjs) · [Runner log](npm-test-runner.log) |
| Keyboard focus order, case/lesson-specific recovery guidance, visible controls and page width | [Browser assertions](../../../tests/learner-work.test.mjs) · [Save-panel accessibility scans](handoff.log) · Screenshots below |

The first PR CI run passed every persistence check and failed the pre-existing navigation column assertion on Chromium 159. At 390 px, I reproduced the timing window on Chromium 156. The disclosure was open, its detached panel was still hidden, and the computed grid value was `minmax(0px, 1fr)`. The test’s string split counted two tokens. The visible grid reported one 358 px column. The check now also requires a visible panel before applying the original 1/2/4 column assertions. [CI failure](https://github.com/snowch/cuda-python-lab/actions/runs/46132762667/job/140941352023) · [Navigation test](../../../tests/shared-style.test.mjs)

### Rendered workbench

Each image is a Chromium viewport screenshot from a running lesson. The saved state adds a single line below the prediction. An error puts retry and export next to the answer. Opening recovery exposes the chosen version and a keyboard-selectable, read-only text area. On the phone viewport, the controls wrap within the prediction card below the sticky header. The border, text and actionable controls distinguish states in both themes.

| Viewport and theme | Saved | Storage full | Recovery open |
| --- | --- | --- | --- |
| 390 × 900 · light | [Saved](screenshots/saved-390-light.png) | [Failed save](screenshots/failed-390-light.png) | [Recovery](screenshots/conflict-390-light.png) |
| 390 × 900 · dark | [Saved](screenshots/saved-390-dark.png) | [Failed save](screenshots/failed-390-dark.png) | [Recovery](screenshots/conflict-390-dark.png) |
| 820 × 900 · light | [Saved](screenshots/saved-820-light.png) | [Failed save](screenshots/failed-820-light.png) | [Recovery](screenshots/conflict-820-light.png) |
| 820 × 900 · dark | [Saved](screenshots/saved-820-dark.png) | [Failed save](screenshots/failed-820-dark.png) | [Recovery](screenshots/conflict-820-dark.png) |
| 1440 × 900 · light | [Saved](screenshots/saved-1440-light.png) | [Failed save](screenshots/failed-1440-light.png) | [Recovery](screenshots/conflict-1440-light.png) |
| 1440 × 900 · dark | [Saved](screenshots/saved-1440-dark.png) | [Failed save](screenshots/failed-1440-dark.png) | [Recovery](screenshots/conflict-1440-dark.png) |

### Reproduce the checks

From a clean checkout of the tested source revision, install the lockfile dependencies and use an installed Chromium executable.

```sh
npm ci
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
npm test
npm run test:runner
```

For the mixed-release check, build main at `cdfb58e` in a second checkout. From the fixed checkout with its built `dist/`, use the evidence script and axe-core 4.14.1. It serves both builds on one local origin in separate paths and exercises the actual old writer.

```sh
OLD_DIST=/path/to/baseline/dist AXE_JS=/path/to/axe-core/axe.min.js \
  node docs/testing/issue-42/check-handoff.mjs
```

To repeat the baseline, build and serve `cdfb58e` locally, open vector-add and stencil before editing, and follow the two-tab sequence at the top. For the failure case, make `Storage.prototype.setItem` throw `QuotaExceededError` for `cuda-python-lab-v1`, enter a prediction and reload. The original probe includes the exact interactions. [Baseline probe](https://github.com/snowch/cuda-python-lab/blob/87dbd7017b3f12509949c27e849f79a253443c62/docs/course-audit/persistence.mjs)

### Verification boundaries

- The browser runs used headless Chromium on Linux. The phone and tablet captures use CSS viewports. Physical touch devices, other browser engines and screen-reader listening were untested. Axe-core coverage is scoped to the save panel. Keyboard traversal and visual inspection supplement it.
- Quota and access errors were injected at real storage API boundaries. The tests exercised the application’s resulting transactions, exports, native prompt, retries and reloads. No physical disk was filled.
- Same-origin tabs in one browser profile share work. A separate browser context began with an empty lesson. These checks do not establish cross-device synchronization.
- A browser may suppress the native leave-page prompt. A forced shutdown, cleared site data or an accepted reload can discard memory-only edits. Work already lost by an old release before a checkpoint or snapshot exists cannot be reconstructed.
- Simulator runs used the bundled browser compiler and GPGPU-Sim. Physical GPU timing and hardware execution were outside this persistence change. Learning effectiveness and assistive-technology usability with learners await separate evaluation.
