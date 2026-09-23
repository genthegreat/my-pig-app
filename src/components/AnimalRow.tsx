"use client";

import Link from "next/link";
import type { Animal, Room } from "@/db/schema";
import { STAGE_LABEL } from "@/db/schema";
import { animalLabel, roomLabel } from "@/db/hooks";
import { ageDays, fmtAge } from "@/domain/dates";
import { fmtDate } from "@/domain/format";
import { TagSwatch } from "./tags";

export function AnimalRow({
  animal,
  rooms,
  today,
  trail,
  href,
  onClick,
  selected,
}: {
  animal: Animal;
  rooms: Map<string, Room>;
  today: string;
  trail?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  const a = animal;
  const age = fmtAge(ageDays(a.birth_date ?? a.purchase_date, today));
  const status =
    a.status === "active"
      ? roomLabel(rooms, a.current_room)
      : a.status === "sold"
        ? `Sold ${fmtDate(a.exit_date)}`
        : a.status === "died"
          ? `Died${a.exit_date ? " " + fmtDate(a.exit_date) : ""}`
          : `Culled ${fmtDate(a.exit_date)}`;
  const body = (
    <>
      <TagSwatch colour={a.tag_colour} />
      <div className="body">
        <div className="title">
          {animalLabel(a)}
          {a.name && a.tag_label ? <span className="muted"> · {a.name}</span> : null}
        </div>
        <div className="sub">
          {STAGE_LABEL[a.stage]} · {status} · {age}
        </div>
      </div>
      {trail !== undefined ? <div className="trail">{trail}</div> : null}
      {href ? <span className="chev">›</span> : null}
      {selected !== undefined ? <span style={{ fontSize: 22 }}>{selected ? "☑" : "☐"}</span> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="row">
        {body}
      </Link>
    );
  }
  return (
    <button type="button" className="row" onClick={onClick}>
      {body}
    </button>
  );
}
