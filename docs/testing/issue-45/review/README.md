# Independent review of PR #46

## Undo of shared and independent programs

I reproduced the reported defect with two softmax cases on the reviewed application. The first case had a shared kernel with the maximum shift removed. The second case had a valid standalone Python file with an ordinary comment in place of the course’s host separator. Preparing the wide starter updated the shared kernel. Undo recovered the exact second file, but the first case exported the stabilized starter and lost its earlier behavior. [Original review](https://github.com/snowch/cuda-python-lab/pull/46#issuecomment-7238611073) · [Reproduction](reproduce.mjs) · [Observed baseline](before.log)

The preparation slot now keeps four values.

| Field | Value |
| --- | --- |
| `program` | The complete source visible in the editor before the change. |
| `caseProgram` | The exact serialized program owned by the selected case. |
| `sharedKernel` | The lesson’s shared kernel before the change. |
| `installedKernel` | The shared kernel installed by this preparation or swap. |

Null represents an absent override. Undo restores or removes the original case and shared slots in one IndexedDB transaction. The previous raw case program can intentionally contain an older embedded kernel. Restoring its raw bytes separately preserves the original case host and the original effective source. Other cases keep their case-specific host edits. [Preparation and guard](../../../../src/guided-panel.mjs) · [Atomic owned-field changes](../../../../src/app.mjs) · [Merge and conflict handling](../../../../src/learner-work.mjs)

The UI describes the affected case program and the shared kernel when Undo would change them. A program that has become stale requires an explicit review and load first. If the confirmed kernel has changed since preparation, the Undo notice says the newer kernel will enter recovery. A kernel that wins a write after the preflight check is also protected by the transactional base-value conflict check. A blocked transaction leaves pending work exportable and preserves the preceding durable record. A text-only undo slot from the earlier implementation reopens its complete source. A separator-free legacy slot leaves the current shared kernel in place. A legacy slot containing a split program can restore its earlier kernel, but lacks the identity of the kernel it originally installed. The UI discloses the missing history and conservatively retains the displaced current kernel in recovery.

The real multi-tab regression checked both exact Python exports through preparation, reload, injected quota denial, retry and reopen. The failed transaction kept both prepared fields in the database. Retry restored both original serialized program records and the original shared draft byte for byte. Another tab then saved a new kernel. The stale Undo was disabled. After explicit review, Undo restored both original effective sources and kept the newer kernel in both the swap slot and recovery. The compatibility tests also reopened an empty saved program, removed an originally absent case override on swap-back, and verified the exact kernel archived by a split legacy slot. [Chromium regressions](../../../../tests/learner-work.test.mjs) · [Execution log](../npm-test.log)

## Starter assumptions in the rendered lesson

The selector now says **Starter case**, and the prediction label names the same starter case explicitly. The vector-add width task compares the original 2 × 32 launch with the edited 3 × 16 launch. The grid-stride task contrasts the starter’s 16 total threads with the edit’s 8. **Explain the authored examples** scopes the static interpretation to its examples. Both edited programs ran in GPGPU-Sim. The execution log pairs each edited-launch output with the text shown to the learner. The full replay records both source hashes. [Task definitions](../../../../src/guided-experiments.mjs) · [Rendered checks](inspect.mjs) · [Execution output](ux.log)

At 390 px the cross-case warning wraps above the two preparation buttons, and the line and Console links continue on the next row. At 820 and 1440 px all four controls fit on one row. Loading a newer program clears the old preparation confirmation so that the current warning stands on its own.

| Viewport | Scope of undo after an intervening edit | Starter assumption and edited launch |
| --- | --- | --- |
| 390 px · light | [Undo and recovery](screenshots/undo-scope-390-light.png) | [Launch comparison](screenshots/edited-launch-390-light.png) |
| 390 px · dark | [Undo and recovery](screenshots/undo-scope-390-dark.png) | [Launch comparison](screenshots/edited-launch-390-dark.png) |
| 820 px · light | [Undo and recovery](screenshots/undo-scope-820-light.png) | [Launch comparison](screenshots/edited-launch-820-light.png) |
| 820 px · dark | [Undo and recovery](screenshots/undo-scope-820-dark.png) | [Launch comparison](screenshots/edited-launch-820-dark.png) |
| 1440 px · light | [Undo and recovery](screenshots/undo-scope-1440-light.png) | [Launch comparison](screenshots/edited-launch-1440-light.png) |
| 1440 px · dark | [Undo and recovery](screenshots/undo-scope-1440-dark.png) | [Launch comparison](screenshots/edited-launch-1440-dark.png) |

## Verification

The reviewed application code was identical to the source in the baseline build at `050d47a`. The intervening commit added evidence. Revised source `6e2b668a9abc2ae9d5322be5d96c4208da147f8a` was built from clean worktrees and passed the hosted browser build and CPU-only PTX compilation. The PR also links checks for the final evidence commit. [Implementation CI](https://github.com/snowch/cuda-python-lab/actions/runs/46141383494) The parent verification guide contains full logs, the regenerated 51-instruction matrix, screenshots, environment details and modality limits. [Acceptance evidence and limitations](../README.md)

To repeat the baseline, set `REVIEW_DIST` to a built copy of the reviewed application and run the reproduction from the revised checkout. The other two commands use the revised build. [Browser setup](../README.md#reproduction-and-limits)

```sh
REVIEW_DIST=/path/to/reviewed/dist node docs/testing/issue-45/review/reproduce.mjs
node --test --test-name-pattern='undo restores the independent|earlier text-only|older split program' tests/learner-work.test.mjs
CAPTURE_DIR=/tmp/cuda-review-screens node docs/testing/issue-45/review/inspect.mjs
```
