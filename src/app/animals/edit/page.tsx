"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AnimalForm } from "@/components/AnimalForm";
import { Page } from "@/components/ui";
import { animalLabel, useAnimal } from "@/db/hooks";

export default function EditAnimalPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const id = useSearchParams().get("id");
  const animal = useAnimal(id);
  if (!animal) return <Page title="…" back={true}>{null}</Page>;
  return (
    <Page title={`Edit ${animalLabel(animal)}`} back={true}>
      <AnimalForm key={animal.id} existing={animal} />
    </Page>
  );
}
