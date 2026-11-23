"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthError, getConfig, signUp, type SignupMode } from "@/auth/client";
import { AuthAlert, AuthCard, AuthField, AuthForm, AuthSubmit, enterApp, useSkipIfSignedIn } from "@/components/auth";

type Fields = { name?: string; email?: string; password?: string; code?: string };

export default function SignUpPage() {
  useSkipIfSignedIn();
  const [mode, setMode] = useState<SignupMode>();
  const [min, setMin] = useState(8);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Fields>({});

  useEffect(() => {
    getConfig()
      .then((c) => {
        setMode(c.signup);
        setMin(c.passwordMin);
      })
      .catch(() => {
        /* offline: show the form; submitting will say so */
      });
  }, []);

  async function submit() {
    const f: Fields = {};
    if (!name.trim()) f.name = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) f.email = "Enter a valid email address.";
    if (password.length < min) f.password = `Use at least ${min} characters.`;
    if (mode === "code" && !code.trim()) f.code = "Enter the invite code you were given.";
    setFields(f);
    setError(undefined);
    if (Object.keys(f).length) return;
    setBusy(true);
    try {
      await signUp({ name, email, password, code: code.trim() || undefined });
      enterApp();
    } catch (e) {
      if (e instanceof AuthError && e.field) setFields({ [e.field]: e.message });
      else setError(e instanceof AuthError ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const footer = (
    <>
      Already have an account? <Link href="/signin/">Sign in</Link>
    </>
  );

  if (mode === "closed") {
    return (
      <AuthCard title="Sign-up is closed" lead="This farm already has its owner, and new accounts are by invite only." footer={footer}>
        <AuthAlert kind="info">Ask the farm&rsquo;s owner for an invite, then come back to this page.</AuthAlert>
        <Link href="/signin/" className="auth-submit">
          Go to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      lead={mode === "first" ? "You are the first one here — this account will own the farm." : "Set up your sign-in for the farm."}
      footer={footer}
    >
      <AuthForm onSubmit={submit}>
        {error && <AuthAlert>{error}</AuthAlert>}
        <AuthField label="Your name" autoComplete="name" value={name} onChange={setName} error={fields.name} autoFocus />
        <AuthField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder="you@example.com"
          value={email}
          onChange={setEmail}
          error={fields.email}
        />
        <AuthField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={fields.password}
          hint={`At least ${min} characters. A few words strung together works well.`}
        />
        {mode === "code" && (
          <AuthField
            label="Invite code"
            autoComplete="off"
            value={code}
            onChange={setCode}
            error={fields.code}
            hint="From whoever runs this farm's server."
          />
        )}
        <AuthSubmit busy={busy}>{busy ? "Creating account…" : "Create account"}</AuthSubmit>
      </AuthForm>
    </AuthCard>
  );
}
