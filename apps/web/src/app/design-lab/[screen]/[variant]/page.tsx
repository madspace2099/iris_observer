import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  isScreen,
  isVariant,
  labEstate,
  SCREEN_NAME,
  VARIANT_NAME,
  type LabScreenProps,
  type Screen,
  type Variant,
} from "../../lab-data";
import { SCREENS_A } from "../../variants/a";
import { SCREENS_B } from "../../variants/b";
import { SCREENS_C } from "../../variants/c";

export const metadata: Metadata = { title: "Design lab" };

/**
 * One route for fifteen screens, and the switch is the whole of this file.
 *
 * Everything that decides what is TRUE lives in `lab-data.ts` and is read once;
 * everything that decides how it LOOKS lives in the three variant folders and
 * is not shared. If a branch ever appeared here it would mean the directions
 * differ in what they claim rather than in how they present it, which is not
 * what is being chosen.
 *
 * Every screen takes the same single prop for the same reason. A screen that
 * received only the slice it needs could be given a different slice from its
 * two siblings without anybody noticing.
 */
const REGISTRY: Readonly<
  Record<Variant, Readonly<Record<Screen, (props: LabScreenProps) => React.ReactElement>>>
> = {
  a: SCREENS_A,
  b: SCREENS_B,
  c: SCREENS_C,
};

export default async function DesignLabScreen({
  params,
}: {
  params: Promise<{ screen: string; variant: string }>;
}) {
  const { screen, variant } = await params;
  if (!isScreen(screen) || !isVariant(variant)) notFound();

  const estate = await labEstate();
  const Screen = REGISTRY[variant][screen];

  return (
    <Screen estate={estate} screenName={SCREEN_NAME[screen]} variantName={VARIANT_NAME[variant]} />
  );
}
