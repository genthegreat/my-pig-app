"use client";

// The pieces the sign-in screens are built from. Kept apart from ui.tsx on
// purpose: these screens are public, and must not pull in the farm store.
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { nextPath, whoAmI } from "@/auth/client";

export function AuthCard({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <div className="auth-card">
        <header className="auth-head">
          <h1>{title}</h1>
          {lead && <p>{lead}</p>}
        </header>
        {children}
      </div>
      {footer && <p className="auth-foot">{footer}</p>}
    </>
  );
}

export function AuthForm({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      className="auth-form"
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

export function AuthField({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  inputMode,
  placeholder,
  error,
  hint,
  aside,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  inputMode?: "email" | "text";
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  aside?: ReactNode;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  return (
    <div className={`auth-field ${error ? "invalid" : ""}`}>
      <div className="auth-label">
        <label htmlFor={id}>{label}</label>
        {aside}
      </div>
      <div className="auth-input">
        <input
          id={id}
          type={isPassword && shown ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          inputMode={inputMode}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoCapitalize={type === "text" ? "words" : "none"}
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${id}-note` : undefined}
        />
        {isPassword && (
          <button type="button" className="auth-reveal" onClick={() => setShown((s) => !s)} aria-pressed={shown}>
            {shown ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {error ? (
        <span id={`${id}-note`} className="auth-note error">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-note`} className="auth-note">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function AuthSubmit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button type="submit" className="auth-submit" disabled={busy} aria-busy={busy}>
      {busy && <span className="auth-spinner" aria-hidden />}
      {children}
    </button>
  );
}

export function AuthAlert({ kind = "error", children }: { kind?: "error" | "ok" | "info"; children: ReactNode }) {
  return (
    <div className={`auth-alert ${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

/** Someone already signed in has no business on a sign-in screen: send them on. */
export function useSkipIfSignedIn() {
  useEffect(() => {
    let cancelled = false;
    whoAmI()
      .then((user) => {
        if (user && !cancelled) window.location.replace(nextPath());
      })
      .catch(() => {
        /* offline: stay here */
      });
    return () => {
      cancelled = true;
    };
  }, []);
}

/** Full page load, not a router push: the app's files are only handed out once the cookie is set. */
export function enterApp() {
  window.location.assign(nextPath());
}
