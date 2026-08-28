import type { Metadata } from "next";
import { Shell } from "@/observer-demo/components/Shell";
import { Units } from "@/observer-demo/components/Units";
import { flattenParams, selectionFrom } from "@/observer-demo/params";

export const metadata: Metadata = { title: "Units" };

export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const selection = selectionFrom(new URLSearchParams(flattenParams(await searchParams)));
  return (
    <Shell
      selection={selection}
      title="Units"
      subtitle="Which apartments are drawing attention, and which are not"
    >
      <Units />
    </Shell>
  );
}
