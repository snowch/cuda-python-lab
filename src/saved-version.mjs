// Compare exactly what this lesson shows with what reopening its case would show.
// Keep the preview fixed until the learner explicitly reviews another version.
export function mountSavedReview(panel, work, getLesson) {
  const details = document.createElement('details');
  details.id = 'latest-version';
  details.hidden = true;
  details.innerHTML = `<summary>Review saved version</summary>
    <p data-context></p>
    <label>Saved program<textarea data-program readonly rows="7" spellcheck="false"></textarea></label>
    <label>Saved prediction<textarea data-answer readonly rows="2"></textarea></label>
    <p data-note role="status"></p>
    <button type="button" class="button" data-review hidden>Review updated version</button>
    <button type="button" class="button" data-load>Load reviewed version</button>`;
  panel.querySelector('#work-actions').before(details);
  const field = name => details.querySelector('[data-' + name + ']');
  const blocked = () => Boolean(work.dirty || work.saving || work.error);
  let reviewed, checking = false;

  function sameView(a, b) {
    return a && b && a.slug === b.slug && a.index === b.index &&
      a.program === b.program && a.savedProgram === b.savedProgram &&
      a.answer === b.answer && a.savedAnswer === b.savedAnswer;
  }

  function preview(current) {
    reviewed = current;
    field('context').textContent = current.context;
    field('program').parentElement.hidden = current.program === current.savedProgram;
    field('program').value = current.savedProgram;
    field('answer').parentElement.hidden = current.answer === current.savedAnswer;
    field('answer').value = current.savedAnswer;
  }

  function reset() {
    details.open = false;
    reviewed = undefined;
  }

  function update() {
    const lesson = getLesson();
    const current = lesson?.snapshot();
    const program = current && current.program !== current.savedProgram;
    const answer = current && current.answer !== current.savedAnswer;
    const busy = blocked();
    const stale = !busy && (program || answer);
    if (lesson) lesson.editorNotice.hidden = busy || !program;
    details.hidden = !stale && !(details.open && busy && current);
    if (details.hidden) reset();
    if (!details.hidden && current) {
      // Prepare the next preview before native disclosure, then freeze it
      // while open so a later commit cannot silently change the load target.
      if (!busy && (!details.open || !reviewed) && !sameView(current, reviewed)) preview(current);
      const changed = !sameView(current, reviewed);
      field('review').hidden = busy || !changed;
      field('load').disabled = busy || checking || changed;
      const note = work.error ? 'Resolve the save error before loading a version.'
        : busy ? 'Waiting for this tab’s edits to finish saving.'
        : changed ? 'The open or saved version changed. Review it again before loading.'
        : 'Loading replaces the differing text in this tab. Export learner work to keep a copy first.';
      if (field('note').textContent !== note) field('note').textContent = note;
    }
    if (!stale) return '';
    const difference = program && answer ? 'The open program and prediction differ from their saved versions.'
      : program ? 'The open program differs from the saved version.'
      : 'The open prediction differs from the saved version.';
    return program ? difference + ' Run and code downloads use the open editor.' : difference;
  }

  details.addEventListener('toggle', () => {
    if (!details.open) reviewed = undefined;
    update();
  });
  field('review').onclick = () => {
    if (blocked()) return;
    preview(getLesson().snapshot());
    update();
    field('load').focus();
  };
  field('load').onclick = async () => {
    const lesson = getLesson(), accepted = reviewed;
    if (!accepted || blocked() || checking || !sameView(lesson?.snapshot(), accepted)) return;
    checking = true;
    update();
    try {
      // A storage event may still be in flight. Recheck the database, scope,
      // local text and pending writes after the asynchronous read.
      await work.observe();
      if (lesson !== getLesson() || !details.open || reviewed !== accepted ||
          blocked() || !sameView(lesson.snapshot(), accepted)) return;
      lesson.apply(accepted);
    } finally {
      checking = false;
      update();
    }
  };

  return {update, reset, open() {
    if (details.hidden) return;
    details.open = true;
    update();
    details.querySelector('summary').focus();
  }};
}
