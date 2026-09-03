import type { LabScreenProps } from "../../lab-data";

/** Placeholder. The composition is written by the design pass. */
export function ActivationA({ estate, screenName, variantName }: LabScreenProps) {
  return (
    <main className="dla-root">
      <p>
        {screenName} · {variantName} · {estate.accountName}
      </p>
    </main>
  );
}
