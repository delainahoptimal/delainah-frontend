export type OfflineKind = "service-request" | "field-report";
export type OfflineEntry = {
  device_reference: string;
  kind: OfflineKind;
  created_at: string;
  payload: Record<string, unknown>;
  conflict?: unknown;
};

type CipherRecord = { device_reference: string; iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer };
const DATABASE = "delainah-field-queue";
const VERSION = 1;
const KEY_ID = "queue-key";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("keys")) database.createObjectStore("keys");
      if (!database.objectStoreNames.contains("queue")) database.createObjectStore("queue", { keyPath: "device_reference" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open encrypted offline storage."));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage operation failed."));
  });
}

async function encryptionKey(database: IDBDatabase) {
  const existing = await requestResult<CryptoKey | undefined>(database.transaction("keys", "readonly").objectStore("keys").get(KEY_ID));
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await requestResult(database.transaction("keys", "readwrite").objectStore("keys").put(key, KEY_ID));
  return key;
}

export async function storeOfflineEntry(entry: OfflineEntry) {
  const database = await openDatabase();
  try {
    const key = await encryptionKey(database);
    const iv = new Uint8Array(new ArrayBuffer(12));
    crypto.getRandomValues(iv);
    const cleartext = new TextEncoder().encode(JSON.stringify(entry));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, cleartext);
    const record: CipherRecord = { device_reference: entry.device_reference, iv, ciphertext };
    await requestResult(database.transaction("queue", "readwrite").objectStore("queue").put(record));
  } finally { database.close(); }
}

export async function readOfflineEntries(): Promise<OfflineEntry[]> {
  const database = await openDatabase();
  try {
    const key = await encryptionKey(database);
    const records = await requestResult<CipherRecord[]>(database.transaction("queue", "readonly").objectStore("queue").getAll());
    const entries = await Promise.all(records.map(async (record) => {
      const cleartext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: record.iv }, key, record.ciphertext);
      return JSON.parse(new TextDecoder().decode(cleartext)) as OfflineEntry;
    }));
    return entries.sort((left, right) => left.created_at.localeCompare(right.created_at));
  } finally { database.close(); }
}

export async function removeOfflineEntry(deviceReference: string) {
  const database = await openDatabase();
  try { await requestResult(database.transaction("queue", "readwrite").objectStore("queue").delete(deviceReference)); }
  finally { database.close(); }
}