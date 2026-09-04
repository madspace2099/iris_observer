import type { LabScreenProps, Screen } from "../../lab-data";
import { ProjectsB } from "./projects";
import { SourcesB } from "./sources";
import { ProjectDetailB } from "./project-detail";
import { SourceDetailB } from "./source-detail";
import { ActivationB } from "./activation";
import { DiagnosticsB } from "./diagnostics";

/**
 * Variant B's six screens.
 *
 * The registry is what makes a variant a DIRECTION rather than a page: six
 * screens by one hand, sharing one grammar. A screen missing from here is a
 * direction that cannot be judged as a system, which is the whole question this
 * lab exists to answer.
 */
export const SCREENS_B: Readonly<Record<Screen, (props: LabScreenProps) => React.ReactElement>> = {
  projects: ProjectsB,
  sources: SourcesB,
  "project-detail": ProjectDetailB,
  "source-detail": SourceDetailB,
  activation: ActivationB,
  diagnostics: DiagnosticsB,
};
