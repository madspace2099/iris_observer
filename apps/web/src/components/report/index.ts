/**
 * THE EXPORT EXPERIENCE.
 *
 * One trigger and one dialog, mounted by the screens that own a scope worth
 * exporting: Project Overview offers the project report, Meeting Detail the
 * meeting summary, and the agent's screen the agent's summary — all three
 * mount the same component, and `ReportScope.kind` decides what it calls
 * itself, so three surfaces do not grow three dialogs that disagree.
 *
 * The mounting looks like this, from a Server Component that has already read
 * the scope through the port, with a selector where the scope is one thing:
 *
 *     const report = await repository.getReportScope(query, { agentId });
 *     <ExportReport report={report} pageHref={`${root}/report?agent=${agentId}`} />
 *
 * `ReportScopeView` satisfies `ExportReportView` structurally, so the view goes
 * straight through and nothing has to be unpacked at the call site.
 *
 * Nothing in here generates a document, and the surface says so out loud rather
 * than in a tooltip. That statement is the read model's — `ReportGeneration` is
 * typed to the single state that exists — so a component cannot promise a file
 * by forgetting a condition.
 */

export { ExportReport, type ExportReportView } from "./ExportReport";
export { ReportSections } from "./ReportSections";
export { PrintPage } from "./PrintPage";
