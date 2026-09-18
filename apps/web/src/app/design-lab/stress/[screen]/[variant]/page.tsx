import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { localControlPlaneEnabled } from "@/lib/sources/local-db";

import {
  isScreen,
  isVariant,
  SCREEN_NAME,
  VARIANT_NAME,
  type LabScreenProps,
  type Screen,
  type Variant,
} from "../../../lab-data";
import { stressEstate } from "../../../stress-estate";
import { SCREENS_A } from "../../../variants/a";
import { SCREENS_B } from "../../../variants/b";
import { SCREENS_C } from "../../../variants/c";

export const metadata: Metadata = { title: "Design lab — stress" };

/**
 * THE SAME EIGHTEEN SCREENS, HOLDING AN ESTATE FIFTY INSTALLATIONS BIG.
 *
 * A sibling of the review route, and deliberately not a mode of it. The review
 * route performs one real read and is what every founder screenshot comes from;
 * this one renders a fixture and is never captured. Keeping them apart means
 * there is no flag on the review route that could ever be left on, and no
 * chance of a reviewer holding an image of data that does not exist.
 *
 * ## What it is for
 *
 * Four projects and ten sources is the truth today and cannot answer "does this
 * direction still work at fifty". That question is a layout question — does a
 * grouped list still group, does a column still hold a long name, does a phone
 * still stack in the right order — so it is answered by assertions in
 * `design-lab-stress.spec.ts` rather than by more pictures.
 *
 * ## Dev only, like the rest of the lab
 *
 * Behind the same gate: without the local control plane this is a 404. The
 * fixture writes nothing and reads nothing, so the gate is not protecting data
 * here — it is keeping a route that renders invented figures out of anything
 * that is not a developer's own machine.
 */
const REGISTRY: Readonly<
  Record<Variant, Readonly<Record<Screen, (props: LabScreenProps) => React.ReactElement>>>
> = {
  a: SCREENS_A,
  b: SCREENS_B,
  c: SCREENS_C,
};

export default async function DesignLabStressScreen({
  params,
}: {
  params: Promise<{ screen: string; variant: string }>;
}) {
  if (!localControlPlaneEnabled()) notFound();

  const { screen, variant } = await params;
  if (!isScreen(screen) || !isVariant(variant)) notFound();

  const estate = stressEstate(new Date());
  const Screen = REGISTRY[variant][screen];

  return (
    <Screen
      estate={estate}
      screenName={`${SCREEN_NAME[screen]} (stress fixture)`}
      variantName={VARIANT_NAME[variant]}
    />
  );
}
