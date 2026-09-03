# MADSPACE admin — the client-portal design system, adopted

Extracted from `Design System_Klient Portál.pdf`, the visual language of the **MADSPACE client
portal**, which its own first page describes as "extracted from the built product … a reference to
what ships, not a proposal".

This document is the specification the `/madspace` operations screens are built against. It is not a
summary of the PDF; it is the PDF's content plus the decisions taken when adopting it here, and
where the two differ the decisions are stated with their reasons.

## 0. What this governs, and what it does not

**Governs:** every screen under `/madspace`. Administration, Projects, Project detail, Source
detail, the two creation forms and Diagnostics.

**Does not govern:** Ask IRIS (`/iris/…`), the Observer product surfaces, the showroom. Those keep
the IRIS Spatial Intelligence identity in `docs/14-design-system.md`, and Ask IRIS is frozen pending
review. MADSPACE administration has always been a separate surface — `iris-observer-product` §7 says
so — and this is what that separation now looks like.

### Three adoption decisions

**Light by default.** The operations screens were graphite-dark. The system is greyscale on warm
paper with an inverse dark theme available, so the screens invert. This is the largest single change
and the one most visible in review.

**Inter on `/madspace`, Manrope everywhere else.** The IRIS doctrine locks Manrope by brand and
Figma; this system specifies Inter with tabular figures. Both are true, and they are true of
different products. The font switches at the `/madspace` boundary and nowhere else.

**No em dash, and no bare dash.** The system's language rule. The operations copy leaned on the em
dash for almost every subordinate clause, so this is a rewrite rather than a find-and-replace, and it
happens to serve the same end as the brief that prompted it: less prose on the screen.

## 1. Principles

|                                     |                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **01 Colour means status**          | The interface is greyscale on warm paper. Green, amber, red and blue appear only where they carry a project state, never as decoration.                 |
| **02 Ten seconds to the situation** | Every screen leads with the state, the party waited on and the date. Detail sits below the fold, never in front of the answer.                          |
| **03 Never colour alone**           | Each state owns a distinct mark shape as well as a colour and a spelled-out label, so the distinction survives greyscale printing and colour blindness. |
| **04 Hairlines, not shadows**       | Structure comes from one-pixel borders and grid gaps. Elevation is spent only on things that float above the page.                                      |

Principle 02 is the one the current screens fail hardest. It is also the one the reviewer raised:
explanation was sitting in front of the answer instead of behind a disclosure.

## 2. Colour

### Ink

| Token             | Value     | Contrast | Use                                                  |
| ----------------- | --------- | -------- | ---------------------------------------------------- |
| `--ink`           | `#111111` | 15.0:1   | Headings, primary text, filled buttons               |
| `--ink-2`         | `#4A4A4A` | 9.0:1    | Body copy, descriptions                              |
| `--ink-3`         | `#5C5C5C` | 7.0:1    | Emphasised micro-labels                              |
| `--ink-4`         | `#6B6B6B` | 5.3:1    | The workhorse: labels, metadata, captions            |
| `--mark-disabled` | `#B0AEAA` | 2.3:1    | Decorative marks and disabled fills. **Never text.** |

### Surfaces

| Token             | Value                | Use                                        |
| ----------------- | -------------------- | ------------------------------------------ |
| `--surface-page`  | `#F6F5F3`            | Warm paper. The app background.            |
| `--surface-card`  | `#FFFFFF`            | Every panel, card and field.               |
| `--surface-tint`  | `#EDEBE7`            | Image wells and empty media.               |
| `--surface-inset` | `rgb(17 17 17 / 4%)` | Recessed rows, banners.                    |
| ink as surface    | `#111111`            | Organisation-scope bands, primary buttons. |

### Status

Six states, six shapes. Each ships **two** colours: the saturated value for the mark and the 1px
border, the darker value for the label, because green and amber text on their own tint fall below
4.5:1. The mark shape is produced by one function, so a state cannot appear with the wrong shape in
one place and the right one in another.

| State                | Mark          | Label ink | Tint      | Meaning                                                                             |
| -------------------- | ------------- | --------- | --------- | ----------------------------------------------------------------------------------- |
| On track             | filled circle | `#0F5C39` | `#F4F9F6` | Running to the agreed dates, nothing owed by either side                            |
| Waiting for client   | hollow ring   | `#8A5200` | `#FAF7F2` | Missing uploads, unanswered feedback, an unsigned handover                          |
| Waiting for MADSPACE | diamond       | `#0F6FD0` | `#F6FAFE` | Reviews, fixes and publications owed by the studio                                  |
| Delayed              | triangle      | `#B3261E` | `#FBF3F3` | The delivery date has moved. The reason and the day count are always stated with it |
| Completed            | square        | `#0F5C39` | `#F4F9F6` | Accepted and signed off. The project recedes in the list                            |
| Customer care        | bar           | `--ink-4` | none      | Reopened after handover for a new request. Neutral, not a warning                   |

### Borders

One ink, six alphas. Nothing here is a colour of its own.

| Token               | Alpha | Use                                |
| ------------------- | ----- | ---------------------------------- |
| `--border-hairline` | 6%    | Rows inside a panel                |
| `--border-panel`    | 9%    | The default panel and grid line    |
| `--border-line`     | 12%   | Segmented controls, tabs           |
| `--border-field`    | 16%   | Inputs, selects, secondary buttons |
| `--border-dashed`   | 24%   | Drop targets and empty slots       |
| `--border-hover`    | 35%   | Hover state on a bordered card     |

## 3. Typography

**Inter throughout, tabular figures on.** Body copy runs at the inherited regular weight; 500 marks
a value or a title, 600 an uppercase micro-label, 700 a numeral that has to be found quickly.

| Token               | Size         | Tracking          | Use                       |
| ------------------- | ------------ | ----------------- | ------------------------- |
| `--text-display-xl` | 34 to 52px   | -0.025em, lh 1.05 | The page's subject        |
| `--text-display-2`  | 28 to 40px   | -0.02em           |                           |
| `--text-heading-2`  | 26px         | -0.015em          | Section                   |
| `--text-heading-3`  | 22px         | -0.01em           | Subsection, content title |
| `--text-value`      | 19px         |                   | Data values               |
| `--text-lead`       | 16px regular |                   | Intro copy                |
| `--text-body`       | 14px regular |                   | Body, buttons, fields     |
| `--text-caption`    | 13px regular |                   | Metadata                  |
| `--text-micro`      | 12px         | 0.09em            | Uppercase only            |

**Nothing below 12px.** A hard floor, set for readers over forty and anyone wearing glasses. Micro
labels sit at 12px with tracking reduced to 0.09em so the larger size does not sprawl.

**Tracking follows size.** Display tightens to -0.025em, headings to -0.015em, body stays at zero,
uppercase micro-labels open to 0.09em. Line height runs 1.05 at display and 1.55 at body.

**Fluid above 22px.** Every step from headings upward is a clamp against viewport width, so a 1920px
hero and a 480px phone share one token instead of a breakpoint override.

## 4. Space, radius, elevation

Content is capped at **1440px** and gutters shrink with the viewport, so panels align to one left
edge across the whole product.

- **Gutters `40 · 24 · 16`.** Page padding by default, 24px below 768px, 16px below 480px. Applied
  through **one class**, so the header, the hero and the panels never drift apart.
- **Rhythm `1 · 8 · 12 · 20 · 28`.** A 1px gap over a border-coloured grid is how panels are
  divided. 8 to 12 inside a control, 20 to 28 between sections.
- **Radius.** Two values in practice: **12px** on everything with a box, **full round** for avatars,
  status dots and rings. A third token, 8px, exists for the scrollbar thumb and is used by no
  component.
- **Elevation.** Two shadows only: **popover and modal**. Cards and panels carry no shadow at all.

## 5. Components

**Buttons.** One filled button per view. Where two actions sit together, the more frequent one is
filled and the other loses its border, so the pair never reads as equals. A disabled button always
states why in the text beside it. Five kinds: primary (filled ink), secondary (bordered), tertiary
(text), destructive (red), disabled.

**Fields.** Every input carries a real label tied by `for` and `id`. Placeholders hold an example,
never the label. Errors sit under the field, are announced through `aria-describedby`, and block the
save rather than warning after it.

**Data panel.** A 1px grid over a border-coloured background. Labels reserve **two lines** so values
share a baseline whatever the label length. An empty value is a **word matched to the field, never a
dash**: _Not set_, _None scheduled_, _Never_, _No delay_.

**Milestone stepper.** Completed stages recede into a pale green fill. The current stage takes the
darkest ink and the only solid marker. Future stages stay legible but unemphasised, so the position
in a months-long project reads at a glance.

**Scope band.** Anything whose effect reaches beyond the current project is introduced by a dark band
that names the scope in full words and lists what it touches. The surface change is what stops it
reading as part of the page below.

## 6. The disclosure, added here

Not in the PDF. It is this repository's answer to principle 02, and to the review that found the
operations screens explaining themselves in front of their own answers.

Every explanatory sentence that is not itself the answer moves behind an **information disclosure**:
a small `i` control sitting beside the title or label it explains. It follows the system's own
accessibility contract rather than inventing a pattern:

- a real `<button>` with `aria-expanded` and `aria-controls`, never a hover-only tooltip;
- the panel is one of the two permitted shadows (popover), 12px radius, `--surface-card`;
- Escape closes it, focus returns to the control, and a click outside dismisses it;
- the control is 12px, `--ink-4`, and carries an accessible name that says what it explains, so a
  screen reader hears "what the three states mean" rather than "i".

**What may hide behind it:** definitions, doctrine, the reason a figure is shaped the way it is,
the difference between two similar-looking states.

**What may never:** the state itself, the party waited on, the date, a refusal's reason, an error, or
anything a reader must act on. Principle 02 says detail sits below the fold, not that the answer
does.

## 7. Accessibility contract

Measured, not assumed.

|                      |                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Text contrast**    | 4.5:1 minimum for body text, 3.0:1 for large text and interface marks. `#6B6B6B` at 5.3:1 is the lightest colour any text may use.                                                               |
| **Type floor**       | 12px absolute minimum, 14px for body. No exceptions for dense tables or captions.                                                                                                                |
| **Document outline** | One `h1` per view, `h2` for each section, `h3` for subsections and content titles. Header, nav, main and footer landmarks, with a skip link as the first focusable element.                      |
| **Labels**           | Every input has a `label` tied by `for` and `id`. `aria-invalid` and `aria-describedby` on errored fields, `aria-expanded` and `aria-controls` on disclosures, `aria-current` on the active tab. |
| **Focus**            | A 2px `:focus-visible` ring in the accent colour at 2px offset, on every interactive element, never removed.                                                                                     |
| **Status marks**     | Six states, six shapes. Each sits beside a spelled-out label, so colour is never the only signal.                                                                                                |
| **Language**         | No em dash and no bare dash. Currency through `Intl.NumberFormat`, dates through `Intl.DateTimeFormat`, plurals through `Intl.PluralRules`.                                                      |

## 8. Inverse theme

Dark mode is a token swap on a class, never a CSS filter. A filter on `body` would make it the
containing block for every `position: fixed` element, which breaks modals, the image viewer and the
header. The class redeclares the same token names with dark values, so photographs keep their true
colours and overlays keep their geometry. Status hues lighten to hold contrast against the dark
surfaces.

| Token            | Inverse   |
| ---------------- | --------- |
| `--surface-page` | `#0E0E0D` |
| `--surface-card` | `#181817` |
| `--ink`          | `#F2F1EF` |
| status green     | `#4FBF88` |
