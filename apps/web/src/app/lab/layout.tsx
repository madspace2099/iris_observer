import "@/lab/lab.css";

/**
 * The design laboratory.
 *
 * Isolated on purpose. Production routes still run the rejected M2.1 card
 * system until a concept is chosen; nothing here is imported by them, and the
 * laboratory stylesheet is loaded only under /lab.
 *
 * See `docs/12-visual-autopsy.md` §5 for the workflow this belongs to.
 */
export default function LabLayout({ children }: { children: React.ReactNode }) {
  return children;
}
