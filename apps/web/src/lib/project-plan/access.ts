import type { SalesWindow, Viewer } from "@observer/readmodels";

/**
 * WHO SETS A PROJECT'S SALES WINDOW (ADR-0055), AND WHAT IS A WINDOW.
 *
 * The sell-out date is the developer's decision, so it is the right of the
 * admin of the tenant's own company: the comparison `mayConnectCrm` and
 * `portraitRight` make (ADR-0049, ADR-0054). On Shark Residence that is Clara
 * Weiss, admin of Shark Developments. The agency's admin (Daniel Hart), the
 * company's members and every agent read the plan and change nothing; MADSPACE
 * runs the platform and does not set a customer's commercial plan. Whether the
 * reader holds the project at all is settled before this is asked.
 */
export function maySetSalesWindow(
  role: Viewer["role"],
  company: { readonly name: string; readonly role: "admin" | "member" },
  tenant: { readonly name: string },
): boolean {
  if (role === "madspace_admin") return false;
  return company.role === "admin" && company.name === tenant.name;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day written `YYYY-MM-DD`: 2027-02-30 is not one. */
function calendarDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

/**
 * Two dates as typed, or the sentence that refuses them.
 *
 * Read on the way in (the form) and on the way out (the file), so a store
 * edited by hand cannot put a window on screen that the form would refuse.
 */
export function parseSalesWindow(startsOn: unknown, sellOutBy: unknown): SalesWindow | string {
  if (typeof startsOn !== "string" || typeof sellOutBy !== "string") {
    return "Give both dates: the sales start and the date to sell out by.";
  }
  const start = startsOn.trim();
  const end = sellOutBy.trim();
  if (start === "" || end === "") {
    return "Give both dates: the sales start and the date to sell out by.";
  }
  if (!calendarDay(start) || !calendarDay(end)) {
    return "Give each date as a calendar day, such as 2027-06-30.";
  }
  if (start < "2000-01-01" || end > "2100-12-31") {
    return "Give dates between 2000 and 2100.";
  }
  if (end <= start) return "The sell-out date must come after the sales start.";
  return { startsOn: start, sellOutBy: end };
}
