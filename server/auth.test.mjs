import { describe, expect, it } from "vitest";
import { createAuth, hashPassword, verifyPassword } from "./auth.mjs";

function setup(opts = {}) {
  const mail = [];
  const clock = { t: 1_700_000_000_000 };
  const auth = createAuth({
    appUrl: "https://pigs.example.com",
    sendMail: async (m) => void mail.push(m),
    now: () => clock.t,
    ...opts,
  });
  return { auth, mail, clock };
}
const owner = { name: "Mutale", email: "Mutale@Example.com ", password: "maize-bran-25kg" };
const status = (n) => expect.objectContaining({ status: n });
const tokenOf = (m) => m.link.split("#token=")[1];
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("passwords", () => {
  it("verifies the right password and only that", async () => {
    const h = await hashPassword("correct horse");
    expect(h).not.toContain("correct horse");
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("correct horsE", h)).toBe(false);
  });
});

describe("sign-up", () => {
  it("lets the first account in as owner, then closes", async () => {
    const { auth } = setup();
    expect(auth.signupMode()).toBe("first");
    const { user, token } = await auth.signUp(owner);
    expect(user.email).toBe("mutale@example.com");
    expect(auth.lookup(token).user.role).toBe("owner");
    expect(auth.signupMode()).toBe("closed");
    await expect(auth.signUp({ name: "X", email: "x@example.com", password: "long enough pw" })).rejects.toEqual(status(403));
  });

  it("with an invite code, needs the code every time", async () => {
    const { auth } = setup({ signupCode: "sow-114" });
    await expect(auth.signUp(owner)).rejects.toEqual(status(403));
    await auth.signUp({ ...owner, code: "sow-114" });
    await expect(auth.signUp({ ...owner, code: "sow-114" })).rejects.toEqual(status(409));
    const second = await auth.signUp({ name: "Worker", email: "w@example.com", password: "long enough pw", code: "sow-114" });
    expect(auth.lookup(second.token).user.role).toBe("member");
  });

  it("refuses a short password and a bad email", async () => {
    const { auth } = setup();
    await expect(auth.signUp({ ...owner, password: "short" })).rejects.toEqual(status(400));
    await expect(auth.signUp({ ...owner, email: "not-an-email" })).rejects.toEqual(status(400));
    expect(auth.signupMode()).toBe("first");
  });
});

describe("sign-in and sessions", () => {
  it("signs in, expires after 60 days, and signs out", async () => {
    const { auth, clock } = setup();
    await auth.signUp(owner);
    const { token } = await auth.signIn({ email: "MUTALE@example.com", password: owner.password });
    expect(auth.lookup(token).user.name).toBe("Mutale");
    auth.signOut(token);
    expect(auth.lookup(token)).toBeUndefined();

    const again = await auth.signIn({ email: owner.email, password: owner.password });
    clock.t += 61 * 24 * 60 * 60 * 1000;
    expect(auth.lookup(again.token)).toBeUndefined();
  });

  it("says the same thing for a wrong password and an unknown account", async () => {
    const { auth } = setup();
    await auth.signUp(owner);
    const wrong = await auth.signIn({ email: owner.email, password: "nope nope nope" }).catch((e) => e);
    const unknown = await auth.signIn({ email: "nobody@example.com", password: "nope nope nope" }).catch((e) => e);
    expect(wrong.status).toBe(401);
    expect(unknown.message).toBe(wrong.message);
  });

  it("locks an email after 8 tries in 15 minutes, then lets it back", async () => {
    const { auth, clock } = setup();
    await auth.signUp(owner);
    for (let i = 0; i < 8; i++) await auth.signIn({ email: owner.email, password: "wrong wrong" }).catch(() => {});
    await expect(auth.signIn({ email: owner.email, password: owner.password })).rejects.toEqual(status(429));
    clock.t += 16 * 60 * 1000;
    await expect(auth.signIn({ email: owner.email, password: owner.password })).resolves.toBeTruthy();
  });
});

describe("password reset", () => {
  it("mails a one-use link that changes the password and ends other sessions", async () => {
    const { auth, mail } = setup();
    const before = await auth.signUp(owner);
    await auth.forgotPassword({ email: owner.email });
    await flush();
    expect(mail).toHaveLength(1);
    expect(mail[0].to).toBe("mutale@example.com");
    expect(mail[0].link).toMatch(/^https:\/\/pigs\.example\.com\/reset-password\/#token=/);

    const after = await auth.resetPassword({ token: tokenOf(mail[0]), password: "a brand new one" });
    expect(auth.lookup(before.token)).toBeUndefined();
    expect(auth.lookup(after.token)).toBeTruthy();
    await expect(auth.resetPassword({ token: tokenOf(mail[0]), password: "and another one" })).rejects.toEqual(status(400));
    await expect(auth.signIn({ email: owner.email, password: owner.password })).rejects.toEqual(status(401));
    await expect(auth.signIn({ email: owner.email, password: "a brand new one" })).resolves.toBeTruthy();
  });

  it("expires the link after an hour, and a newer link replaces an older one", async () => {
    const { auth, mail, clock } = setup();
    await auth.signUp(owner);
    await auth.forgotPassword({ email: owner.email });
    await auth.forgotPassword({ email: owner.email });
    await flush();
    await expect(auth.resetPassword({ token: tokenOf(mail[0]), password: "a brand new one" })).rejects.toEqual(status(400));
    clock.t += 61 * 60 * 1000;
    await expect(auth.resetPassword({ token: tokenOf(mail[1]), password: "a brand new one" })).rejects.toEqual(status(400));
  });

  it("gives nothing away about an unknown email, and sends nothing", async () => {
    const { auth, mail } = setup();
    await auth.signUp(owner);
    await expect(auth.forgotPassword({ email: "nobody@example.com" })).resolves.toBeUndefined();
    await flush();
    expect(mail).toHaveLength(0);
  });
});
