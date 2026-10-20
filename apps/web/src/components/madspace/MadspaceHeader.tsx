"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

import { ClosableDetails } from "@/components/ask-iris/ClosableDetails";
import { Brand, MenuMark } from "@/components/iris/Shell";

/**
 * THE MADSPACE HEADER IS THE PRODUCT'S HEADER (ADR-0047).
 *
 * The owner compared `/madspace` with a project page and found a different
 * product: no mark on the left, a second header row, another navigation. So
 * this draws the product shell's own header from its own classes and its own
 * wordmark (`Brand`, `MenuMark` from `Shell.tsx`): the IRIS mark on the left,
 * MADSPACE's three sections centred, the account on the right, and below
 * 1200px the same single row with the same menu sheet. What differs is only
 * what MADSPACE has: its sections, its role, and which control plane answers,
 * as a quiet chip rather than a band.
 *
 * It stays a separate surface (doctrine §7): none of these is a nav item
 * inside a client's project, and the project shell carries none of them.
 */

interface Section {
  readonly href: Route;
  readonly label: string;
  /** Drill-downs that belong to this section although their address does not start with it. */
  readonly owns: readonly string[];
}

const SECTIONS: readonly Section[] = [
  { href: "/madspace", label: "Projects", owns: ["/madspace/projects", "/madspace/sources"] },
  { href: "/madspace/diagnostics", label: "Diagnostics", owns: [] },
  { href: "/madspace/directory", label: "Directory", owns: [] },
];

function within(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isCurrent(pathname: string, section: Section): boolean {
  /* `/madspace` is a prefix of every section, so it is matched exactly. */
  const own =
    section.href === "/madspace" ? pathname === "/madspace" : within(pathname, section.href);
  return own || section.owns.some((prefix) => within(pathname, prefix));
}

export function MadspaceHeader({
  operator,
  plane,
  account,
}: {
  readonly operator: string;
  /** Which control plane answers: a word for the chip, a sentence for its title. */
  readonly plane: { readonly word: string; readonly sentence: string };
  /** Back to Observer and Sign out. A server action cannot cross into this file, so they arrive formed. */
  readonly account: ReactNode;
}) {
  const pathname = usePathname();
  const barRef = useRef<HTMLDivElement>(null);
  const current = SECTIONS.find((section) => isCurrent(pathname, section));

  /*
   * The open sheet is the only thing a reader can reach, as in `Shell`: the
   * header and the page go inert while it is open, by every way it closes,
   * and crossing back above the breakpoint closes it.
   */
  useEffect(() => {
    const details = barRef.current?.querySelector("details");
    if (details === null || details === undefined) return;
    const setInert = (on: boolean) => {
      for (const el of [document.getElementById("main"), document.querySelector(".irs-header")]) {
        if (el instanceof HTMLElement) el.inert = on;
      }
    };
    const onToggle = () => setInert(details.open);
    const wide = window.matchMedia("(min-width: 1200px)");
    const onWide = (event: MediaQueryListEvent) => {
      if (event.matches && details.open) details.open = false;
    };
    details.addEventListener("toggle", onToggle);
    wide.addEventListener("change", onWide);
    return () => {
      details.removeEventListener("toggle", onToggle);
      wide.removeEventListener("change", onWide);
      setInert(false);
    };
  }, []);

  /* A section chosen in the sheet navigates under a layout that stays mounted, so the sheet closes itself. */
  useEffect(() => {
    const details = barRef.current?.querySelector("details");
    if (details?.open === true) details.open = false;
  }, [pathname]);

  const name = operator === "" ? "Name not set" : operator;
  const links = (className: string) =>
    SECTIONS.map((section) => (
      <Link
        key={section.href}
        className={className}
        href={section.href}
        {...(section === current ? { "aria-current": "page" as const } : {})}
      >
        {section.label}
      </Link>
    ));
  const chip = (where: "header" | "sheet") => (
    <span
      className={where === "sheet" ? "mad-plane-chip mad-plane-chip--sheet" : "mad-plane-chip"}
      title={plane.sentence}
    >
      {plane.word}
    </span>
  );
  const who = (
    <>
      <div className="irs-who-name" title={name}>
        {name}
      </div>
      <div className="irs-who-role">MADSPACE administrator</div>
    </>
  );

  return (
    <>
      <header className="irs-header">
        <Brand href="/madspace" label="IRIS by MADSPACE, MADSPACE projects" />
        <nav className="irs-nav irs-nav--wide" aria-label="MADSPACE sections">
          {links("irs-nav-item")}
        </nav>
        <div className="irs-header-end irs-header-end--wide">
          {chip("header")}
          <div className="irs-who">{who}</div>
          {account}
        </div>
      </header>

      <div className="irs-mobile-bar" ref={barRef}>
        <span className="irs-mobile-project">{current?.label ?? "MADSPACE"}</span>
        <ClosableDetails className="irs-mobile-menu">
          <summary className="irs-mobile-menu-trigger" aria-label="Menu">
            <MenuMark />
          </summary>
          <div className="irs-mobile-menu-panel">
            <div className="irs-mobile-menu-head">
              <span className="irs-mobile-menu-title">Menu</span>
              <button
                type="button"
                className="irs-mobile-menu-close"
                aria-label="Close menu"
                onClick={(event) => {
                  const details = event.currentTarget.closest("details");
                  if (details !== null) details.open = false;
                }}
              >
                <MenuMark />
              </button>
            </div>
            <div className="irs-mobile-menu-scroll">
              <nav className="irs-mobile-nav" aria-label="MADSPACE sections">
                {links("irs-mobile-nav-item")}
              </nav>
              <div className="irs-mobile-who">
                {who}
                {chip("sheet")}
              </div>
              <div className="irs-mobile-account">{account}</div>
            </div>
          </div>
        </ClosableDetails>
      </div>
    </>
  );
}
