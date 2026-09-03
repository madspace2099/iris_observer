import type { LabScreenProps, Screen } from "../../lab-data";
import { ProjectsA } from "./projects";
import { ProjectDetailA } from "./project-detail";
import { SourceDetailA } from "./source-detail";
import { ActivationA } from "./activation";
import { DiagnosticsA } from "./diagnostics";

/**
 * Variant A's five screens.
 *
 * The registry is what makes a variant a DIRECTION rather than a page: five
 * screens by one hand, sharing one grammar. A screen missing from here is a
 * direction that cannot be judged as a system, which is the whole question this
 * lab exists to answer.
 */
export const SCREENS_A: Readonly<Record<Screen, (props: LabScreenProps) => React.ReactElement>> = {
  projects: ProjectsA,
  "project-detail": ProjectDetailA,
  "source-detail": SourceDetailA,
  activation: ActivationA,
  diagnostics: DiagnosticsA,
};
