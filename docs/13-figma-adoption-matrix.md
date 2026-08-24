# Figma adoption matrix

**Status:** accepted · **Date:** 2026-08-24
**File:** `X9a85nibp1YYMppGxQ8iVQ` · [IRIS-private](https://www.figma.com/design/X9a85nibp1YYMppGxQ8iVQ/IRIS-private?node-id=4-20)

What was actually inspected, what principle it carries, how Observer applies it, and where that lives
in code. Adopting Manrope, black and `#00A3FF` is not adoption; every row below cites a node.

---

## 1. Nodes inspected

| Node        | What it is                                              | Inspected as                                |
| ----------- | ------------------------------------------------------- | ------------------------------------------- |
| `4:20`      | Large Screens page, 57 top-level nodes                  | frame inventory (metadata)                  |
| `7843:300`  | **Home — Menu Expanded**, 1920×1080                     | full render                                 |
| `7813:1334` | Customers, 1920×1080                                    | full render                                 |
| `4:25`      | Local Components page                                   | full render — the icon set                  |
| `3:16`      | Touch Screens page                                      | **empty**; renders at 1×1, nothing to adopt |
| `4:21`      | Prototype page                                          | no separately renderable content found      |
| —           | `HORIZONTAL MENU.fig` (local export, 612×289)           | component thumbnail                         |
| —           | `BASIC SCREEN HERE.fig` (local export, 1920×1080)       | screen thumbnail                            |
| —           | `IRIS FIGMA BOT.fig` (local export, 21630×23044 canvas) | canvas thumbnail, 81 embedded assets        |

Type styles read from `get_variable_defs`: Manrope SemiBold and Medium, sizes 12/14/16/18/20/24 with
line heights 16/20/24/24/28/32; `Subheading/X Small` carries `letterSpacing: 4`. Colour variable:
`#00a3ff`. An unresolved "orange gradient" variable exists and is not used.

---

## 2. The adoption matrix

| #   | Figma source                                                                                         | Visual principle                                                                                     | Observer application                                                                                                               | Implementation                                |
| --- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | `7843:300` — the render fills ~88% of the frame; UI is thin chrome at the edges                      | **Space is the ground; the interface floats on it.**                                                 | **Project Pulse** is the ground plane of the Overview — a living building from the real unit catalogue, not a widget inside a card | `ProjectPulse` component; `--pulse-*` tokens  |
| 2   | `7843:300` — bottom-centre floating pill: walk · VR · massing · camera │ **Ask IRIS**                | **A floating command rail, not a fixed toolbar.** The assistant lives on it as a first-class element | **Ask Observer** on a bottom-centre rail, same position, same family                                                               | `AskObserver`, `.iris-rail`                   |
| 3   | `HORIZONTAL MENU.fig` — `Studio │ 2-bedroom │ 3-bedroom`, selected segment as a lighter inset pill   | **Segmented control with an inset selected state**, not tabs or radio buttons                        | Period, mode and segment selection                                                                                                 | `.iris-segmented`                             |
| 4   | `HORIZONTAL MENU.fig` — `VR walkthrough ×`, `Street view ×`                                          | **An active mode is a dismissible chip**, so the reader always knows what is filtering their view    | Active filters — floor, segment, unit — appear as dismissible chips                                                                | `.iris-mode-chip`                             |
| 5   | `7843:300` — top-centre compass strip with tick marks and SE/S/SW                                    | **A precise technical instrument, centred, reading the current spatial state**                       | The **period scrubber**: a tick-marked timeline instrument, not a dropdown                                                         | `PeriodScrubber`                              |
| 6   | `7843:300` — top-right: sun glyph, place, date, time, clock button                                   | **Ambient environment readout**, always visible, never demanding                                     | Data-completeness and last-ingest readout in the same position                                                                     | `.iris-ambient`                               |
| 7   | `4:25` — ~85 monoline outline icons, single weight, rounded caps, real-estate and amenity vocabulary | **Iconography is semantic, not decorative.** Icons name things that exist in the world               | Unit attributes, orientation, amenities, POIs                                                                                      | `packages/ui/src/icons.tsx`                   |
| 8   | `7843:300` — active nav item is a filled `#00A3FF` rounded rect; everything else is monochrome       | **Blue is the selection colour and almost nothing else.** One saturated element per view             | Selection and the primary action only                                                                                              | `--iris-accent`, used sparingly               |
| 9   | `7843:300` — grouped nav under tracked uppercase labels EXPLORE / DECIDE / RESOURCES                 | **Grouping by intent, labelled in small tracked caps**                                               | Section grouping inside drill-downs; the tracked-caps kicker                                                                       | `--text-kicker` with `letter-spacing: 0.25em` |
| 10  | `7843:300`, `7813:1334` — no card contains content; only rails and panels have a container           | **Content sits on a continuous plane.** Containers are for controls                                  | Hairline-separated regions replace the card stack                                                                                  | `.iris-plane`, `.iris-rule`                   |
| 11  | `BASIC SCREEN HERE.fig` — right panel with a large circular time-of-day dial                         | **A radial control is legitimate when it maps to something physically radial** — a day, a compass    | Orientation demand only. Never a KPI doughnut                                                                                      | `OrientationRose`                             |
| 12  | `7813:1334` — data table on a translucent plane over the render, hairline rows, chip-wrapped values  | **Dense data is allowed**, on a plane, with hairlines and chips carrying repeated values             | Unit and contact tables in drill-downs                                                                                             | `.iris-table`                                 |
| 13  | Type styles — Manrope SemiBold throughout, `Subheading/X Small` tracked to 4                         | **One family, character from weight and tracking**                                                   | Locked. Character comes from scale and composition                                                                                 | `--font-sans`, `--text-*`                     |
| 14  | Whole file — graphite `#1e1e1e` surfaces, white text, colour supplied by the imagery                 | **The palette is nearly monochrome; the subject provides the colour**                                | Data supplies the colour: demand, availability, change                                                                             | `--viz-*` restrained to demand semantics      |

---

## 3. Deliberate divergences

The Figma file is IRIS visual DNA. It is not the Observer information architecture, and three things
are adopted in principle but not in form.

**Navigation.** IRIS uses a permanent left explorer rail with eleven destinations over a full-bleed
render. Observer keeps its approved four-item horizontal navigation — Overview, Sales Flow, Project,
People — because the approved architecture forbids a permanent left sidebar and because Observer's
sections are analytical lenses on one project, not places to travel to. The _principle_ adopted is
that navigation is thin chrome at the edge of a spatial ground, not a structural column.

**The render.** IRIS ships with commissioned architectural renders. Observer has none, and inventing
imagery would be exactly the fabrication the doctrine forbids. Project Pulse is therefore an honest
**data-driven spatial abstraction** built from the unit catalogue: real floors, real units, real
availability, real attention. When a project supplies a massing model, a floor plan or a render, it
takes the same position and the abstraction becomes the fallback.

**Density.** The showroom is read from three metres away by two people standing up. Observer is read
at a desk for twenty minutes. Type scale and touch targets come down; information density goes up.
The visual language survives the change because it rests on planes, hairlines and rails rather than
on size.

---

## 4. What was not adopted, and why

| Not adopted                                     | Reason                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Touch Screens page `3:16`                       | Empty in the file. Nothing to adopt.                                                                |
| The unresolved orange gradient variable         | No resolved value, and a second accent would break the one-saturated-element rule.                  |
| Full-bleed photographic backgrounds behind data | A gradient or a photograph behind a chart is a lie about the chart. Imagery stays in its own plane. |
| The left explorer rail                          | See divergences above.                                                                              |

---

## 5. Addendum — the profile picker and the assistant's name

Added after the file `IRIS sales user login.fig` was supplied with the instruction to reuse as many
existing UI elements as possible rather than to invent new ones.

| Figma node                       | What it is                                                                                                                  | Principle                                                                                 | Observer application                                                                             | Implementation                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `6964:245` Welcome project browser | Segmented control, a featured row, then category carousels of image-led cards: type chip, name, stat pair, circular arrow. | A collection you choose from is browsed as cards. Analytical content never is.           | The profile picker's cards, verbatim in anatomy: chip, name, two stats, circular arrow button.  | `.iris-card` and children in `apps/web/src/lab/lab.css`   |
| `6964:245` segmented control     | `Running Projects \| In preparations \| Closed projects`, a track with an inset selected pill.                              | Group switching is a control, not navigation.                                             | `Sales agents \| Management \| MADSPACE` on the picker.                                          | `.iris-segmented`                                          |
| `6620:1840` Welcome splash       | Project wordmark on a soft atmospheric gradient, `IRIS BY MADSPACE` at the foot.                                            | A gradient is permitted where there is no data on it.                                     | The picker's ground and footer. The only gradient field in Observer.                             | `.iris-welcome-sky`, `.iris-welcome-foot`                  |
| `6872:3494` AI-RIS greeting      | *"Welcome, Bob. I am AI-RIS."* — the assistant introduces itself by name and addresses the signed-in agent.                | The assistant is one named character across both products, and it knows who it is talking to. | "Ask Observer" is the surface; **AI-RIS** is the assistant. The greeting uses the chosen profile. | recorded in `docs/14-design-system.md` §8; wording pending |

### A fourth divergence

**Photography.** IRIS project cards carry commissioned architectural renders, and a profile card in a
Netflix-style picker would ordinarily carry a portrait. Observer has neither, and generating faces
for people who do not exist — or buying stock portraits and presenting them as an agency's staff — is
the same fabrication the render divergence already rules out. The image plane therefore carries a
**monogram over a tinted field**, deterministic from the name so it never shuffles between renders.
When a tenant uploads real staff photographs they take the same position and the monogram becomes the
fallback, exactly as the massing model does for Project Pulse.

### One thing that could not be resolved

`IRIS sales user login.fig` is a local export whose canvas (2316 × 14548) is a vertical stack of
screens. Its 184 embedded images were extracted, but the export carries no node identifiers that
resolve against the live file, and no frame named for login, profile, user or agent exists on page
`4:20`. The picker is therefore assembled from the file's **existing published components** — which
is what the instruction asked for — rather than copied from one frame. If a specific frame was meant,
the node link will pin it and the picker can be corrected against it in one pass.
