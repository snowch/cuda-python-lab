# Independent review correction · Predict for the open program

The finding reproduced on the reviewed head `5d781af`. After applying host 5, store 73 and both prints, the trace showed the new inputs, but **Write a prediction** focused a field asking about host 0 and store 42. The field and run summary gave no context for an older answer. [Independent finding](https://github.com/snowch/cuda-python-lab/pull/50#issuecomment-7240387611) · [Reproduction log](before.json) · [Before screenshot](before-edited-prompt.jpg)

Application commit `4ad384e2437ec0d7d1d56ed8e672613c2ea7d867` derives the three-array question and print explanation from the same exact Python match as the trace. **Write a prediction** focuses the existing case field. Learners see the question again with the actual Console output. The text names the host initializer, kernel store, original array, device allocation and copied result. It identifies the current print choice and explains how to observe the original when the program prints only the copy. [Prediction model](../../../../src/first-value-model.mjs) · [Trace integration](../../../../src/first-value-trace.mjs) · [Workbench](../../../../src/app.mjs)

## What happened in Chromium

| Action | Verified behavior |
| --- | --- |
| Open the starter, before running | The field and Console ask about host 0 and store 42. They explain that only `result` will print. A pre-existing case answer survives. With the learner's prediction recorded, the real run prints `out = [42.0]`. |
| Preview host 5, store 73 and both prints | The exported Python and prediction still describe the open 0/42 program. Selecting inputs alone makes no code change. |
| Apply the preview, before running | The open Python, trace, field and Console all switch to 5/73. They identify which two arrays will print. The previous 0/42 answer is still visible as a case note. Its author-supplied context remains intact. Earlier output is marked stale. |
| Record the 5/73 prediction and run | The program prints `out = [73.0]` followed by `[5.0]`. Beside the output, the field's question and evidence explanation are identical to the open program's. The device value is identified as coming from the source-level model. |
| Undo and reload | Both restore the 0/42 question and result-only print explanation. The entire note, including both prior predictions, survives byte for byte. A separately seeded legacy lesson answer remains in **Earlier lesson prediction**. Undo again reopens the 5/73 program. |
| Edit the store to 91 in Python | The three-array model withdraws. The field and Console ask what the custom program will print and direct the learner to its print statements. Actual stdout is `out = [91.0]` and `[5.0]`. The existing notes stay accessible. |
| Export the custom notebook | The notebook contains the code storing 91 and its explicitly labelled original starter question. Native exports and browser prediction notes retain their separate purposes. |

[Recorded questions, notes and actual outputs](after.json) · [Mobile input](edited-prompt-phone.jpg) · [Mobile comparison](comparison-phone.jpg) · [Desktop comparison](comparison-desktop.jpg) · [320 px custom comparison](custom-comparison.jpg)

**How prior work is treated.** These are case notes. Their original text has no reliable program-version metadata. The field asks learners to include the starting value, store and print choice in each entry. The comparison identifies the notes as potentially describing earlier runs. Changing source, print mode, preview, undo or reload never rewrites the field or assigns an old prediction to the new inputs. Existing case and legacy keys still use the same transactional save, review and recovery behavior.

**Regression coverage.** The workbench test exercises the focused field, exact source question, preview/apply boundary, print selection, comparison, undo and withdrawal. The independent replay checks actual Python content, actual output, saved notes, legacy data and native export. The older replay expected website and notebook prompts to match verbatim. For first-value it now checks the browser's applied inputs and the notebook's original question separately. Both assertions still apply unchanged to the other lessons. The all-variant execution harness records the starter prediction before running the starter, then records the 5/73 prediction only after applying that source. [Regression test](../../../../tests/workbench.test.mjs) · [Guide replay](../../issue-45/run-guides.mjs) · [All eight source variants](../logs/first-value-runs.json)

**Complete suites.** The corrected application commit passed both GitHub jobs. The build job ran all 51 browser/JavaScript tests and the full runner suite in Chromium 159. The native job ran the CPU notebook checks and CPU-only PTX compilation. The guided replay produced the same 96 records as the reviewed baseline. [Application CI](https://github.com/snowch/cuda-python-lab/actions/runs/46153069055) · [Browser TAP output](../logs/npm-test.log) · [Runner TAP output](../logs/npm-runner.log) · [Guided run ledger](../logs/guided-runs.jsonl)

**Accessibility and layout.** The same question and print explanation are visible by the field and by the result. The field's accessible description includes the question, the print scope and the case-note instructions. At 390 px the keyboard test still required zero Page Ups to re-read the entire selected edit from the output. The revised phone, tablet, desktop and native zoom evidence are in the main evidence directory. Real browser and simulator execution were verified. Physical touch, screen reader speech, hardware GPU execution and a learner study remain unverified. The recording and its transcript remain available for independent follow-up. [Keyboard log](../logs/keyboard.json) · [Updated scans](../logs/release-routes.json) · [Native zoom](../logs/zoom.json) · [PR-head checks](https://github.com/snowch/cuda-python-lab/pull/50/checks)

To reproduce, build the reviewed and corrected commits in separate worktrees. Run the following from the corrected checkout with their dist paths.

```sh
node docs/testing/issue-49/review/prediction.mjs /path/to/reviewed/dist /tmp/prediction-before before
node docs/testing/issue-49/review/prediction.mjs /path/to/corrected/dist /tmp/prediction-after after
```
