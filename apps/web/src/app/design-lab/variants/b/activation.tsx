import type { LabScreenProps } from "../../lab-data";

/** Placeholder. The composition is written by the design pass. */
export function ActivationB({ estate, screenName, variantName }: LabScreenProps) {
  return (
    <main className="dlb-root">
      <p>
        {screenName} · {variantName} · {estate.accountName}
      </p>
    </main>
  );
}
