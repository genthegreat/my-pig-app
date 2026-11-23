import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

// Every screen of the farm itself. AppShell checks the sign-in, opens the
// store and draws the navigation; the public screens live in (auth).
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
