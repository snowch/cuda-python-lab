import {guides, variant} from './guided-experiments.mjs';
import {splitProgram} from './host-program.mjs';

export const guidedMarkup = `
  <p id="task-action"></p><p id="task-evidence"></p>
  <div class="actions">
    <button class="button" id="task-line" type="button">Show editable line</button>
    <a href="#console-title" id="task-console">Go to Console</a>
  </div>
  <details class="work-help" id="program-options"><summary id="program-options-title">About the starting program</summary>
    <p id="case-note">Choosing a task opens its case and saved Python. Cases share kernel edits and keep separate host code and predictions.</p>
    <p id="setup-status"></p>
    <div class="actions">
      <button class="button" id="prepare-task" type="button" aria-describedby="setup-status" hidden>Prepare starting program</button>
      <button class="button" id="undo-prepare" type="button" aria-describedby="setup-status" hidden>Undo preparation</button>
    </div>
  </details>
  <p id="setup-feedback" role="status" hidden></p>`;

// Older undo slots contained only the visible text. A markerless legacy slot
// has no historical shared kernel, so reopening it leaves today's kernel alone.
function replacement(view, program) {
  const parts = splitProgram(program);
  return {program, caseProgram:program, sharedKernel:parts?.kernel ?? view.sharedKernel};
}

function undoTarget(view, slot) {
  if (typeof slot === 'string') return replacement(view,slot);
  if (typeof slot?.program === 'string') return slot;
}

function affected(view, target) {
  const units = [];
  if (target.sharedKernel !== view.sharedKernel) units.push('the shared kernel across cases');
  if (target.caseProgram !== view.caseProgram) units.push('this case’s program and host code');
  return units.join(' and ');
}

function sameOwnership(a, b) {
  return a.caseProgram === b.caseProgram && a.sharedKernel === b.sharedKernel;
}

// A text-only slot did not record what it installed. Protect a different
// current kernel in that case too, since another case may have saved it.
function changedSharedKernel(view, target, slot) {
  return view.sharedKernel !== target.sharedKernel && view.sharedKernel !== slot.installedKernel;
}

function matches(view, target) {
  return view.source === target.program && sameOwnership(view,target);
}

export function mountGuide({slug, lesson, work, find, snapshot, selectCase, replace, reveal, active, readingTask}) {
  const tasks = guides[slug], select = find('guided-task');
  select.add(new Option('Free exploration','explore'));
  for (const t of tasks) {
    const option = new Option(t.step + '. ' + t.title,t.id);
    option.title = lesson.cases.find(c => c.id === t.fixture).label;
    select.add(option);
  }
  let task, start, end, checking = false, awaitingSave = '', operationSource;
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
    find('brief-title').textContent = task?.title ?? 'Free exploration';

    find('task-evidence').hidden = !task?.evidence;
    awaitingSave = '';
    operationSource = undefined;
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
    if (operationSource !== undefined && operationSource !== v.source) {
      operationSource = undefined;
      awaitingSave = '';
      feedback('');
    }
    if (awaitingSave && !work.dirty && !work.saving && !work.error) {
      feedback(awaitingSave);
      awaitingSave = '';
    } else if (awaitingSave && work.error) {
      feedback('The open program is in this tab. Export learner work or retry the save before leaving.');
    }
    const slot = work.confirmed.preparations?.[slug]?.[v.fixture.id];
    const savedUndo = undoTarget(v,slot);
    const blocked = Boolean(work.error || work.dirty || work.saving || checking || v.source !== v.saved);
    const prepare = find('prepare-task'), undo = find('undo-prepare');
    prepare.hidden = !task || v.source === start;
    prepare.disabled = blocked;
    undo.hidden = !savedUndo || matches(v,savedUndo);
    undo.disabled = blocked;
    find('program-options-title').textContent = !prepare.hidden && !undo.hidden ? 'Prepare starting program or undo'
      : !prepare.hidden ? 'Prepare starting program' : !undo.hidden ? 'Review undo preparation' : 'About the starting program';
    find('setup-status').hidden = !task && undo.hidden;
    const previousTask = task?.before.length && tasks.find(t => t.fixture === task.fixture && t.after.length &&
      [...t.before,...t.after].join() === task.before.join());
    const where = previousTask ? 'the program from “' + previousTask.title + '”' : 'the case starter';
    let note = !task ? '' : v.source === start ? 'The editor matches ' + where + '.'
      : v.source === end ? 'The editor contains the edit for this task.'
      : 'The open program differs from ' + where + '.';
    if (!prepare.hidden) note += ' Prepare replaces ' + (affected(v,replacement(v,start)) || 'the open program') + '. Undo keeps your current version.';
    if (!undo.hidden) {
      note += ' Undo restores ' + (affected(v,savedUndo) || 'the earlier program') + '.';
      if (changedSharedKernel(v,savedUndo,slot)) {
        if (v.sharedKernel === null) note += ' There is currently no shared draft. Undo again to return to that state.';
        else {
          note += typeof slot === 'string' ? ' This older undo copy did not record which shared kernel it installed.'
            : ' The shared kernel changed since preparation.';
          note += ' Undo keeps its current version in recovery copies.';
        }
      }
    }
    if ((!prepare.hidden || !undo.hidden) && blocked) {
      if (work.error) note += ' Export your work or retry the save before replacing code.';
      else if (v.source !== v.saved && !work.dirty && !work.saving) note += ' Review the saved program before preparing or undoing.';
      else note += ' Wait for a confirmed save before replacing code.';
    }
    find('setup-status').textContent = note.trim();
  }
  async function exchange(undo, proposed, hostOnly = false) {
    const before = snapshot(), selected = select.value;
    const path = ['preparations',slug,before.fixture.id];
    const previous = work.confirmed.preparations?.[slug]?.[before.fixture.id];
    if (checking || work.dirty || work.saving || work.error) return;
    const target = undo ? undoTarget(before,previous) : proposed !== undefined ? replacement(before,proposed) : task && replacement(before,start);
    if (hostOnly && target) {
      const open = splitProgram(before.source), next = splitProgram(target.program);
      if (!open || !next || open.kernel !== next.kernel) return;
      target.sharedKernel = before.sharedKernel;
    }
    if (!target || matches(before,target)) return;
    checking = true; update();
    try {
      await work.observe();
      if (!active()) return;
      const now = snapshot();
      if (work.dirty || work.saving || work.error || selected !== select.value || now.fixture !== before.fixture ||
          now.source !== before.source || !sameOwnership(now,before) || now.source !== now.saved ||
          JSON.stringify(previous) !== JSON.stringify(work.confirmed.preparations?.[slug]?.[now.fixture.id])) {
        feedback('The open or saved work changed. Review it before trying again.');
        return;
      }
      // The synchronous pair joins the same transactional batch. On a conflict or storage
      // failure the displaced source remains in the checkpoint, recovery archive or pending export.
      work.refresh(['preparations','drafts','programs']);
      work.change(path,{
        program:before.source, caseProgram:before.caseProgram, sharedKernel:before.sharedKernel,
        installedKernel:target.sharedKernel,
      },{retainPrevious:!undo});
      const intervening = undo && changedSharedKernel(before,target,previous);
      replace(target,intervening,{focus:proposed === undefined});
      operationSource = target.program;
      awaitingSave = undo ? 'Previous program reopened. Undo again to return to the program you just left.'
        : proposed !== undefined ? 'Program edits applied. Your previous program is available in Undo preparation.'
        : 'Starting program prepared. Your previous program is available in Undo preparation.';
      feedback('Saving the open program and its undo copy…');
      return true;
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
  return {update,forCase, applyProgram:(program,hostOnly)=>exchange(false,program,hostOnly),
    canApply:()=>!checking && !work.dirty && !work.saving && !work.error && snapshot().source===snapshot().saved};
}
