/**
 * Where owners' photos live.
 *
 * Not localStorage: a phone photo is a few hundred kilobytes even after it is
 * downscaled, localStorage holds about five megabytes for the whole site, and
 * everything else in this module is already stored there. A dozen photo
 * posters would fill it, and the thirteenth save would fail. IndexedDB stores
 * blobs natively and has room for hundreds.
 *
 * A design never holds the photo itself. It holds an `idb:<id>` reference,
 * and the image loader resolves that scheme - the same seam a generated
 * background will use when it arrives with an https URL instead.
 *
 * When IndexedDB is unavailable (some private modes, or site data blocked) the
 * photos are kept in memory for the session. The poster still renders and
 * downloads; it just will not have its photo after a reload, which the
 * library already warns about in that situation.
 */

const DB_NAME = "oneinfo-posters";
const STORE = "photos";
const PREFIX = "idb:";

const memory = new Map<string, Blob>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

export function isStoredPhoto(src: string | null | undefined): src is string {
  return typeof src === "string" && src.startsWith(PREFIX);
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      // Refused or broken: fall back to memory rather than failing the poster.
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Photo storage failed."));
  });
}

/** Stores a photo and hands back the reference a design should carry. */
export async function putPhoto(blob: Blob): Promise<string> {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ref = `${PREFIX}${id}`;

  const db = await openDb();
  if (!db) {
    memory.set(ref, blob);
    return ref;
  }
  try {
    await run(db, "readwrite", (store) => store.put(blob, ref));
  } catch {
    memory.set(ref, blob);
  }
  return ref;
}

export async function getPhoto(ref: string): Promise<Blob | null> {
  const remembered = memory.get(ref);
  if (remembered) return remembered;

  const db = await openDb();
  if (!db) return null;
  try {
    const found = await run<Blob | undefined>(db, "readonly", (store) => store.get(ref));
    return found ?? null;
  } catch {
    return null;
  }
}

export async function deletePhoto(ref: string): Promise<void> {
  memory.delete(ref);
  const db = await openDb();
  if (!db) return;
  try {
    await run(db, "readwrite", (store) => store.delete(ref));
  } catch {
    /* an orphaned photo costs a little space; failing a delete over it costs more */
  }
}
