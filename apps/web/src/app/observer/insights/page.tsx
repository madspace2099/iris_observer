import type { Metadata } from "next";
import { Insights } from "@/observer-demo/components/Insights";
import { Shell } from "@/observer-demo/components/Shell";
import { flattenParams, selectionFrom } from "@/observer-demo/params";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const selection = selectionFrom(new URLSearchParams(flattenParams(await searchParams)));
  return (
    <Shell
      selection={selection}
      title="Insights"
      subtitle="Findings, and exactly how strongly each one is evidenced"
    >
      <Insights />
    </Shell>
  );
}
