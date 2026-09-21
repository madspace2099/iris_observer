/**
 * THE EXPORT EXPERIENCE.
 *
 * One trigger and one dialog, mounted by the screens that own a scope worth
 * exporting: Project Overview offers the project report, Meeting Detail offers
 * the meeting summary, and both mount the same component — `ReportScope.kind`
 * decides which of the two it calls itself, so the two surfaces do not grow two
 * dialogs that disagree.
 *
 * The mounting looks like this, from a Server Component that has already read
 * the scope through the port:
 *
 *     const report = await repository.getReportScope(query);
 *     <ExportReport report={report} />
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
