"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthError, forgotPassword } from "@/auth/client";
import { AuthAlert, AuthCard, AuthField, AuthForm, AuthSubmit } from "@/components/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();

  async function submit() {
    setError(undefined);
    setFieldError(undefined);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setFieldError("Enter a valid email address.");
    setBusy(true);
    try {
      await forgotPassword(email);
      setSentTo(email.trim());
    } catch (e) {
      if (e instanceof AuthError && e.field) setFieldError(e.message);
      else setError(e instanceof AuthError ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  const footer = (
    <>
      Remembered it? <Link href="/signin/">Back to sign in</Link>
    </>
  );

  if (sentTo) {
    return (
      <AuthCard title="Check your email" footer={footer}>
        <div className="auth-sent" aria-hidden>
          ✉️
        </div>
        <p className="auth-body">
          If there is an account for <strong>{sentTo}</strong>, a link to choose a new password is on its way. It works for one hour.
        </p>
        <p className="auth-body muted">Nothing after a few minutes? Check spam, or make sure that is the address you signed up with.</p>
        <button type="button" className="auth-submit quiet" onClick={() => setSentTo(undefined)}>
          Try a different email
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Forgot your password?" lead="Enter the email you signed up with and we will send you a link to choose a new one." footer={footer}>
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
          error={fieldError}
          autoFocus
        />
        <AuthSubmit busy={busy}>{busy ? "Sending…" : "Send reset link"}</AuthSubmit>
      </AuthForm>
    </AuthCard>
  );
}
