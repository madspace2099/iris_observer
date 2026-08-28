import type { Metadata } from "next";
import { Overview } from "@/observer-demo/components/Overview";
import { Shell } from "@/observer-demo/components/Shell";
import { flattenParams, selectionFrom } from "@/observer-demo/params";

export const metadata: Metadata = { title: "Overview" };

/**
 * The principal presentation screen.
 *
 * The selection is read HERE, on the server, and passed down. Reading it in a
 * client component with `useSearchParams` needs a Suspense boundary, and the
 * first build of this surface rendered its own skeleton over the real dashboard
 * because the boundary never resolved. Parameters are read where they arrive.
 */
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const selection = selectionFrom(new URLSearchParams(flattenParams(await searchParams)));
  return (
    <Shell
      selection={selection}
      title="Overview"
      subtitle="What buyers are looking at, and where journeys stop"
    >
      <Overview />
    </Shell>
  );
}
