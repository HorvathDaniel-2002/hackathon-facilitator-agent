import { validateWorkspace } from "./model.mjs";

const DB_NAME = "hackathon-facilitator-browser-v1";
export const CONFLICT = "Another tab changed this workspace. Your draft is still open. Download the unsaved draft before reloading the saved workspace.";
function validateRecord(record) {
  if (record === undefined) return null;
  if (!record || record.schema !== 1 || !Number.isSafeInteger(record.revision) || record.revision < 1) {
    throw new Error("The saved workspace format is not supported. It has not been reset or replaced.");
  }
  validateWorkspace(record.workspace);
  return record;
}
export function openStore() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("This browser does not provide local database storage. Open this page in a current Edge, Chrome, Firefox or Safari browser."));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspace");
    request.onerror = () => reject(new Error("Local storage could not be opened. Check this site's storage permissions or use a normal browser window. No workspace was reset."));
    request.onblocked = () => reject(new Error("Close older tabs of this app, then reload to open local storage."));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve({
        read: () => new Promise((ok, fail) => {
          const tx = db.transaction("workspace", "readonly");
          let record, error;
          const read = tx.objectStore("workspace").get("current");
          read.onsuccess = () => {
            try { record = validateRecord(read.result); } catch (e) { error = e; }
          };
          tx.oncomplete = () => error ? fail(error) : ok(record);
          tx.onabort = () => fail(new Error("The saved workspace could not be read. Reload without clearing site data."));
        }),
        save: (workspace, expectedRevision) => new Promise((ok, fail) => {
          validateWorkspace(workspace);
          const tx = db.transaction("workspace", "readwrite");
          const table = tx.objectStore("workspace");
          let record, error;
          const read = table.get("current");
          read.onsuccess = () => {
            try {
              const current = validateRecord(read.result);
              if ((current?.revision ?? 0) !== expectedRevision) throw new Error(CONFLICT);
              record = { schema: 1, revision: expectedRevision + 1, savedAt: new Date().toISOString(), workspace };
              table.put(record, "current");
            } catch (e) {
              error = e.message === CONFLICT ? e : new Error(`${e.message} No changes were saved. Download this draft before closing the tab.`);
              tx.abort();
            }
          };
          tx.oncomplete = () => ok(record);
          tx.onabort = () => fail(error || new Error("Could not save locally (storage full, unavailable or denied). Your draft is still open; download it before closing this tab."));
        }),
      });
    };
  });
}
