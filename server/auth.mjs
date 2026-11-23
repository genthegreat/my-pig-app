// Accounts, sessions and password resets for My Pigs.
//
// Everything here is plain node: — scrypt for passwords, random tokens for
// sessions and resets (only their SHA-256 is stored), and one JSON file for
// state. A farm has a handful of accounts; a database would be more moving
// parts than the problem has.
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const COOKIE = "mypigs_session";
const DAY = 24 * 60 * 60 * 1000;
const SESSION_TTL = 60 * DAY; // long: the app is used for days with no signal
const SESSION_REFRESH = DAY; // extend a session at most once a day
const RESET_TTL = 60 * 60 * 1000;
const MAX_BODY = 10 * 1024;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

// ── Passwords ───────────────────────────────────────────────────────────────
function scryptAsync(password, salt, opts) {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, 64, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password, stored) {
  const [scheme, N, r, p, salt, hash] = String(stored).split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64url");
  const got = await scryptAsync(password, Buffer.from(salt, "base64url"), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return got.length === want.length && timingSafeEqual(got, want);
}

const sha256 = (s) => createHash("sha256").update(s).digest("base64url");
const newToken = () => randomBytes(32).toString("base64url");

function safeEqual(a, b) {
  const x = createHash("sha256").update(String(a)).digest();
  const y = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(x, y);
}

// ── Validation ──────────────────────────────────────────────────────────────
const normEmail = (v) => (typeof v === "string" ? v.trim().toLowerCase() : "");
const validEmail = (e) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function passwordProblem(pw) {
  if (typeof pw !== "string" || pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters for the password.`;
  if (pw.length > PASSWORD_MAX) return `Keep the password under ${PASSWORD_MAX} characters.`;
  return undefined;
}

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// ── Rate limiting (in memory; resets when the server restarts) ──────────────
function createLimiter(now) {
  const hits = new Map();
  return {
    /** Records an attempt; false when `key` has already used its allowance. */
    take(key, max, windowMs) {
      const t = now();
      const list = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
      if (list.length >= max) {
        hits.set(key, list);
        return false;
      }
      list.push(t);
      hits.set(key, list);
      if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < DAY)) hits.delete(k);
      return true;
    },
    clear(key) {
      hits.delete(key);
    },
  };
}

// ── Store ───────────────────────────────────────────────────────────────────
function createStore(file) {
  let state = { users: [], sessions: [], resets: [] };
  if (file && existsSync(file)) state = { ...state, ...JSON.parse(readFileSync(file, "utf8")) };
  return {
    get state() {
      return state;
    },
    save() {
      if (!file) return; // in-memory, for tests
      mkdirSync(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(state, null, 1), { mode: 0o600 });
      renameSync(tmp, file); // atomic: a crash never leaves half a file
    },
  };
}

/**
 * @param {object} o
 * @param {string} [o.dataFile]   where accounts are kept; omitted = in memory
 * @param {string} [o.signupCode] invite code required to create an account
 * @param {string} [o.appUrl]     public origin, used in reset links
 * @param {boolean} [o.trustProxy] believe X-Forwarded-For / -Proto
 * @param {(m: {to: string, subject: string, text: string, html: string}) => Promise<void>} o.sendMail
 * @param {() => number} [o.now]
 */
export function createAuth({ dataFile, signupCode = "", appUrl = "", trustProxy = false, sendMail, now = Date.now }) {
  const store = createStore(dataFile);
  const limiter = createLimiter(now);
  const s = () => store.state;

  function prune() {
    const t = now();
    s().sessions = s().sessions.filter((x) => x.expires_at > t);
    s().resets = s().resets.filter((x) => x.expires_at > t);
  }

  function signupMode() {
    if (signupCode) return "code";
    return s().users.length === 0 ? "first" : "closed";
  }

  const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });

  function startSession(user) {
    prune();
    const token = newToken();
    const t = now();
    s().sessions.push({ hash: sha256(token), user_id: user.id, created_at: t, refreshed_at: t, expires_at: t + SESSION_TTL });
    store.save();
    return token;
  }

  /** The session and user a token belongs to, or undefined. */
  function lookup(token) {
    if (!token) return undefined;
    const hash = sha256(token);
    const session = s().sessions.find((x) => x.hash === hash);
    if (!session || session.expires_at <= now()) return undefined;
    const user = s().users.find((u) => u.id === session.user_id);
    return user ? { session, user } : undefined;
  }

  // ── Operations (HTTP-free, so they can be tested directly) ────────────────
  async function signUp({ name, email, password, code }, ip = "?") {
    if (!limiter.take(`signup:${ip}`, 10, 60 * 60 * 1000)) throw new HttpError(429, "Too many attempts. Try again in a while.");
    const mode = signupMode();
    if (mode === "closed") throw new HttpError(403, "Sign-up is closed. Ask the farm's owner for an invite.");
    if (mode === "code" && !safeEqual(code ?? "", signupCode)) throw new HttpError(403, "That invite code is not right.", { field: "code" });
    const cleanName = typeof name === "string" ? name.trim().slice(0, 80) : "";
    const cleanEmail = normEmail(email);
    if (!cleanName) throw new HttpError(400, "Enter your name.", { field: "name" });
    if (!validEmail(cleanEmail)) throw new HttpError(400, "Enter a valid email address.", { field: "email" });
    const problem = passwordProblem(password);
    if (problem) throw new HttpError(400, problem, { field: "password" });
    if (s().users.some((u) => u.email === cleanEmail)) {
      throw new HttpError(409, "There is already an account with that email. Sign in instead.", { field: "email" });
    }
    const pass = await hashPassword(password);
    // Re-check after the await: two first sign-ups must not both get in.
    if (signupMode() === "closed") throw new HttpError(403, "Sign-up is closed. Ask the farm's owner for an invite.");
    if (s().users.some((u) => u.email === cleanEmail)) throw new HttpError(409, "There is already an account with that email. Sign in instead.", { field: "email" });
    const user = {
      id: randomBytes(12).toString("base64url"),
      email: cleanEmail,
      name: cleanName,
      pass,
      role: s().users.length === 0 ? "owner" : "member",
      created_at: now(),
    };
    s().users.push(user);
    return { user: publicUser(user), token: startSession(user) };
  }

  async function signIn({ email, password }, ip = "?") {
    const cleanEmail = normEmail(email);
    const okIp = limiter.take(`signin-ip:${ip}`, 60, 15 * 60 * 1000);
    const okEmail = limiter.take(`signin:${cleanEmail}`, 8, 15 * 60 * 1000);
    if (!okIp || !okEmail) throw new HttpError(429, "Too many attempts. Wait 15 minutes, or reset your password.");
    const user = s().users.find((u) => u.email === cleanEmail);
    // Hash even when there is no such account, so timing says nothing.
    const ok = user ? await verifyPassword(String(password ?? ""), user.pass) : (await hashPassword(String(password ?? "")), false);
    if (!ok) throw new HttpError(401, "That email and password do not match.");
    limiter.clear(`signin:${cleanEmail}`);
    return { user: publicUser(user), token: startSession(user) };
  }

  function signOut(token) {
    if (!token) return;
    const hash = sha256(token);
    s().sessions = s().sessions.filter((x) => x.hash !== hash);
    store.save();
  }

  /** Always resolves the same way, whether or not the account exists. */
  async function forgotPassword({ email }, { ip = "?", origin = "" } = {}) {
    const cleanEmail = normEmail(email);
    if (!validEmail(cleanEmail)) throw new HttpError(400, "Enter a valid email address.", { field: "email" });
    const okIp = limiter.take(`forgot-ip:${ip}`, 20, 60 * 60 * 1000);
    const okEmail = limiter.take(`forgot:${cleanEmail}`, 3, 60 * 60 * 1000);
    if (!okIp) throw new HttpError(429, "Too many attempts. Try again in a while.");
    const user = s().users.find((u) => u.email === cleanEmail);
    if (!user || !okEmail) return; // silently: no hint that the account exists
    prune();
    const token = newToken();
    s().resets = s().resets.filter((r) => r.user_id !== user.id); // one live link per account
    s().resets.push({ hash: sha256(token), user_id: user.id, expires_at: now() + RESET_TTL });
    store.save();
    // The token rides in the fragment, so it never reaches a server log or a Referer.
    const link = `${(appUrl || origin).replace(/\/$/, "")}/reset-password/#token=${token}`;
    const text = `Hello ${user.name},\n\nSomeone asked to reset the password for your My Pigs account. Open this link within an hour to choose a new one:\n\n${link}\n\nIf that was not you, ignore this email — your password has not changed.\n`;
    const html = `<p>Hello ${escapeHtml(user.name)},</p><p>Someone asked to reset the password for your My Pigs account. This link works for one hour:</p><p><a href="${link}">Choose a new password</a></p><p>If that was not you, ignore this email — your password has not changed.</p>`;
    // Not awaited: how long the mail takes must not reveal that the account exists.
    Promise.resolve()
      .then(() => sendMail({ to: user.email, subject: "Reset your My Pigs password", text, html, link }))
      .catch((e) => console.error("auth: could not send the reset email:", e?.message ?? e));
  }

  async function resetPassword({ token, password }, ip = "?") {
    if (!limiter.take(`reset-ip:${ip}`, 20, 60 * 60 * 1000)) throw new HttpError(429, "Too many attempts. Try again in a while.");
    const problem = passwordProblem(password);
    if (problem) throw new HttpError(400, problem, { field: "password" });
    prune();
    const hash = sha256(String(token ?? ""));
    const reset = s().resets.find((r) => r.hash === hash);
    const user = reset && s().users.find((u) => u.id === reset.user_id);
    if (!user) throw new HttpError(400, "This reset link has expired or was already used. Ask for a new one.", { code: "bad_token" });
    user.pass = await hashPassword(password);
    s().resets = s().resets.filter((r) => r.user_id !== user.id);
    s().sessions = s().sessions.filter((x) => x.user_id !== user.id); // sign out everywhere
    limiter.clear(`signin:${user.email}`);
    return { user: publicUser(user), token: startSession(user) };
  }

  // ── HTTP ──────────────────────────────────────────────────────────────────
  const isHttps = (req) => (trustProxy && req.headers["x-forwarded-proto"] === "https") || appUrl.startsWith("https://") || !!req.socket?.encrypted;

  function clientIp(req) {
    const fwd = trustProxy ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() : "";
    return fwd || req.socket?.remoteAddress || "?";
  }

  function readToken(req) {
    for (const part of String(req.headers.cookie ?? "").split(";")) {
      const i = part.indexOf("=");
      if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim();
    }
    return undefined;
  }

  function cookie(req, token, maxAgeMs) {
    const parts = [`${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
    if (isHttps(req)) parts.push("Secure");
    return parts.join("; ");
  }

  function send(res, status, body, headers = {}) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
    res.end(JSON.stringify(body));
  }

  async function readJson(req) {
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) throw new HttpError(415, "Send JSON.");
    // A browser always says where a POST came from; it must be this site.
    const origin = req.headers.origin;
    if (origin) {
      const allowed = [req.headers.host, req.headers["x-forwarded-host"]].filter(Boolean).flatMap((h) => [`http://${h}`, `https://${h}`]);
      if (appUrl) allowed.push(new URL(appUrl).origin);
      if (!allowed.includes(origin)) throw new HttpError(403, "Cross-site request refused.");
    }
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw new HttpError(413, "Request too large.");
      chunks.push(chunk);
    }
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      if (body && typeof body === "object" && !Array.isArray(body)) return body;
    } catch {
      /* fall through */
    }
    throw new HttpError(400, "Malformed request.");
  }

  /** The signed-in user for a request, or undefined. */
  function sessionUser(req) {
    return lookup(readToken(req))?.user;
  }

  /** Handles /api/auth/*. Returns false when the path is not ours. */
  async function handle(req, res, pathname) {
    const path = pathname.replace(/\/$/, "");
    if (!path.startsWith("/api/auth")) return false;
    const route = `${req.method} ${path.slice("/api/auth".length)}`;
    const ip = clientIp(req);
    const origin = `${isHttps(req) ? "https" : "http"}://${req.headers.host}`;
    try {
      switch (route) {
        case "GET /config":
          return send(res, 200, { signup: signupMode(), passwordMin: PASSWORD_MIN }), true;
        case "GET /me": {
          const found = lookup(readToken(req));
          if (!found) return send(res, 401, { error: "Not signed in." }), true;
          const headers = {};
          if (now() - found.session.refreshed_at > SESSION_REFRESH) {
            found.session.refreshed_at = now();
            found.session.expires_at = now() + SESSION_TTL;
            store.save();
            headers["Set-Cookie"] = cookie(req, readToken(req), SESSION_TTL);
          }
          return send(res, 200, { user: publicUser(found.user) }, headers), true;
        }
        case "POST /signup": {
          const out = await signUp(await readJson(req), ip);
          return send(res, 201, { user: out.user }, { "Set-Cookie": cookie(req, out.token, SESSION_TTL) }), true;
        }
        case "POST /signin": {
          const out = await signIn(await readJson(req), ip);
          return send(res, 200, { user: out.user }, { "Set-Cookie": cookie(req, out.token, SESSION_TTL) }), true;
        }
        case "POST /signout":
          await readJson(req);
          signOut(readToken(req));
          return send(res, 200, { ok: true }, { "Set-Cookie": cookie(req, "", 0) }), true;
        case "POST /forgot":
          await forgotPassword(await readJson(req), { ip, origin });
          return send(res, 200, { ok: true }), true;
        case "POST /reset": {
          const out = await resetPassword(await readJson(req), ip);
          return send(res, 200, { user: out.user }, { "Set-Cookie": cookie(req, out.token, SESSION_TTL) }), true;
        }
        default:
          return send(res, 404, { error: "Not found." }), true;
      }
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...e.extra }), true;
      console.error("auth:", e);
      return send(res, 500, { error: "Something went wrong on the server." }), true;
    }
  }

  return { handle, sessionUser, signupMode, signUp, signIn, signOut, forgotPassword, resetPassword, lookup };
}

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
