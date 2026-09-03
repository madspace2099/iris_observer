import type { LabScreenProps } from "../../lab-data";

/** Placeholder. The composition is written by the design pass. */
export function ActivationC({ estate, screenName, variantName }: LabScreenProps) {
  return (
    <main className="dlc-root">
      <p>
        {screenName} · {variantName} · {estate.accountName}
      </p>
    </main>
  );
}
