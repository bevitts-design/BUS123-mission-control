import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNotesStore } from './notes.mjs';
const id = 'math-m01-l01';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'bus123-notes-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, store: createNotesStore(root) };
}
test('notes survive reopening and preserve previous save including deliberate clearing', async t => {
  const {root, store} = await fixture(t);
  const first = await store.save({lessonId:id, expectedRevision:null, patch:{notes:'Teach fractions',handoff:'Review next time',status:'drafting'}}, [id]);
  const second = await store.save({lessonId:id, expectedRevision:first.record.revision, patch:{notes:'',status:'ready'}}, [id]);
  const data = await createNotesStore(root).snapshot([id]);
  assert.equal(data.records[id].notes, '');
  assert.equal(data.records[id].handoff, 'Review next time');
  assert.equal(data.previousRecords[id].notes, 'Teach fractions');
  assert.notEqual(first.record.revision, second.record.revision);
});
test('migration is idempotent and never replaces a different private record', async t => {
  const {store} = await fixture(t);
  const args = {lessonId:id, migration:true, patch:{notes:'Original browser note'}};
  const first = await store.save(args,[id]);
  await store.save({lessonId:id,expectedRevision:first.record.revision,patch:{notes:'Edited privately'}},[id]);
  await store.save(args,[id]);
  await assert.rejects(store.save({...args,patch:{notes:'Another browser'}},[id]), e=>e.status===409);
  assert.equal((await store.snapshot([id])).records[id].notes,'Edited privately');
});
test('simultaneous saves cannot silently overwrite each other', async t => {
  const {store} = await fixture(t);
  const results = await Promise.allSettled(['one','two'].map(notes => store.save({lessonId:id,expectedRevision:null,patch:{notes}},[id])));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
});
test('unknown IDs, traversal, oversized notes, and invalid status are rejected', async t => {
  const {store} = await fixture(t);
  for (const args of [
    {lessonId:'../outside',patch:{notes:'x'}}, {lessonId:'other-lesson',patch:{notes:'x'}},
    {lessonId:id,patch:{notes:'x'.repeat(50001)}}, {lessonId:id,patch:{status:'published'}}
  ]) await assert.rejects(store.save({...args,expectedRevision:null},[id]),e=>e.status===400);
  assert.deepEqual((await store.snapshot([id])).records,{});
});
test('corrupt saved notes fail safely without replacing the file', async t => {
  const {root,store} = await fixture(t);
  const dir=join(root,'.mission-control','notes'); await mkdir(dir,{recursive:true});
  const path=join(dir,`${id}.json`); await writeFile(path,'broken');
  await assert.rejects(store.save({lessonId:id,expectedRevision:null,patch:{notes:'new'}},[id]),e=>e.status===500);
  assert.equal(await readFile(path,'utf8'),'broken');
});
test('failed private-folder writes do not claim success', async t => {
  const {root} = await fixture(t);
  const file=join(root,'not-a-folder'); await writeFile(file,'existing');
  const store=createNotesStore(file);
  await assert.rejects(store.save({lessonId:id,expectedRevision:null,patch:{notes:'unsaved'}},[id]));
  assert.equal(await readFile(file,'utf8'),'existing');
});
