import {caseQuestion, edits, guides, variant} from "./guided-experiments.mjs";
import {standaloneProgram} from "./host-program.mjs";
import {migrateCudaImports} from "./source-migration.mjs";

const markdown = source => ({cell_type:"markdown", metadata:{}, source});
const code = (source, metadata = {}) => ({cell_type:"code", metadata, source, execution_count:null, outputs:[]});

// Only the authored edits have a numerical oracle. All references come from the fixture.
function objective(slug, fixture, changes) {
  const {buffers, expected} = fixture;
  const inputs = buffers.values?.values;
  let values = expected, policy = slug === "softmax" ? "probabilities" : "values";
  const prints = [];
  for (const edit of changes) {
    switch (edit) {
      case "write73": values = [73]; break;
      case "originalHost": prints.push(buffers.out.values); break;
      case "bytes": prints.push([buffers.x.values.length * 4, buffers.y.values.length * 4, expected.length * 4]); break;
      case "column": prints.push(Array.from({length:8}, (_, i) => expected[i * buffers.out.shape[1]])); break;
      case "counts": prints.push([expected.slice(0,32), expected.slice(32)].map(block => block.filter(x => x < 0).length)); break;
      case "coordinate": prints.push([inputs[2 * buffers.values.shape[1]]]); break;
      case "plain": policy = "race"; break;
      case "unshift": {
        policy = "overflow";
        const width = buffers.values.shape[1];
        values = inputs.map((x, i) => {
          const row = Math.floor(i / width) * width;
          const sum = inputs.slice(row, row + width).reduce((total, v) => total + Math.exp(v), 0);
          const probability = Math.exp(x) / sum;
          return Number.isNaN(probability) ? null : probability;
        });
        break;
      }
      case "direct": values = inputs.slice(0, fixture.scalars.n); break;
      case "halo": values = expected.map((x, i) => i && i % fixture.threads[0] === 0 ? x - inputs[i-1] : x); break;
      case "regroup": policy = "precision"; values = buffers.a.values.map((a,i) => a + buffers.c.values[i] + buffers.b.values[i]); break;
      case "sentinel": values = expected.map(x => x === -1 ? -9 : x); break;
    }
  }
  if (changes.includes("sumRows")) prints.push(Array(buffers.out.shape[0]).fill(policy === "overflow" ? null : 1));
  if (changes.includes("finite")) prints.push("False");
  return {values, policy, prints};
}

function nativeText(text) {
  return text.replaceAll("in the Console", "under the program cell").replaceAll("two Console runs", "two cell outputs")
    .replaceAll("one simulator outcome of a race", "one native observation of a race")
    .replaceAll("In the same program, change", "In this cell, change");
}

export function makeNotebook({slug, lesson, kernel, source, fixture, selectedTask, runtime}) {
  const phases = guides[slug];
  const catalog = {lesson:slug, exportedCase:fixture.id, exported:migrateCudaImports(source),
    selectedTask:phases.find(t => t.id === selectedTask && t.fixture === fixture.id)?.id ?? null,
    cases:{}, tasks:{}, edits:{}};
  for (const f of lesson.cases) {
    const {shape, dtype} = f.buffers[f.output];
    catalog.cases[f.id] = {label:f.label, shape, dtype, expected:f.expected, starter:standaloneProgram(kernel,f)};
  }
  for (const task of phases) {
    const f = lesson.cases.find(c => c.id === task.fixture);
    const targetEdits = task.returnsStarter ? [] : [...task.before, ...task.after];
    const entry = {case:task.fixture, kind:task.kind, before:task.before, after:task.after,
      restore:Boolean(task.returnsStarter), objective:objective(slug, f, targetEdits)};
    if (task.kind === "run" && (task.after.length || task.returnsStarter)) {
      entry.startingObjective = objective(slug, f, task.before);
    }
    catalog.tasks[task.id] = entry;
    for (const id of [...task.before,...task.after]) catalog.edits[id] = edits[id];
  }
  function program(caseId, taskId, body) {
    return code(`%%experiment ${slug} ${caseId} ${taskId}\n${body}`, {cuda_lab:{case:caseId, task:taskId}});
  }
  function predict(f) { return '**Predict for the starter case.** ' + caseQuestion(slug,lesson,f); }
  const tolerance = slug === "softmax"
    ? "Float32 exponentials and parallel sums can round slightly differently. Each probability has absolute tolerance 1e-7 plus relative tolerance 1e-5 times the reference magnitude. Stable row sums must be within 2e-6 of one."
    : "These small integer or exactly representable float32 fixture results use zero absolute and relative tolerance.";
  const cells = [
    markdown(`# ${lesson.title}\n\n${lesson.summary}\n\n**Your exported case** · ${fixture.label}\n\n${predict(fixture)}\n\nRun **Set up this notebook** once per kernel session. Then run **Your exported program**, or go straight to a numbered experiment. Each program cell contains its own kernel, inputs and launch. Shift+Enter runs that cell and checks that run’s returned array. The first line names the lesson, case and task. Leave it in place when editing Python below it.\n\nEach numbered task opens with its own starting code, including any required earlier edits. If the task calls for a change, running this code checks the starting result. Make the edit and rerun the cell to check the changed program. To switch cases, run the cell under that case’s heading. To keep two versions, duplicate the cell before editing. Output belongs to the last execution of that cell. Rerun after each edit.`),
    markdown(`## Set up this notebook\n\nUse a Python 3 IPython kernel in Jupyter or Colab. Reading the file and inspecting the references work offline. Executing CUDA programs needs an NVIDIA GPU and a working native backend. In Colab, choose **Runtime → Change runtime type → GPU** if one is available. For local Linux or Jetson, select the kernel for your CUDA environment.\n\nRun the setup cell below to see the Python, architecture, compiler, driver, runtime and device it detects. For a fresh compatible CUDA 12 environment, review the package plan first in a separate cell:\n\n\`\`\`python\n%pip install --dry-run "numba-cuda-mlir[cu12]==0.6.0" "numpy>=1.26,<2.5"\n\`\`\`\n\nIf the plan fits your environment, repeat without \`--dry-run\`, restart the kernel and rerun setup. Installation needs package access or an offline wheelhouse. On Jetson, record JetPack and check the ARM64 wheels against your Python and system CUDA versions before installing. A compatible wheel alone does not establish device support.\n\nTo recover a starting program, run \`print(lab_start("CASE", "TASK"))\` in a new cell, using the two IDs after the lesson name on its first line. Copy the printed Python into a duplicate of the program cell. Your original edits stay in place.`),
    code(`# Register the offline experiment runner and check this environment.\n${runtime.trimEnd()}\n\nLAB = json.loads(${JSON.stringify(JSON.stringify(catalog))})\nget_ipython().register_magic_function(run_experiment, "cell", "experiment")\nNATIVE_READY = lab_preflight()\n`, {jupyter:{source_hidden:true}, collapsed:true, tags:["setup"]}),
    markdown(`## Your exported program\n\n**${fixture.label}** · \`${fixture.id}\`\n\n${catalog.selectedTask ? "Selected task at export: **" + phases.find(t => t.id === catalog.selectedTask).title + "**. " : ""}This copy contains the open editor text, including host changes. Recognized legacy CUDA imports are adapted for the native backend. The numbered experiments and starter cases use course source. Other saved case edits stay in your browser. Use **Editor tools → Export all learner work** there for a full backup.\n\nThe checker compares a recognized program with its case reference. For custom code it shows a starter comparison and leaves the custom objective unassessed. Shape and dtype must match exactly. ${tolerance} To supply a result, assign the returned NumPy array to \`actual\` in the program.`),
    program(fixture.id, "exported", catalog.exported),
  ];
  const covered = new Set();
  for (const task of phases) {
    const f = lesson.cases.find(c => c.id === task.fixture);
    const start = variant(catalog.cases[f.id].starter,task.before);
    const prior = task.before.length ? "This copy includes the prerequisite edit." : "Start with the supplied case program.";
    const heading = `## ${task.step}. ${task.title}\n\n**Starter case** · ${f.label}\n\n${predict(f)}\n\n`;
    const action = nativeText(task.instruction ?? lesson.exercise[task.step - 1]);
    if (task.kind === "reason") {
      cells.push(markdown(heading + '**Source reasoning.** ' + action + '\n\n' + nativeText(task.evidence) +
        '\n\nInspect this starting source. Work out the answer on paper.\n\n```python\n' + start.trimEnd() + '\n```'));
    } else {
      if (!task.before.length) covered.add(f.id);
      cells.push(markdown(heading + prior + ' ' + action + '\n\n**Evidence to examine.** ' + nativeText(task.evidence)),
        program(f.id,task.id,start));
    }
  }
  for (const f of lesson.cases.filter(c => !covered.has(c.id))) {
    cells.push(markdown(`## Starter case · ${f.label}\n\n${predict(f)}\n\nRun this complete starter for an independent case comparison.`),
      program(f.id,"starter",catalog.cases[f.id].starter));
  }
  const extensions = {
    "first-value":"Duplicate the completed “Inspect the original host array” cell. Replace np.zeros(1, dtype=np.float32) in main() with np.array([5], dtype=np.float32). Which of the two printed arrays changes?",
    scan:"Duplicate the flags program. Immediately before return result in main(), add print(result[[0, 2, 3, 6]] - 1). Explain why the four printed positions are 0, 1, 2 and 3.",
    precision:"In a separate Python cell, run import numpy as np and print(np.float64(16777216) + 1 - 16777216). Compare the value with the first output of the original float32 grouping.",
  };
  const extension = extensions[slug] ?? lesson.native;
  const materials = extension.includes("Appendix A") ? "\n\nThe optional Appendix A investigation uses the [native investigation files](https://snowch.github.io/cuda-python-lab/gpu/cuda-python-investigations.zip) and the tools named in their instructions." : "";
  cells.push(markdown(`## Explain the authored examples\n\n${lesson.explain}\n\n### Optional native investigation\n\n${extension}${materials}`));
  return {nbformat:4, nbformat_minor:5, metadata:{kernelspec:{display_name:"Python 3",language:"python",name:"python3"},
    language_info:{name:"python"},accelerator:"GPU"},cells:cells.map((cell,i) => ({...cell,id:slug+"-"+(i+1)}))};
}
