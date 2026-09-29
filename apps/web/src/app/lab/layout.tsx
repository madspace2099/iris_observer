import "@observer/ui/iris.css";

import { labGate } from "./gate";

/**
 * The design laboratory.
 *
 * The two Executive Overview concepts, kept as working drawings. Their
 * stylesheet has since been promoted to `@observer/ui/iris.css` and is what the
 * product now runs on, so the lab and production can no longer drift apart.
 *
 * See `docs/12-visual-autopsy.md` §5 and `docs/15-visual-concepts.md`.
 *
 * Development only, behind the gate in `./gate.ts`.
 */
export default async function LabLayout({ children }: { children: React.ReactNode }) {
  await labGate();
  return children;
}
