"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOnline } from "./AppShell";

// ── Page chrome ─────────────────────────────────────────────────────────────
export function Page({
  title,
  back,
  right,
  children,
}: {
  title: string;
  back?: string | true;
  right?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const online = useOnline();
  return (
    <>
      <header className="topbar">
        {back && (
          <button
            type="button"
            className="back"
            aria-label="Back"
            onClick={() => (back === true ? router.back() : router.push(back))}
          >
            ‹
          </button>
        )}
        <h1>{title}</h1>
        {right}
        {!online && <span className="offline-pill">Offline</span>}
      </header>
      <main className="page">{children}</main>
    </>
  );
}

export function SectionTitle({ children, action, href }: { children: ReactNode; action?: ReactNode; href?: string }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {href ? <Link href={href}>{action}</Link> : action}
    </div>
  );
}

export function Empty({ ico = "🐖", children }: { ico?: string; children: ReactNode }) {
  return (
    <div className="empty">
      <div className="ico" aria-hidden>
        {ico}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ── Computed figure: shows its inputs on tap ────────────────────────────────
export interface ComputedInput {
  label: string;
  value: string;
}
export function Computed({
  value,
  formula,
  inputs,
  note,
  className,
}: {
  value: ReactNode;
  formula?: string;
  inputs: ComputedInput[];
  note?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={className}>
      <button type="button" className="computed" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className="v">{value}</span>
      </button>
      {open && (
        <div className="computed-panel" id={id}>
          {formula && <div className="formula">{formula}</div>}
          <dl>
            {inputs.map((i) => (
              <Row key={i.label} label={i.label} value={i.value} />
            ))}
          </dl>
          {note && <div className="mt" style={{ marginTop: 6 }}>{note}</div>}
        </div>
      )}
    </span>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

// ── Form fields ─────────────────────────────────────────────────────────────
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <span className="lbl">{label}</span>
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function NumInput({
  value,
  onChange,
  unit,
  placeholder,
  step,
  big,
  min,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  placeholder?: string;
  step?: number | string;
  big?: boolean;
  min?: number;
  autoFocus?: boolean;
}) {
  const input = (
    <input
      className={`input num ${big ? "big" : ""}`}
      inputMode="decimal"
      type="number"
      step={step ?? "any"}
      min={min}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => e.target.select()}
    />
  );
  return unit ? (
    <div className="input-unit">
      {input}
      <span className="unit">{unit}</span>
    </div>
  ) : (
    input
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  type?: string;
}) {
  return (
    <input
      className="input"
      type={type}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input className="input" type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
}

export function TextArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <textarea className="textarea" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: T | "";
  onChange: (v: T | "") => void;
  options: { value: T; label: string }[];
  placeholder?: string;
}) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as T | "")}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Seg<T extends string>({
  value,
  onChange,
  options,
  accent,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  accent?: boolean;
}) {
  return (
    <div className={`seg ${accent ? "accent" : ""}`} role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({
  value,
  onChange,
  options,
  allLabel,
}: {
  value: T | "";
  onChange: (v: T | "") => void;
  options: { value: T; label: string }[];
  allLabel?: string;
}) {
  return (
    <div className="chips">
      {allLabel && (
        <button type="button" className="chip" aria-pressed={value === ""} onClick={() => onChange("")}>
          {allLabel}
        </button>
      )}
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

// ── Bottom sheet ────────────────────────────────────────────────────────────
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Confirm({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  danger,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {body && <div className="muted">{body}</div>}
      <div className="actions">
        <button type="button" className="btn lg" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={`btn lg ${danger ? "danger" : "primary"}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

export function KindBadge({ kind, overdue, children }: { kind: string; overdue?: boolean; children?: ReactNode }) {
  return <span className={`badge ${overdue ? "danger" : `k-${kind}`}`}>{children ?? kind}</span>;
}

/** The sale channel, always as a labelled badge — live and dead weight are not comparable and must never look alike. */
export function ChannelBadge({ channel, size }: { channel: "live" | "dead"; size?: "md" }) {
  return (
    <span className={`chan ${channel} ${size ?? ""}`} aria-label={channel === "dead" ? "priced on dead weight (carcass)" : "priced on live weight"}>
      {channel === "dead" ? "Dead weight" : "Live weight"}
    </span>
  );
}
