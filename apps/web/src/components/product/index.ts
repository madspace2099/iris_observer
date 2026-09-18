/**
 * THE PRODUCT PRIMITIVES.
 *
 * The shared layer every customer-facing Observer screen composes from. Thirteen
 * components in twelve files, and the count is the point: these are not
 * abstractions over CSS classes, which would be fifty of them and would make the
 * design system unreadable at one remove. Each one exists because it carries a
 * RULE that a screen would otherwise have to remember.
 *
 *   PageHead     the conclusion belongs above the seam, on graphite.
 *   Figure       an absent value is never a zero, and there are four absences.
 *   Tally        figures sit on one plane divided by hairlines, not on cards.
 *   Tier/Sources provenance is two axes and they never merge.
 *   Evidence     a claim says what it rests on, or says it rests on nothing.
 *   Sample       no verdict without a sample size.
 *   FindingList  a finding carries its baseline, its caveat and its sample.
 *   AttentionList  red is reserved; an empty list is a result, not a gap.
 *   Empty/Unavailable/Failure  the absences, stated once for a region.
 *   Synthetic    every figure in this build is demonstration data.
 *   ChartFrame   a chart with no period is a chart of nothing in particular.
 *   DataTable    every cell keeps its column name; the sort lives in the URL.
 *   Tabs         a cut of a screen is a link, because it must be shareable.
 *   FilterBar    a filter is a GET form, so it works with no script at all.
 *   Timeline     a sequence, and never a claim that one step produced the next.
 *   Dialog       the one thing in the system that floats.
 *   PersonCard   a roster, with no rank and no photograph.
 *   StackPlan    the building. The reason this reads as real estate.
 *
 * Everything here is a Server Component except `Dialog`, which is marked
 * `"use client"`. That is why no prop in this layer is a function: a callback
 * cannot cross the server/client boundary, so a primitive takes an `href` and
 * the reader navigates. `@/showroom/UnitMatrix` established the convention and
 * `StackPlan` follows it with a resolved href map rather than a lookup function.
 *
 * Every component that renders an internal link takes `period` and puts the
 * href through `withPeriod` and `dynamicRoute`. `typedRoutes` cannot verify a
 * path assembled from a slug at runtime, and navigation that drops the period
 * silently returns a reader who chose "Last 28 days" to the quarter.
 */

export { PageHead, type Crumb } from "./PageHead";
export { Figure, Tally, TallyItem } from "./Metric";
export { Tier, Sources, Evidence, Sample, TIER_LABELS } from "./Provenance";
export { FindingList } from "./Finding";
export { AttentionList } from "./Attention";
export { Empty, Unavailable, Failure, Synthetic } from "./Absence";
export { ChartFrame, type ChartLegendItem } from "./ChartFrame";
export { DataTable, type ColumnSort, type DataColumn, type DataRow } from "./DataTable";
export { Tabs, type TabItem } from "./Tabs";
export { FilterBar, type FilterField, type FilterOption } from "./FilterBar";
export { Timeline, type TimelineStep } from "./Timeline";
export { Dialog } from "./Dialog";
export { PersonCard, Initials } from "./Person";
export { StackPlan } from "./StackPlan";
