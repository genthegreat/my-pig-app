"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { db } from "@/db/db";
import { seedDatabase } from "@/db/seed";
import { regenerateCalendar } from "@/db/calendar";
import { getDeviceId } from "@/db/device";

// ── Toasts ──────────────────────────────────────────────────────────────────
interface ToastCtx {
  toast: (msg: string, kind?: "ok" | "error") => void;
}
const ToastContext = createContext<ToastCtx>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

// ── Online state ────────────────────────────────────────────────────────────
const OnlineContext = createContext<boolean>(true);
export const useOnline = () => useContext(OnlineContext);

// ── Update-available (service worker) ───────────────────────────────────────
function useServiceWorker(toast: ToastCtx["toast"]) {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // `next dev` on an origin that once served the built app: a stale
      // worker would keep serving the old export. Drop it.
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      return;
    }
    let reloading = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              toast("Update ready — reopen the app to use it");
            }
          });
        });
      })
      .catch(() => {
        /* no SW on http:// LAN hosts — the app still runs, just not offline */
      });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
    });
  }, [toast]);
}

// ── Shell ───────────────────────────────────────────────────────────────────
export function AppShell({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "error"; id: number }>();
  const [online, setOnline] = useState(true);

  const toast = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    setMsg({ text, kind, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(undefined), kindDuration(msg.kind));
    return () => clearTimeout(t);
  }, [msg]);

  useServiceWorker(toast);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        getDeviceId();
        await db.open();
        await seedDatabase();
        await regenerateCalendar();
        if (!cancelled) setReady(true);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ctx = useMemo(() => ({ toast }), [toast]);

  if (error) {
    return (
      <div className="splash">
        <div className="logo">🐖</div>
        <h1>Could not open the farm store</h1>
        <p className="muted center" style={{ maxWidth: 360 }}>
          {error}. This usually means the browser is in private mode or storage is blocked.
        </p>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="splash">
        <div className="logo">🐖</div>
        <p>Loading the farm…</p>
      </div>
    );
  }

  return (
    <OnlineContext.Provider value={online}>
      <ToastContext.Provider value={ctx}>
        <div className="app">{children}</div>
        <BottomNav />
        {msg && (
          <div className={`toast ${msg.kind === "error" ? "error" : ""}`} role="status">
            {msg.text}
          </div>
        )}
      </ToastContext.Provider>
    </OnlineContext.Provider>
  );
}

function kindDuration(kind: "ok" | "error") {
  return kind === "error" ? 5000 : 2600;
}

const NAV = [
  { href: "/", label: "Home", ico: "🏠", match: (p: string) => p === "/" },
  { href: "/animals/", label: "Pigs", ico: "🐖", match: (p: string) => p.startsWith("/animals") || p.startsWith("/rooms") },
  { href: "/weigh/", label: "Weigh", ico: "⚖️", match: (p: string) => p.startsWith("/weigh"), primary: true },
  { href: "/calendar/", label: "Calendar", ico: "📅", match: (p: string) => p.startsWith("/calendar") },
  { href: "/more/", label: "More", ico: "☰", match: (p: string) => ["/more", "/costs", "/feed", "/sales", "/breeding", "/flags", "/settings", "/offer", "/clients", "/health", "/schedule", "/pay", "/equipment", "/cashflow"].some((x) => p.startsWith(x)) },
];

function BottomNav() {
  const path = usePathname() ?? "/";
  return (
    <nav className="bottomnav" aria-label="Main">
      <div className="inner">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`${n.match(path) ? "active" : ""} ${n.primary ? "primary" : ""}`}>
            <span className="ico" aria-hidden>
              {n.ico}
            </span>
            {n.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
