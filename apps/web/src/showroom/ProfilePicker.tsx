"use client";

import { useState } from "react";

/**
 * The profile picker.
 *
 * The showroom opens on a Netflix-style profile chooser: the agent picks
 * themselves and steps into IRIS. Observer opens the same way, and the point of
 * this component is that it invents **nothing** — every element is taken from
 * the Figma file:
 *
 *  - the whole anatomy — a segmented control over labelled category rows of
 *    image-led cards — from the Welcome project browser `6964:245`;
 *  - the card itself — image plane, bottom scrim, type chip, name, stat pair,
 *    circular arrow — from the same node;
 *  - the atmospheric ground and the `IRIS BY MADSPACE` foot, from the splash
 *    `6620:1840`.
 *
 * Where an IRIS card carries a commissioned render, an Observer profile carries
 * a monogram field. Generating faces for people who do not exist, or buying
 * stock portraits and presenting them as an agency's staff, is the fabrication
 * the doctrine forbids. See `docs/13-figma-adoption-matrix.md` §5.
 */

export interface Profile {
  readonly key: string;
  readonly name: string;
  readonly role: string;
  readonly organisation: string;
  readonly group: ProfileGroup;
  readonly stats: readonly { readonly label: string; readonly value: string }[];
  readonly blurb: string;
  /**
   * Each card carries its own destination.
   *
   * A callback cannot cross the server/client boundary, and a card that is a
   * real link is navigable, middle-clickable and readable by assistive
   * technology without any of that being arranged separately.
   */
  /** Where the card goes, when it is a link. */
  readonly href?: string;
  /**
   * The viewer key this card submits, when the picker is a form.
   *
   * Production signs in through a server action that mints a session, so the
   * card has to be a submit button rather than a link — the same card, doing
   * the thing the real flow needs.
   */
  readonly submitValue?: string;
}

export type ProfileGroup = "sales" | "management" | "madspace";

const GROUPS = [
  { id: "sales", label: "Sales agents" },
  { id: "management", label: "Management" },
  { id: "madspace", label: "MADSPACE" },
] as const;

const FILTERS = [{ id: "all", label: "All profiles" }, ...GROUPS] as const;

function Arrow() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h13M12 5.5 18.5 12 12 18.5" />
    </svg>
  );
}

function RoleIcon({ group }: { group: ProfileGroup }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (group === "sales") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
      </svg>
    );
  }
  if (group === "management") {
    return (
      <svg {...common}>
        <path d="M4 21V6l7-3v18M11 21h9V10l-9-3M7 9h1M7 13h1M7 17h1" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

/**
 * The monogram field's hue.
 *
 * Deterministic from the name so a profile never changes colour between
 * renders, and constrained to a 60° band around the product accent so five
 * cards read as one family rather than as a paint chart.
 */
function monogramHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 997;
  return 194 + (h % 58);
}

function ProfileCard({ profile }: { profile: Profile }) {
  /*
   * One accessible name per card, and it says who.
   *
   * Five buttons all called "Continue" are five identical announcements to a
   * screen reader, and the reader has to infer the target from the card they
   * cannot see.
   */
  const label = `Continue as ${profile.name}, ${profile.role}`;

  const inner = (
    <>
      <span className="iris-card-media">
        <span
          className="iris-card-image"
          style={{ "--h": monogramHue(profile.name) } as React.CSSProperties}
          aria-hidden="true"
        >
          <span className="iris-monogram">
            {profile.name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </span>
        </span>

        <span className="iris-card-scrim">
          <span className="iris-type-chip">
            <RoleIcon group={profile.group} />
            {profile.role}
          </span>
          <span className="iris-card-name">{profile.name}</span>
          <span className="iris-card-foot">
            <span className="iris-card-stats">
              {profile.stats.map((s) => (
                <span key={s.label}>
                  <em>{s.label}</em>
                  <b>{s.value}</b>
                </span>
              ))}
            </span>
            <span className="iris-card-go">
              <Arrow />
            </span>
          </span>
        </span>
      </span>

      <span className="iris-card-blurb">{profile.blurb}</span>
    </>
  );

  if (profile.submitValue !== undefined) {
    return (
      <button
        className="iris-card"
        type="submit"
        name="viewer"
        value={profile.submitValue}
        aria-label={label}
      >
        {inner}
      </button>
    );
  }

  return (
    <a className="iris-card" href={profile.href ?? "#"} aria-label={label}>
      {inner}
    </a>
  );
}

export function ProfilePicker({
  profiles,
  note,
}: {
  profiles: readonly Profile[];
  /** One line of demonstration context. Product language, never a disclaimer. */
  note?: string;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const shown = profiles.filter((p) => filter === "all" || p.group === filter);

  return (
    <div className="iris iris-welcome">
      <div className="iris-welcome-sky" aria-hidden="true" />

      <header className="iris-welcome-top">
        <div className="iris-brand">
          <b>IRIS</b>
          <span>Observer</span>
          {note === undefined ? null : <span className="iris-welcome-note">{note}</span>}
        </div>

        <div className="iris-segmented" role="tablist" aria-label="Profile group">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              type="button"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/*
         * The demonstration status, in product language.
         *
         * "Scenario selector, not authentication" described the
         * implementation to a reader who had not asked, and told a developer
         * in a consultation they were looking at scaffolding. What matters to
         * them is that the figures are synthetic, which the header now says.
         */}
        <span className="iris-code iris-welcome-badge">Demo data</span>
      </header>

      <main className="iris-welcome-body" id="main">
        <p className="iris-kicker">Choose your profile</p>
        <h1 className="iris-verdict">Each profile sees a different Observer.</h1>

        {/*
         * One row, not the showroom's three category rows.
         *
         * IRIS browses dozens of projects, so category rows fill its frame.
         * Observer has five profiles, and three rows of two cards leaves
         * two-thirds of a 1920 frame empty — which is precisely the defect
         * that got the previous visual layer rejected. The role chip on each
         * card already says which group it belongs to, so the row headers were
         * labelling something the cards state themselves.
         */}
        <div className="iris-collection">
          {shown.map((profile) => (
            <ProfileCard key={profile.key} profile={profile} />
          ))}
        </div>
      </main>

      <footer className="iris-welcome-foot">
        <span className="iris-code">IRIS BY MADSPACE</span>
      </footer>
    </div>
  );
}
