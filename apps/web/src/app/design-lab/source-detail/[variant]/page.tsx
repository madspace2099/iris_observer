import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isVariant, labSource, VARIANT_NAME } from "../../lab-data";
import { VariantA } from "../variant-a";
import { VariantB } from "../variant-b";
import { VariantC } from "../variant-c";

export const metadata: Metadata = { title: "Source detail" };

/**
 * One screen, three compositions, one read.
 *
 * The switch is the whole of this file on purpose. Everything that decides what
 * is true lives in `lab-data.ts` and is shared; everything that decides how it
 * looks lives in the three variant modules and is not. If a variant needed a
 * branch here it would mean the directions differ in what they claim rather
 * than in how they present it, which is not what is being chosen.
 */
export default async function DesignLabSourceDetail({
  params,
}: {
  params: Promise<{ variant: string }>;
}) {
  const { variant } = await params;
  if (!isVariant(variant)) notFound();

  const source = await labSource();

  switch (variant) {
    case "a":
      return <VariantA source={source} name={VARIANT_NAME.a} />;
    case "b":
      return <VariantB source={source} name={VARIANT_NAME.b} />;
    case "c":
      return <VariantC source={source} name={VARIANT_NAME.c} />;
  }
}
