import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export class NotesError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validId = id => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length < 150;
async function read(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw new NotesError('The saved notes could not be read. They have not been overwritten; check the private backup.', 500); }
}
async function atomic(path, data) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
    await rename(temporary, path);
  } finally { await unlink(temporary).catch(() => {}); }
}
function normalize(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new NotesError('Notes must be an object.');
  const result = {};
  for (const key of ['notes', 'handoff']) {
    if (!(key in patch)) continue;
    if (typeof patch[key] !== 'string' || patch[key].length > 50000) throw new NotesError('Each note must be text of at most 50,000 characters.');
    result[key] = patch[key];
  }
  if ('status' in patch) {
    if (!['not-started', 'drafting', 'ready', 'needs-canvas'].includes(patch.status)) throw new NotesError('Choose a valid preparation status.');
    result.status = patch.status;
  }
  if (!Object.keys(result).length) throw new NotesError('No note fields supplied.');
  return result;
}
export function createNotesStore(root) {
  const directory = join(root, '.mission-control', 'notes');
  const queues = new Map();
  async function snapshot(ids) {
    const records = {}, previousRecords = {};
    for (const id of ids) {
      if (!validId(id)) continue;
      const record = await read(join(directory, `${id}.json`));
      const previous = await read(join(directory, `${id}.previous.json`));
      if (record) records[id] = record;
      if (previous) previousRecords[id] = previous;
    }
    return { records, previousRecords, storage: directory };
  }
  async function save({ lessonId, patch, expectedRevision, migration = false }, lessonIds) {
    if (!validId(lessonId) || !lessonIds.includes(lessonId)) throw new NotesError('Unknown lesson.');
    const fields = normalize(patch);
    const operation = (queues.get(lessonId) || Promise.resolve()).catch(() => {}).then(async () => {
      const path = join(directory, `${lessonId}.json`);
      const current = await read(path);
      const migrationFingerprint = hash(fields);
      if (migration && current) {
        if (current.migrationFingerprint === migrationFingerprint) return { record: current, migrated: false };
        throw new NotesError('Private notes already exist. Your browser copy has been kept for review.', 409);
      }
      if (!migration && expectedRevision !== (current?.revision || null)) throw new NotesError('These notes changed in another window. Your draft is kept. Reload saved notes and compare before saving again.', 409);
      const now = new Date().toISOString();
      const record = { ...current, ...fields, lessonId, revision: randomUUID(), updatedAt: now };
      if ('handoff' in fields) record.handoffUpdatedAt = now;
      if (migration) record.migrationFingerprint = migrationFingerprint;
      await mkdir(directory, { recursive: true, mode: 0o700 });
      if (current) await atomic(join(directory, `${lessonId}.previous.json`), current);
      await atomic(path, record);
      return { record, previous: current, migrated: migration };
    });
    queues.set(lessonId, operation);
    try { return await operation; } finally { if (queues.get(lessonId) === operation) queues.delete(lessonId); }
  }
  return { snapshot, save };
}
