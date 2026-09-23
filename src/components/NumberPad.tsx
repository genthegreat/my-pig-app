"use client";

import { useCallback, useEffect } from "react";

/**
 * A number pad for weights. Big keys, one decimal, no scrolling. `onEnter`
 * fires with the parsed number; the parent persists it immediately.
 */
export function NumberPad({
  value,
  onChange,
  onEnter,
  unit = "kg",
  enterLabel = "Next",
  maxDecimals = 1,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: (n: number) => void;
  unit?: string;
  enterLabel?: string;
  maxDecimals?: number;
}) {
  const press = useCallback(
    (k: string) => {
      if (k === "⌫") return onChange(value.slice(0, -1));
      if (k === ".") {
        if (maxDecimals === 0 || value.includes(".")) return;
        return onChange(value === "" ? "0." : value + ".");
      }
      const next = value + k;
      const [, frac] = next.split(".");
      if (frac && frac.length > maxDecimals) return;
      if (next.replace(".", "").length > 6) return;
      onChange(next);
    },
    [value, onChange, maxDecimals],
  );

  const submit = useCallback(() => {
    const n = Number(value);
    if (!value || Number.isNaN(n) || n <= 0) return;
    onEnter(n);
  }, [value, onEnter]);

  // Hardware / bluetooth keyboards and desktop testing.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (/^[0-9]$/.test(e.key) || e.key === ".") press(e.key);
      else if (e.key === "Backspace") press("⌫");
      else if (e.key === "Enter") submit();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [press, submit]);

  return (
    <div className="stack-sm">
      <div className={`numpad-display ${value ? "" : "empty"}`} aria-live="polite">
        <span>{value || "0"}</span>
        <span className="unit">{unit}</span>
      </div>
      <div className="numpad">
        {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((k) => (
          <button key={k} type="button" onClick={() => press(k)}>
            {k}
          </button>
        ))}
        <button type="button" className="fn" onClick={() => press(".")} disabled={maxDecimals === 0}>
          .
        </button>
        <button type="button" onClick={() => press("0")}>
          0
        </button>
        <button type="button" className="fn" aria-label="Delete" onClick={() => press("⌫")}>
          ⌫
        </button>
        <button type="button" className="go" style={{ gridColumn: "1 / -1" }} onClick={submit} disabled={!value || Number(value) <= 0}>
          {enterLabel}
        </button>
      </div>
    </div>
  );
}
