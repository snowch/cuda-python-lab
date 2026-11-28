import {guides, variant} from './guided-experiments.mjs';
import {splitProgram} from './host-program.mjs';

export const guidedMarkup = `
  <label for="guided-task">Guided task</label><select id="guided-task"></select>
  <p id="task-action"></p><p id="task-evidence"></p>
  <p id="setup-status"></p>
  <div class="actions">
    <button class="button" id="prepare-task" type="button" hidden>Prepare starting program</button>
    <button class="button" id="undo-prepare" type="button" hidden>Undo preparation</button>
    <button class="button" id="task-line" type="button">Show editable line</button>
    <a href="#console-title" id="task-console">Go to Console</a>
  </div><p id="setup-feedback" role="status" hidden></p>`;

function changeSummary(current, target) {
  const a = splitProgram(current), b = splitProgram(target);
  if (!a || !b) return 'the complete program, including its kernel and host code';
  const parts = [];
  if (a.kernel !== b.kernel) parts.push('the shared kernel used across this lesson’s cases');
  if (a.host !== b.host) parts.push('the host code for this case');
  return parts.join(' and ') || 'the spacing between kernel and host code';
}

export function mountGuide({slug, lesson, work, find, snapshot, selectCase, replace, reveal, active, readingTask}) {
  const tasks = guides[slug], select = find('guided-task');
  select.add(new Option('Free exploration','explore'));
  for (const t of tasks) {
    const option = new Option(t.step + '. ' + t.title,t.id);
    option.title = lesson.cases.find(c => c.id === t.fixture).label;
    select.add(option);
  }
  let task, start, end, checking = false, awaitingSave = '';
  const feedback = message => {
    find('setup-feedback').textContent = message;
    find('setup-feedback').hidden = !message;
  };
  function selectTask(id) {
    const view = snapshot();
    task = tasks.find(t => t.id === id && t.fixture === view.fixture.id);
    select.value = task?.id ?? 'explore';
    start = task && variant(view.starter,task.before);
    end = task && (task.returnsStarter ? view.starter : variant(start,task.after));
    find('task-action').textContent = task ? task.instruction ?? lesson.exercise[task.step - 1]
      : 'Edit and run freely. Switching cases keeps your kernel and opens that case’s host draft.';
    find('task-evidence').textContent = task?.evidence ?? '';
    find('task-evidence').hidden = !task || (task.kind === 'run' && !task.instruction && !task.after.length);
    awaitingSave = '';
    feedback('');
    update();
  }
  function forCase(preferred) {
    const {fixture} = snapshot();
    const first = tasks.find(t=>t.fixture === fixture.id);
    selectTask(preferred === 'explore' || tasks.some(t=>t.id===preferred && t.fixture===fixture.id) ? preferred : first?.id);
  }
  function update() {
    const v = snapshot();
    if (awaitingSave && !work.dirty && !work.saving && !work.error) {
      feedback(awaitingSave);
      awaitingSave = '';
    } else if (awaitingSave && work.error) {
      feedback('The open program is in this tab. Export learner work or retry the save before leaving.');
    }
    const savedUndo = work.confirmed.preparations?.[slug]?.[v.fixture.id];
    const blocked = Boolean(work.error || work.dirty || work.saving || checking || v.source !== v.saved);
    const prepare = find('prepare-task'), undo = find('undo-prepare');
    prepare.hidden = !task || v.source === start;
    prepare.disabled = blocked;
    undo.hidden = typeof savedUndo !== 'string' || savedUndo === v.source;
    undo.disabled = blocked;
    find('setup-status').hidden = !task && undo.hidden;
    const previousTask = task?.before.length && tasks.find(t => t.fixture === task.fixture && t.after.length &&
      [...t.before,...t.after].join() === task.before.join());
    const where = previousTask ? 'the program from “' + previousTask.title + '”' : 'the case starter';
    let note = !task ? '' : v.source === start ? 'The editor matches ' + where + '.'
      : v.source === end ? 'The editor contains the edit for this task.'
      : 'The open program differs from ' + where + '.';
    if (!prepare.hidden) note += ' Prepare replaces ' + changeSummary(v.source,start) + ' and keeps the open program for Undo.';
    if (!undo.hidden) note += ' Undo swaps the open program with the version kept before preparation.';
    if ((!prepare.hidden || !undo.hidden) && blocked) note += v.source !== v.saved && !work.dirty && !work.saving && !work.error
      ? ' Review the saved program before preparing or undoing.' : ' Wait for a confirmed save before replacing code.';
    find('setup-status').textContent = note.trim();
  }
  async function exchange(undo) {
    const before = snapshot(), selected = select.value;
    const path = ['preparations',slug,before.fixture.id];
    const previous = work.confirmed.preparations?.[slug]?.[before.fixture.id];
    const target = undo ? previous : start;
    if (checking || work.dirty || work.saving || work.error || typeof target !== 'string' || target === before.source) return;
    checking = true; update();
    try {
      await work.observe();
      if (!active()) return;
      const now = snapshot();
      if (work.dirty || work.saving || work.error || selected !== select.value || now.fixture !== before.fixture ||
          before.source !== now.source || now.source !== now.saved || previous !== work.confirmed.preparations?.[slug]?.[now.fixture.id]) {
        feedback('The open or saved work changed. Review it before trying again.');
        return;
      }
      // The synchronous pair joins the same transactional batch. On a conflict or storage
      // failure the displaced source remains in the checkpoint, recovery archive or pending export.
      work.refresh(['preparations']);
      work.change(path,before.source,{retainPrevious:!undo});
      replace(target);
      awaitingSave = undo ? 'Previous program reopened. Undo again to return to the program you just left.'
        : 'Starting program prepared. Your previous program is available in Undo preparation.';
      feedback('Saving the open program and its undo copy…');
    } finally { checking = false; if (active()) update(); }
  }
  select.onchange = () => {
    const id = select.value, chosen = tasks.find(t => t.id === id);
    if (chosen && chosen.fixture !== snapshot().fixture.id) selectCase(lesson.cases.findIndex(c => c.id === chosen.fixture),id);
    else selectTask(id);
  };
  find('prepare-task').onclick = () => exchange(false);
  find('undo-prepare').onclick = () => exchange(true);
  find('task-line').onclick = () => reveal(task?.anchor ?? lesson.sourceTarget);
  find('task-console').onclick = event => {
    event.preventDefault();
    find('console-title').focus();
  };
  forCase(readingTask);
  return {update,forCase};
}
