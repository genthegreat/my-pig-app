"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AnimalForm } from "@/components/AnimalForm";
import { Page } from "@/components/ui";
import type { Stage } from "@/db/schema";

export default function NewAnimalPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const p = useSearchParams();
  const defaults = {
    current_room: p.get("room") ?? undefined,
    stage: (p.get("stage") as Stage) ?? undefined,
    litter_id: p.get("litter") ?? undefined,
  };
  return (
    <Page title="New pig" back={true}>
      <AnimalForm defaults={defaults} />
    </Page>
  );
}
