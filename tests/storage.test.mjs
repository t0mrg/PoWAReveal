import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';

// Separate module instances model independent tab connections and write queues.
const tabA = await import('../src/storage.js?tab=a');
const tabB = await import('../src/storage.js?tab=b');
const documentRecord = (id, writerId, revision, baseRevision, title) => ({
  id, writerId, revision, baseRevision, updatedAt: Date.now(), deck: { title },
});

test('queued autosaves snapshot callers and preserve the newest revision', async () => {
  const record = documentRecord('ordered', 'A', 0, -1, 'First');
  const first = tabA.saveDocument(record);
  record.revision = 1; record.deck.title = 'Second';
  const second = tabA.saveDocument(record);
  record.revision = 99; record.deck.title = 'Later unsaved edit';
  await Promise.all([first, second]);
  const saved = await tabA.getDocument(record.id);
  assert.equal(saved.revision, 1);
  assert.equal(saved.deck.title, 'Second');
  assert.equal(saved.writerId, 'A');
  assert.equal(Object.hasOwn(saved, 'baseRevision'), false);
});

test('atomic cross-tab compare-and-save prevents silent lost updates', async () => {
  await tabA.saveDocument(documentRecord('shared', 'initial', 0, -1, 'Original'));
  // Both editors loaded revision zero before either one writes.
  const [resultA, resultB] = await Promise.allSettled([
    tabA.saveDocument(documentRecord('shared', 'A', 1, 0, 'Edited in A')),
    tabB.saveDocument(documentRecord('shared', 'B', 1, 0, 'Edited in B')),
  ]);
  const outcomes = [resultA, resultB];
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = outcomes.find(result => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'DOCUMENT_CONFLICT');
  assert.match(rejected.reason.message, /Download your current edits/);
  const current = await tabB.getDocument('shared');
  assert.equal(current.revision, 1);
  assert.equal(current.deck.title, resultA.status === 'fulfilled' ? 'Edited in A' : 'Edited in B');

  // Reopening adopts the current base and allows a deliberate later edit.
  await tabB.saveDocument(documentRecord('shared', 'reopened', 2, current.revision, 'After reopening'));
  assert.equal((await tabA.getDocument('shared')).deck.title, 'After reopening');
});

test('a rejected save does not poison the document queue', async () => {
  await tabA.saveDocument(documentRecord('recover', 'A', 2, -1, 'Current'));
  await assert.rejects(tabB.saveDocument(documentRecord('recover', 'B', 1, 0, 'Stale')), { code: 'DOCUMENT_CONFLICT' });
  await tabB.saveDocument(documentRecord('recover', 'B', 3, 2, 'Recovered'));
  assert.equal((await tabA.getDocument('recover')).deck.title, 'Recovered');
});

test('delete participates in the same queue as prior saves', async () => {
  const saving = tabA.saveDocument(documentRecord('delete-me', 'A', 1, -1, 'Pending save'));
  const deleting = tabA.deleteDocument('delete-me');
  await Promise.all([saving, deleting]);
  assert.equal(await tabA.getDocument('delete-me'), undefined);
});

test('library, settings and themes use completed transactions', async () => {
  await tabA.setSetting('active-document', 'ordered');
  assert.equal(await tabB.getSetting('active-document'), 'ordered');
  const theme = { id: 'theme-1', name: 'Ocean', css: '.sr-slide { color: #123456; }' };
  await tabA.saveTheme(theme);
  assert.deepEqual(await tabB.listThemes(), [theme]);
  await tabB.deleteTheme(theme.id);
  assert.deepEqual(await tabA.listThemes(), []);
  assert((await tabB.listDocuments()).some(record => record.id === 'ordered'));
});
