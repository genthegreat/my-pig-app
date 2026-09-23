"use client";

import Link from "next/link";
import { useOpenFlagCount } from "@/db/hooks";
import { Page } from "@/components/ui";

const ITEMS = [
  { href: "/breeding/", ico: "🐷", title: "Breeding", sub: "Services, farrowings, litters" },
  { href: "/offer/", ico: "💰", title: "Offer calculator", sub: "Kwacha per kilo — take it or hold?" },
  { href: "/sales/", ico: "🤝", title: "Sales & clients", sub: "Live-equivalent on every dead sale" },
  { href: "/costs/", ico: "🧾", title: "Money", sub: "Costs by month, cost per pig per day" },
  { href: "/cashflow/", ico: "📈", title: "Cash flow", sub: "In against out, by month; the next 30 days" },
  { href: "/feed/", ico: "🌽", title: "Feed", sub: "Rations, bag sizes, stock, purchases" },
  { href: "/schedule/", ico: "🗓️", title: "Pay & feed schedule", sub: "Paydays, buying rhythm, the 30-day cash plan" },
  { href: "/pay/", ico: "👷", title: "Pay", sub: "Wages, advances, history" },
  { href: "/equipment/", ico: "🧰", title: "Equipment", sub: "What the farm owns, condition, repairs" },
  { href: "/rooms/", ico: "🚪", title: "Rooms", sub: "Who stands where" },
  { href: "/health/protocols/", ico: "💉", title: "Health protocols", sub: "Rules that fill the calendar" },
  { href: "/flags/", ico: "⚠️", title: "Flags", sub: "Records that don't reconcile", flag: true },
  { href: "/settings/", ico: "⚙️", title: "Settings", sub: "Every constant, and where it came from" },
];

export default function MorePage() {
  const flags = useOpenFlagCount();
  return (
    <Page title="More">
      <div className="card tight">
        <div className="list">
          {ITEMS.map((i) => (
            <Link key={i.href} href={i.href} className="row">
              <span style={{ fontSize: 24, width: 32, textAlign: "center" }} aria-hidden>
                {i.ico}
              </span>
              <div className="body">
                <div className="title">
                  {i.title}
                  {i.flag && flags > 0 ? <span className="badge warn" style={{ marginLeft: 8 }}>{flags}</span> : null}
                </div>
                <div className="sub">{i.sub}</div>
              </div>
              <span className="chev">›</span>
            </Link>
          ))}
        </div>
      </div>
      <p className="tiny faint center">My Pigs · works with no signal</p>
    </Page>
  );
}
