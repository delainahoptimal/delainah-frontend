import { Suspense } from "react";
import ConsoleApp from "@/components/console-app";

export default function Page() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">Loading workspace</main>}><ConsoleApp /></Suspense>;
}