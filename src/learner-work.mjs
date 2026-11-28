// The IndexedDB transaction owns concurrency. The v1 mirror keeps older releases readable.
import {joinProgram, splitProgram} from './host-program.mjs';

export const workKey = 'cuda-python-lab-v1';
const fields = ['drafts', 'programs', 'restoredDrafts', 'restoredPrograms', 'results', 'predictions', 'caseAnswers', 'preparations', 'completed', 'cases'];
const perCase = new Set(['programs', 'restoredPrograms', 'results', 'caseAnswers', 'preparations']);
const preferences = new Set(['completed', 'cases']);
const copyLimit = 16;
const empty = () => Object.fromEntries(fields.map(key => [key, {}]));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function get(record, path) {
  return path.reduce((parent, key) => parent?.[key], record);
}

function put(record, path, value) {
  let parent = record;
  for (const key of path.slice(0, -1)) parent = parent[key] ??= {};
  if (value === undefined) delete parent[path.at(-1)];
  else parent[path.at(-1)] = value;
}

function remember(history, path, value) {
  if (value === undefined || history.some(copy => equal(copy.path, path) && equal(copy.value, value))) return;
  if (history.length >= copyLimit) throw Error('Recovery copies are full. Changes are unsaved. Export learner work and remove a recovery copy, then retry.');
  history.push({id:crypto.randomUUID(), path, value, savedAt:new Date().toISOString()});
}

function hostPart(program) {
  return typeof program === 'string' ? splitProgram(program)?.host ?? program : program;
}

function mergeEdit(record, {path, base, value, hostChanged, retainPrevious}) {
  const current = get(record, path);
  // A new preparation may displace an older undo slot. Undo itself swaps the two programs.
  if (retainPrevious && !equal(current,value)) remember(record.recoveryCopies,path,current);
  const program = path[0] === 'programs';
  const keepHost = program && !hostChanged && typeof current === 'string' && splitProgram(current);
  if (!preferences.has(path[0]) && !keepHost) {
    const compare = program ? hostPart : v => v;
    if (!equal(compare(current), compare(base)) && !equal(compare(current), compare(value))) {
      remember(record.recoveryCopies, path, current);
    }
  }
  if (program && typeof value === 'string') {
    const parts = keepHost || splitProgram(value);
    if (parts) {
      const kernel = record.drafts[path[1]] ?? parts.kernel;
      const local = splitProgram(value);
      if (local?.kernel.trimEnd() !== kernel.trimEnd() || local.host !== parts.host) value = joinProgram(kernel, parts.host);
    }
  }
  put(record, path, value);
}

function importLegacy(record, snapshot, archive = true) {
  const conflicts = [];
  // A session snapshot can be older than another tab's durable work.
  for (const field of fields) {
    for (const [slug, entry] of Object.entries(snapshot[field] ?? {})) {
      const items = perCase.has(field) ? Object.entries(entry) : [[null, entry]];
      for (const [index, value] of items) {
        const path = index === null ? [field, slug] : [field, slug, index];
        const current = get(record, path);
        if (current === undefined) put(record, path, value);
        else if (archive && !preferences.has(field) && !equal(current, value)) conflicts.push({path, value});
      }
    }
  }
  const history = record.recoveryCopies;
  const novel = conflicts.filter(({path, value}) => !history.some(copy => equal(copy.path, path) && equal(copy.value, value)));
  if (history.length + novel.length > copyLimit) remember(history, ['legacy', 'Earlier course work'], snapshot);
  else for (const {path, value} of novel) remember(history, path, value);
}

export function openLearnerWork(onChange) {
  const state = empty();
  const pending = new Map();
  let copies = [], error = '', saving = null, saved = false, legacy;
  let database, checkpoint, legacyBaseline = empty();

  function connect() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('cuda-python-lab-work', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('work');
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch(cause => { database = undefined; throw cause; });
    return database;
  }

  function mirror() {
    const raw = localStorage.getItem(workKey);
    const data = raw === null ? {} : JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('The saved work record could not be read.');
    // The previous release uses JSON.stringify with no trailing whitespace.
    // Its next save removes this delimiter even if it copied our revision field.
    return {data, exists:raw !== null, transactional:raw?.endsWith('\n')};
  }

  function read() {
    let old;
    try { old = mirror(); } catch (cause) {
      if (!checkpoint) throw cause;
      failed(cause);
      old = {data:{}, exists:false};
    }
    if (!checkpoint) legacyBaseline = {...empty(), ...old.data};
    const latest = structuredClone(checkpoint ?? legacyBaseline);
    const record = {...empty(), recoveryCopies:[], ...latest};
    saved = Boolean(checkpoint || (old.exists && !old.transactional));
    copies = record.recoveryCopies;
    return record;
  }

  async function readCheckpoint() {
    const db = await connect();
    const record = await new Promise((resolve, reject) => {
      const request = db.transaction('work').objectStore('work').get('current');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (record && (!checkpoint || record.workRevision >= checkpoint.workRevision)) checkpoint = record;
  }

  async function load() {
    try {
      await readCheckpoint();
      const old = mirror();
      // The mirror can survive an interrupted final database commit. Reconcile
      // it just like an older release, keeping any competing values recoverable.
      const interrupted = old.transactional && old.data.workRevision > (checkpoint?.workRevision ?? 0);
      if (old.exists && ((checkpoint && !old.transactional) || interrupted)) await flush();
      refresh();
    } catch (cause) { failed(cause); }
  }

  function failed(cause) {
    const storageErrors = {QuotaExceededError:'Browser storage is full.', SecurityError:'The browser denied storage access.'};
    error = storageErrors[cause.name] || cause.message || 'Browser storage is unavailable.';
    onChange();
  }

  // Refresh only fields whose controls are about to be mounted. A remote save
  // must never move the cursor or change the comparison base under a live editor.
  function refresh(selected = fields) {
    try {
      const record = read();
      if (legacy) importLegacy(record, legacy.work, false);
      for (const field of selected) state[field] = record[field];
      for (const edit of pending.values()) if (selected.includes(edit.path[0])) put(state, edit.path, edit.value);
    } catch (cause) { failed(cause); }
  }

  async function write(action, afterWrite, discardId) {
    const db = await connect();
    await new Promise((resolve, reject) => {
      // Request the current record *inside* the read/write transaction. A queued
      // writer sees the preceding commit even across separate renderer processes.
      const tx = db.transaction('work', 'readwrite');
      const store = tx.objectStore('work');
      const request = store.get('current');
      let record, failure;
      function abort(cause) { failure = cause; tx.abort(); }
      tx.onabort = () => reject(failure ?? tx.error ?? Error('The save was interrupted.'));
      tx.oncomplete = () => {
        checkpoint = record;
        copies = record.recoveryCopies;
        saved = true;
        resolve();
      };
      request.onsuccess = () => {
        try {
          const old = mirror();
          record = {...empty(), recoveryCopies:[], ...(request.result ?? old.data)};
          copies = record.recoveryCopies;
          record.recoveryCopies = record.recoveryCopies.filter(copy => copy.id !== discardId);
          if (request.result && old.exists && (!old.transactional || old.data.workRevision > record.workRevision)) {
            importLegacy(record, old.data);
          }
          action(record);
          record.workRevision = (record.workRevision ?? 0) + 1;
          store.put(record, 'current').onsuccess = () => {
            try {
              const encoded = JSON.stringify(record) + '\n';
              localStorage.setItem(workKey, encoded);
              if (localStorage.getItem(workKey) !== encoded) throw Error('Could not verify the save.');
            } catch (cause) { abort(cause); }
          };
        } catch (cause) { abort(cause); }
      };
    });
    afterWrite?.();
  }

  function flush() {
    if (saving) return saving;
    let batch;
    saving = write(record => {
      if (legacy) importLegacy(record, legacy.work);
      batch = [...pending.entries()];
      // Embed the effective shared kernel when writing a case-specific program.
      for (const [, edit] of batch) if (edit.path[0] !== 'programs') mergeEdit(record, edit);
      for (const [, edit] of batch) if (edit.path[0] === 'programs') mergeEdit(record, edit);
    }, () => {
      for (const [key, edit] of batch) {
        const current = pending.get(key);
        if (current === edit) pending.delete(key);
        else if (current) current.base = edit.value;
      }
      error = '';
      if (legacy) { legacy.done(); legacy = undefined; }
    }).catch(failed).finally(() => {
      saving = null;
      if (!error && pending.size) flush();
      onChange();
    });
    onChange();
    return saving;
  }

  function change(path, value, options = {}) {
    const key = JSON.stringify(path);
    const previous = pending.get(key);
    const before = get(state, path);
    if (equal(before, value)) return;
    pending.set(key, {path, value, base:previous ? previous.base : before ?? options.displayed,
      retainPrevious:previous?.retainPrevious || options.retainPrevious, hostChanged:previous?.hostChanged || options.hostChanged});
    put(state, path, value);
    if (saving) onChange();
    else flush();
  }

  async function removeCopy(id) {
    try {
      await write(() => {}, undefined, id);
      if (pending.size || error) await flush();
    } catch (cause) { failed(cause); }
    onChange();
  }

  return {
    state, load, refresh, change, flush, removeCopy,
    async observe() {
      try { await readCheckpoint(); } catch (cause) { failed(cause); }
      refresh(['completed']);
      onChange();
    },
    migrate(work, done) { if (work) { legacy = {work, done}; refresh(); flush(); } },
    isPending(path) { return pending.has(JSON.stringify(path)); },
    get confirmed() { return checkpoint ?? legacyBaseline; },
    get copies() { return copies; },
    get error() { return error; },
    get saved() { return saved; },
    get dirty() { return pending.size > 0 || Boolean(legacy); },
    get saving() { return Boolean(saving); },
    backup() {
      let durable;
      try { durable = read(); } catch { /* Current tab work is still exportable. */ }
      let old;
      try { old = mirror(); } catch { /* Storage access may be denied. */ }
      return {format:'cuda-python-lab-work-backup-1', tab:state, durable:durable ?? checkpoint,
        recoveryCopies:copies, legacy:legacy?.work, legacyBrowserWork:old?.exists && !old.transactional ? old.data : undefined};
    },
  };
}
