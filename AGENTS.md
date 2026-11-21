# Working on CUDA Python Lab

## Read the course as a learner

Assume the learner can read Python functions, loops, and array indices. Teach CUDA and GPU architecture through the lessons. Review the course outline, the preceding lesson, the changed lesson, and the next lesson in the built site. Include headings, editor source and labels, cases, instructions, diagrams, feedback, and optional GPU materials in the review.

- Identify what each sentence does. Keep context, explanations, automatic setup, learner actions, and result interpretation clear. Remove filler and repeated information.
- Define technical terms at their first use. Include vocabulary in headings, simulator controls, column labels, and errors in this check. Introduce the minimum needed to run and interpret the current experiment. For example, start with one thread and one output value, introduce blocks when learners need to locate a thread, and introduce warps when learners compare groups of memory accesses.
- Say which arrays, launch settings, and reference values the page supplies. Give the exact control, case, editable code, change, run action, and evidence to inspect. Verify each action is possible through the interface. Direct notebook edits to the exported notebook.
- For comparisons, name the cases, fields, units, and question. Ask what changes and what pattern explains it. Clarify vague references and claims about what matters or helps by stating the goal and conditions.
- Keep the Console as the main result surface. Show controls and trace columns when the lesson uses them. Keep essential evidence accessible and optional details behind descriptive disclosures.
- Separate a Python execution error from a starter-reference comparison and a question about understanding. Treat an intentional output change as a valid result. State what the browser model shows, which assumptions it uses, and which conclusions need hardware measurements.

## Decide when to use a diagram

Look for inputs flowing through a process, dependent steps or branches, thresholds that change an outcome, and summaries that combine individual results. Name the question the visual helps the learner answer. In the review, quote the original passage, specify parts, connections, concrete values, units or thresholds, and name where the visual belongs and what sentences it can replace. Keep essential assumptions and caveats visible. Use a short wording change when it answers the question cleanly.

## Verify and report

Follow the revised instructions in the built course. Run starter cases and suggested edits. Check the named evidence, errors, and recovery on relevant screen sizes and themes with keyboard navigation. Preserve saved code, predictions, selected cases, and completion. Run `npm test` for substantive browser changes. Check notebook correctness and PTX compilation with `scripts/check_native.py` where applicable. Report which behaviors were verified and any hardware or learner evaluation that is pending. Functional checks do not establish learning effectiveness.
