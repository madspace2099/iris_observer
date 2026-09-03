import type { LabScreenProps, Screen } from "../../lab-data";
import { ProjectsB } from "./projects";
import { ProjectDetailB } from "./project-detail";
import { SourceDetailB } from "./source-detail";
import { ActivationB } from "./activation";
import { DiagnosticsB } from "./diagnostics";

/**
 * Variant B's five screens.
 *
 * The registry is what makes a variant a DIRECTION rather than a page: five
 * screens by one hand, sharing one grammar. A screen missing from here is a
 * direction that cannot be judged as a system, which is the whole question this
 * lab exists to answer.
 */
export const SCREENS_B: Readonly<Record<Screen, (props: LabScreenProps) => React.ReactElement>> = {
  projects: ProjectsB,
  "project-detail": ProjectDetailB,
  "source-detail": SourceDetailB,
  activation: ActivationB,
  diagnostics: DiagnosticsB,
};
