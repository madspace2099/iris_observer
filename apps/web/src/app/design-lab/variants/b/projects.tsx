import type { LabScreenProps } from "../../lab-data";

/** Placeholder. The composition is written by the design pass. */
export function ProjectsB({ estate, screenName, variantName }: LabScreenProps) {
  return (
    <main className="dlb-root">
      <p>
        {screenName} · {variantName} · {estate.accountName}
      </p>
    </main>
  );
}
