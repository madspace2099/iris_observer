import type { LabScreenProps, Screen } from "../../lab-data";
import { ProjectsC } from "./projects";
import { ProjectDetailC } from "./project-detail";
import { SourceDetailC } from "./source-detail";
import { ActivationC } from "./activation";
import { DiagnosticsC } from "./diagnostics";

/**
 * Variant C's five screens.
 *
 * The registry is what makes a variant a DIRECTION rather than a page: five
 * screens by one hand, sharing one grammar. A screen missing from here is a
 * direction that cannot be judged as a system, which is the whole question this
 * lab exists to answer.
 */
export const SCREENS_C: Readonly<Record<Screen, (props: LabScreenProps) => React.ReactElement>> = {
  projects: ProjectsC,
  "project-detail": ProjectDetailC,
  "source-detail": SourceDetailC,
  activation: ActivationC,
  diagnostics: DiagnosticsC,
};
