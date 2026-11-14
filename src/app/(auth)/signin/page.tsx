"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthError, signIn } from "@/auth/client";
import { AuthAlert, AuthCard, AuthField, AuthForm, AuthSubmit, enterApp, useSkipIfSignedIn } from "@/components/auth";

export default function SignInPage() {
  useSkipIfSignedIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<{ email?: string; password?: string }>({});

  async function submit() {
    const f: typeof fields = {};
    if (!email.trim()) f.email = "Enter your email.";
    if (!password) f.password = "Enter your password.";
    setFields(f);
    setError(undefined);
    if (f.email || f.password) return;
    setBusy(true);
    try {
      await signIn(email, password);
      enterApp();
    } catch (e) {
      setError(e instanceof AuthError ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      lead="Sign in to open the farm."
      footer={
        <>
          New here? <Link href="/signup/">Create an account</Link>
        </>
      }
    >
      <AuthForm onSubmit={submit}>
        {error && <AuthAlert>{error}</AuthAlert>}
        <AuthField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder="you@example.com"
          value={email}
          onChange={setEmail}
          error={fields.email}
          autoFocus
        />
        <AuthField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          error={fields.password}
          aside={<Link href="/forgot-password/">Forgot password?</Link>}
        />
        <AuthSubmit busy={busy}>{busy ? "Signing in…" : "Sign in"}</AuthSubmit>
      </AuthForm>
    </AuthCard>
  );
}
