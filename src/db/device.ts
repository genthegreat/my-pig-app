// Device identity and id generation.
//
// crypto.randomUUID() only exists in secure contexts. A phone on a home LAN
// may well open this app over plain http, so ids are built from
// getRandomValues, which works everywhere.

const DEVICE_KEY = "my-pigs.device_id";
let cachedDeviceId: string | undefined;

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Short random id, safe for IndexedDB keys and URLs. */
export function uid(prefix?: string): string {
  const core = randomHex(8);
  return prefix ? `${prefix}-${core}` : core;
}

export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  let id: string | null = null;
  try {
    id = typeof localStorage !== "undefined" ? localStorage.getItem(DEVICE_KEY) : null;
  } catch {
    id = null;
  }
  if (!id) {
    id = `dev-${randomHex(6)}`;
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(DEVICE_KEY, id);
    } catch {
      // private mode or blocked storage — the id still lives for this session
    }
  }
  cachedDeviceId = id;
  return id;
}

/** Test hook: pin the device id so fixtures are deterministic. */
export function setDeviceIdForTests(id: string) {
  cachedDeviceId = id;
}
