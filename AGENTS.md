# Working on CUDA Python Lab

## Read the course as a learner

Assume the learner can read Python functions, loops, and array indices. Teach CUDA and GPU architecture through the lessons. Review the course outline, the preceding lesson, the changed lesson, and the next lesson in the built site. Include headings, editor source and labels, cases, instructions, diagrams, feedback, and optional GPU materials in the review.

- Identify what each sentence does. Keep context, explanations, automatic setup, learner actions, and result interpretation clear. Remove filler and repeated information.
- Define technical terms at their first use. Include vocabulary in headings, notebook cells, diagram labels, and errors in this check. Introduce the minimum needed to run and interpret the current experiment. For example, start with one thread and one output value, introduce blocks when learners need to locate a thread, and introduce warps when learners compare groups of memory accesses.
- Say which arrays, launch settings, and reference values the page supplies. Give the exact case, notebook cell, code change, run action, and output to inspect. Verify each action is possible through the interface. Keep the complete kernel and host program visible in the lesson and notebook.
- For comparisons, name the cases, fields, units, and question. Ask what changes and what pattern explains it. Clarify vague references and claims about what matters or helps by stating the goal and conditions.
- Use the simulator Console or the GPU notebook's program output for learner results. Teach hardware through the actual CUDA code, notebook output, and clearly labeled calculations or diagrams.
- Separate a Python execution error from a starter-reference comparison and a question about understanding. Treat an intentional output change as a valid result. State the assumptions of analytical counts and which conclusions need hardware measurements.

## Decide when to use a diagram

Look for inputs flowing through a process, dependent steps or branches, thresholds that change an outcome, and summaries that combine individual results. Name the question the visual helps the learner answer. In the review, quote the original passage, specify parts, connections, concrete values, units or thresholds, and name where the visual belongs and what sentences it can replace. Keep essential assumptions and caveats visible. Use a short wording change when it answers the question cleanly.

## Review design and learning

For every new or revised learner-facing page, exercise, diagram, or recording, use a relevant design/UX skill and a learning/instructional-design skill when available. The recording workflow uses [Frontend Design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) for hierarchy, typography, spacing, and readable diagrams, and [Instructional Design](https://github.com/joelrkohlman/instructional-design/blob/main/SKILL.md) for sequencing and prediction before comparison. Record the skills and concrete findings in the PR. If a skill is unavailable, document that and complete the corresponding review directly.

## Record walkthroughs

- Review the parent lesson's example and application question. For new storyboards, use a different case or question, show the relationship between code and an observable result, and give the learner time to predict before revealing the answer. Check all values against the runnable starter or the course model.
- Use Common Ground's [pinned record-demo workflow](https://github.com/snowch/claude-skills/blob/c9a7c521568632aa216932f4c965df386498602a/plugins/demo-video/skills/record-demo/SKILL.md). Record with Kokoro-82M v1.0 on ONNX CPU, voice `af_heart`, speed 1.0. Use the pinned model checks and keep captions and transcripts consistent with the canonical script. Put pronunciation overrides and pauses in the speech form.
- Render native 3840 × 2160 slides and export H.264 at 30 fps with AAC narration, English soft subtitles, and browser WebVTT captions. Keep the published media URLs. Check phonemes for CUDA vocabulary, numbers, indexing, and API names. Screen every cue with Whisper `small.en`, review raw flags and representative passes, and document any pending listening review.
- Inspect phone playback inline and in landscape fullscreen so captions and paused controls leave the code and data visible. Verify the final video decodes and the captions, posters, and transcripts load in the built course. See the [recording commands](README.md#record-walkthroughs).

## Verify and report

Follow the revised instructions in the built course. Run starter cases and suggested edits. Check the named evidence, errors, and recovery on relevant screen sizes and themes with keyboard navigation. Preserve saved code, predictions, selected cases, and completion. Run `npm test` for substantive browser changes and `npm run test:runner` for the Numba and GPGPU-Sim workflow. Check notebook correctness and PTX compilation with `scripts/check_native.py` where applicable. Report which behaviors were verified and any hardware or learner evaluation that is pending. Functional checks do not establish learning effectiveness.
