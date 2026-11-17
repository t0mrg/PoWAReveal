// One transaction per update, queued per document, so an older autosave cannot
// overwrite a newer one. An unavailable database is reported to the editor.
let database;
let opening;
const queues = new Map();
export async function openStorage() {
  if (database) return database;
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Browser storage is unavailable. Download your presentation before closing.')); return; }
    const request = indexedDB.open('powareveal', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('documents', {keyPath: 'id'});
      db.createObjectStore('themes', {keyPath: 'id'});
      db.createObjectStore('settings');
    };
    request.onsuccess = () => { database = request.result; database.onversionchange = () => { database.close(); database = null; opening = null; }; resolve(database); };
    request.onerror = () => { opening = null; reject(request.error); };
    request.onblocked = () => reject(new Error('Close other PoWAReveal tabs to open browser storage.'));
  });
  return opening;
}
async function transaction(store, mode, operation) {
  const db = await openStorage();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error || request?.error || new Error('Browser storage failed.'));
    tx.onabort = () => reject(tx.error || new Error('Browser storage was interrupted.'));
  });
}
export const listDocuments = () => transaction('documents','readonly',s=>s.getAll());
export const getDocument = id => transaction('documents','readonly',s=>s.get(id));
function enqueue(id, operation) {
  const pending = (queues.get(id) || Promise.resolve()).catch(()=>{}).then(operation);
  queues.set(id, pending);
  pending.finally(()=>{ if (queues.get(id) === pending) queues.delete(id); }).catch(()=>{});
  return pending;
}

async function writeDocument(snapshot) {
  const db = await openStorage();
  return new Promise((resolve, reject) => {
    // Reads and writes occur in the same readwrite transaction. IndexedDB
    // serializes it against writers in other tabs, making the comparison atomic.
    const tx = db.transaction('documents', 'readwrite');
    const store = tx.objectStore('documents');
    const request = store.get(snapshot.id);
    let failure;
    request.onsuccess = () => {
      const existing = request.result;
      const baseRevision = Number.isInteger(snapshot.baseRevision) ? snapshot.baseRevision : -1;
      if (existing && existing.writerId !== snapshot.writerId && existing.revision > baseRevision) {
        failure = new Error('This presentation changed in another tab. Download your current edits, then reopen the browser-library copy to continue.');
        failure.code = 'DOCUMENT_CONFLICT';
        tx.abort();
        return;
      }
      // baseRevision is only a compare-and-save precondition, not document state.
      const stored = { ...snapshot };
      delete stored.baseRevision;
      store.put(stored);
    };
    tx.oncomplete = () => resolve(snapshot.id);
    tx.onerror = () => reject(failure || tx.error || request.error || new Error('Browser storage failed.'));
    tx.onabort = () => reject(failure || tx.error || new Error('Browser storage was interrupted.'));
  });
}
export function saveDocument(record) {
  const snapshot = structuredClone(record);
  return enqueue(snapshot.id, () => writeDocument(snapshot));
}
export function deleteDocument(id) {
  return enqueue(id, () => transaction('documents','readwrite',s=>s.delete(id)));
}
export const listThemes = () => transaction('themes','readonly',s=>s.getAll());
export const saveTheme = theme => transaction('themes','readwrite',s=>s.put(theme));
export const deleteTheme = id => transaction('themes','readwrite',s=>s.delete(id));
export const getSetting = key => transaction('settings','readonly',s=>s.get(key));
export const setSetting = (key,value) => transaction('settings','readwrite',s=>s.put(value,key));
