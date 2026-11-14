"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthError, resetPassword } from "@/auth/client";
import { AuthAlert, AuthCard, AuthField, AuthForm, AuthSubmit } from "@/components/auth";

const MIN = 8;

export default function ResetPasswordPage() {
  // undefined = not read yet, "" = the link carries no token
  const [token, setToken] = useState<string>();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<{ password?: string; again?: string }>({});
  const [dead, setDead] = useState(false);

  useEffect(() => {
    // The token arrives in the fragment so it is never sent to a server by
    // the link itself; take it off the address bar once read.
    const t = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    setToken(t);
    if (t) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function submit() {
    const f: typeof fields = {};
    if (password.length < MIN) f.password = `Use at least ${MIN} characters.`;
    else if (password !== again) f.again = "The two passwords do not match.";
    setFields(f);
    setError(undefined);
    if (f.password || f.again) return;
    setBusy(true);
    try {
      await resetPassword(token ?? "", password);
      window.location.assign("/");
    } catch (e) {
      if (e instanceof AuthError && e.code === "bad_token") setDead(true);
      else if (e instanceof AuthError && e.field === "password") setFields({ password: e.message });
      else setError(e instanceof AuthError ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const footer = (
    <>
      <Link href="/signin/">Back to sign in</Link>
    </>
  );

  if (token === undefined) return <AuthCard title="Choose a new password">{null}</AuthCard>;

  if (token === "" || dead) {
    return (
      <AuthCard title="This link no longer works" lead="Reset links last one hour and can be used once." footer={footer}>
        <Link href="/forgot-password/" className="auth-submit">
          Send a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" lead="You will be signed out on every other device." footer={footer}>
      <AuthForm onSubmit={submit}>
        {error && <AuthAlert>{error}</AuthAlert>}
        <AuthField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={fields.password}
          hint={`At least ${MIN} characters.`}
          autoFocus
        />
        <AuthField label="Type it again" type="password" autoComplete="new-password" value={again} onChange={setAgain} error={fields.again} />
        <AuthSubmit busy={busy}>{busy ? "Saving…" : "Save and sign in"}</AuthSubmit>
      </AuthForm>
    </AuthCard>
  );
}
