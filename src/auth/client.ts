// The browser's side of signing in. The session itself is an HttpOnly cookie
// the page cannot read; what is kept here is only a note of who is signed in,
// so the app can open with no signal. The server decides what is really
// allowed — it will not hand the app's files to anyone without the cookie.
//
// Nothing in this file may import from @/db or @/seed: the sign-in screens
// load it, and they are public.

export interface Account {
  id: string;
  email: string;
  name: string;
}

const KEY = "mypigs.account";

export function savedAccount(): Account | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Account) : undefined;
  } catch {
    return undefined;
  }
}

export function saveAccount(a: Account | undefined) {
  try {
    if (a) localStorage.setItem(KEY, JSON.stringify(a));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked — the cookie still works */
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
    public field?: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** status 0 = the server could not be reached at all. */
async function call<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/auth/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new AuthError("No connection. You need signal for this — try again when you have it.", 0);
  }
  let data: { error?: string; field?: string; code?: string } = {};
  try {
    data = await res.json();
  } catch {
    /* not JSON: a proxy error page, or the service worker's offline answer */
  }
  if (!res.ok) {
    if (!data.error && res.status >= 500) throw new AuthError("The server is not answering. Try again in a moment.", 0);
    throw new AuthError(data.error ?? "Something went wrong.", res.status, data.field, data.code);
  }
  return data as T;
}

export type SignupMode = "first" | "code" | "closed";

export const getConfig = () => call<{ signup: SignupMode; passwordMin: number }>("config");

/** The signed-in account according to the server; undefined when signed out. Throws AuthError(0) when unreachable. */
export async function whoAmI(): Promise<Account | undefined> {
  try {
    const { user } = await call<{ user: Account }>("me");
    saveAccount(user);
    return user;
  } catch (e) {
    if (e instanceof AuthError && e.status === 401) {
      saveAccount(undefined);
      return undefined;
    }
    throw e;
  }
}

async function entering(path: string, body: unknown): Promise<Account> {
  const { user } = await call<{ user: Account }>(path, body);
  saveAccount(user);
  return user;
}

export const signIn = (email: string, password: string) => entering("signin", { email, password });
export const signUp = (v: { name: string; email: string; password: string; code?: string }) => entering("signup", v);
export const resetPassword = (token: string, password: string) => entering("reset", { token, password });
export const forgotPassword = (email: string) => call<{ ok: true }>("forgot", { email });

/**
 * Ends the session on the server, then removes the app's cached files from
 * this device so they have to be fetched — and so authorised — again. The
 * farm's records stay in this browser's storage: they exist nowhere else.
 */
export async function signOut(): Promise<void> {
  await call("signout", {});
  saveAccount(undefined);
  try {
    if ("serviceWorker" in navigator) {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    }
    if ("caches" in window) {
      for (const k of await caches.keys()) if (k.startsWith("my-pigs-")) await caches.delete(k);
    }
  } catch {
    /* best effort */
  }
}

/** Where to go after signing in: only ever a path on this site. */
export function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next") ?? "/";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export function signInUrl(): string {
  const here = window.location.pathname + window.location.search;
  return here === "/" ? "/signin/" : `/signin/?next=${encodeURIComponent(here)}`;
}
