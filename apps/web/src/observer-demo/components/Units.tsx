"use client";

import { useMemo, useState } from "react";
import { DEMO_PROJECTS, eventsForUnit } from "../fixtures";
import { DEMO_INSIGHTS, EVIDENCE_LABEL } from "../insights";
import { DEMAND_STATUS_LABEL, demandSeries, unitDemand, unitSeries } from "../metrics";
import type { Availability, DemandStatus, UnitDemand } from "../types";
import { Chip, Delta, DemandChart, EmptyState, Panel, formatCount, formatPrice } from "./pieces";
import { useSelection } from "./Shell";

const TONE: Readonly<Record<DemandStatus, "good" | "warn" | "weak" | "neutral">> = {
  rising: "good",
  steady: "neutral",
  cooling: "weak",
  quiet: "warn",
};

type SortKey = "label" | "floor" | "rooms" | "price" | "views" | "favorites" | "change";

/** Which way a column is currently ordered. */
interface Sort {
  readonly key: SortKey;
  readonly dir: "asc" | "desc";
}

const ALL = "all";

export function Units() {
  const selection = useSelection();
  const rows = unitDemand(selection);
  const project = DEMO_PROJECTS.find((p) => p.id === selection.projectId);

  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState<Availability | typeof ALL>(ALL);
  const [rooms, setRooms] = useState<string>(ALL);
  const [floor, setFloor] = useState<string>(ALL);
  const [aspect, setAspect] = useState<string>(ALL);
  const [status, setStatus] = useState<DemandStatus | typeof ALL>(ALL);
  const [sort, setSort] = useState<Sort>({ key: "views", dir: "desc" });
  const [selected, setSelected] = useState<string | null>(null);

  const floors = useMemo(
    () => [...new Set(rows.map((r) => r.unit.floor))].sort((a, b) => a - b),
    [rows],
  );
  const roomCounts = useMemo(
    () => [...new Set(rows.map((r) => r.unit.rooms))].sort((a, b) => a - b),
    [rows],
  );
  const aspects = useMemo(() => [...new Set(rows.map((r) => r.unit.orientation))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const kept = rows.filter((r) => {
      if (
        q !== "" &&
        !r.unit.label.toLowerCase().includes(q) &&
        !r.unit.id.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (availability !== ALL && r.unit.availability !== availability) return false;
      if (rooms !== ALL && String(r.unit.rooms) !== rooms) return false;
      if (floor !== ALL && String(r.unit.floor) !== floor) return false;
      if (aspect !== ALL && r.unit.orientation !== aspect) return false;
      if (status !== ALL && r.status !== status) return false;
      return true;
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...kept].sort((a, b) => {
      const value = (r: UnitDemand): number | string => {
        switch (sort.key) {
          case "label":
            return r.unit.label;
          case "floor":
            return r.unit.floor;
          case "rooms":
            return r.unit.rooms;
          case "price":
            return r.unit.price;
          case "favorites":
            return r.favorites;
          case "change":
            return r.changePct ?? -Infinity;
          default:
            return r.views;
        }
      };
      const av = value(a);
      const bv = value(b);
      if (typeof av === "string" || typeof bv === "string") {
        return String(av).localeCompare(String(bv)) * dir;
      }
      return (av - bv) * dir;
    });
  }, [rows, search, availability, rooms, floor, aspect, status, sort]);

  const active = filtered.find((r) => r.unit.id === selected) ?? null;

  const header = (key: SortKey, label: string, numeric = false) => (
    <th
      scope="col"
      className={numeric ? "od-num" : undefined}
      aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() =>
          setSort((s) =>
            s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
          )
        }
      >
        {label}
        <span aria-hidden="true">{sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );

  const totalViews = filtered.reduce((a, r) => a + r.views, 0);

  return (
    <div className={active === null ? "od-row" : "od-row od-row-units"}>
      <Panel
        title="Unit demand workspace"
        note={`${filtered.length} of ${rows.length} units in ${project?.name ?? ""}. Views and favourites are derived from the selected window and channel, so they move with the controls above.`}
        aside={<Chip tone="accent">{formatCount(totalViews)} views shown</Chip>}
      >
        <div className="od-filters" style={{ marginBottom: 14 }}>
          <div className="od-search">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="m10.6 10.6 3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              value={search}
              placeholder="Search unit…"
              aria-label="Search units by identifier"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <label className="od-select">
            <span className="od-visually-hidden">Availability</span>
            <select
              value={availability}
              onChange={(e) => setAvailability(e.target.value as Availability | typeof ALL)}
            >
              <option value={ALL}>Any availability</option>
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="sold">Sold</option>
            </select>
          </label>

          <label className="od-select">
            <span className="od-visually-hidden">Rooms</span>
            <select value={rooms} onChange={(e) => setRooms(e.target.value)}>
              <option value={ALL}>Any rooms</option>
              {roomCounts.map((r) => (
                <option key={r} value={String(r)}>
                  {r} rooms
                </option>
              ))}
            </select>
          </label>

          <label className="od-select">
            <span className="od-visually-hidden">Floor</span>
            <select value={floor} onChange={(e) => setFloor(e.target.value)}>
              <option value={ALL}>Any floor</option>
              {floors.map((f) => (
                <option key={f} value={String(f)}>
                  Floor {f}
                </option>
              ))}
            </select>
          </label>

          <label className="od-select">
            <span className="od-visually-hidden">Orientation</span>
            <select value={aspect} onChange={(e) => setAspect(e.target.value)}>
              <option value={ALL}>Any aspect</option>
              {aspects.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <label className="od-select">
            <span className="od-visually-hidden">Demand status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as DemandStatus | typeof ALL)}
            >
              <option value={ALL}>Any demand</option>
              <option value="rising">Rising</option>
              <option value="steady">Steady</option>
              <option value="cooling">Cooling</option>
              <option value="quiet">Quiet</option>
            </select>
          </label>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No unit matches these filters"
            body="Nothing in this project matches every condition at once. Widen the availability or demand filter, or clear the search."
          />
        ) : (
          <div className="od-table-scroll">
            <table className="od-table">
              <caption className="od-visually-hidden">
                Units with observed demand for the selected window. Select a row to open its detail.
              </caption>
              <thead>
                <tr>
                  {header("label", "Unit")}
                  {header("floor", "Floor")}
                  {header("rooms", "Rooms")}
                  <th scope="col">Aspect</th>
                  {header("price", "Price", true)}
                  <th scope="col">Availability</th>
                  {header("views", "Views", true)}
                  {header("favorites", "Favourites", true)}
                  {header("change", "Trend", true)}
                  <th scope="col">Demand</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.unit.id}
                    tabIndex={0}
                    aria-selected={row.unit.id === selected}
                    onClick={() => setSelected(row.unit.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(row.unit.id);
                      }
                    }}
                  >
                    <td className="od-unit-id">{row.unit.label}</td>
                    <td>{row.unit.floor}</td>
                    <td>{row.unit.rooms}</td>
                    <td>{row.unit.orientation}</td>
                    <td className="od-num">{formatPrice(row.unit.price)}</td>
                    <td>
                      <Chip tone={row.unit.availability === "available" ? "neutral" : "warn"}>
                        {row.unit.availability}
                      </Chip>
                    </td>
                    <td className="od-num">{formatCount(row.views)}</td>
                    <td className="od-num">{formatCount(row.favorites)}</td>
                    <td className="od-num">
                      <Delta current={row.views} previous={row.priorViews} />
                    </td>
                    <td>
                      <Chip tone={TONE[row.status]}>{DEMAND_STATUS_LABEL[row.status]}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {active !== null && <UnitDetail row={active} onClose={() => setSelected(null)} />}
    </div>
  );
}

function UnitDetail({ row, onClose }: { row: UnitDemand; onClose: () => void }) {
  const selection = useSelection();
  const series = unitSeries(selection, row.unit);
  const events = eventsForUnit(row.unit.id);
  const insight = DEMO_INSIGHTS.find((i) => i.unitIds.includes(row.unit.id));
  const channel = demandSeries(selection, "unitViews");
  const webShare =
    channel.reduce((a, p) => a + p.web, 0) + channel.reduce((a, p) => a + p.showroom, 0) === 0
      ? 0
      : channel.reduce((a, p) => a + p.web, 0) /
        (channel.reduce((a, p) => a + p.web, 0) + channel.reduce((a, p) => a + p.showroom, 0));

  return (
    <aside className="od-panel od-drawer" aria-label={`Unit ${row.unit.label} detail`}>
      <div className="od-drawer-head">
        <div>
          <h2 className="od-panel-title">Unit {row.unit.label}</h2>
          <p className="od-panel-note">
            Floor {row.unit.floor} · {row.unit.rooms} rooms · {row.unit.area} m² ·{" "}
            {row.unit.orientation} aspect
          </p>
        </div>
        <button type="button" className="od-drawer-close" onClick={onClose}>
          Close
        </button>
      </div>

      <dl className="od-facts">
        <div className="od-fact">
          <dt>Price</dt>
          <dd>{formatPrice(row.unit.price)}</dd>
        </div>
        <div className="od-fact">
          <dt>Availability</dt>
          <dd style={{ textTransform: "capitalize" }}>{row.unit.availability}</dd>
        </div>
        <div className="od-fact">
          <dt>Detail views</dt>
          <dd>{formatCount(row.views)}</dd>
        </div>
        <div className="od-fact">
          <dt>Favourites</dt>
          <dd>{formatCount(row.favorites)}</dd>
        </div>
      </dl>

      <div style={{ marginBottom: 8 }}>
        <Chip tone={TONE[row.status]}>{DEMAND_STATUS_LABEL[row.status]}</Chip>{" "}
        <Delta current={row.views} previous={row.priorViews} />
      </div>

      <h3 className="od-panel-title" style={{ fontSize: 12.5, marginTop: 16, marginBottom: 8 }}>
        Views over time
      </h3>
      <DemandChart series={series} height={140} />

      <h3 className="od-panel-title" style={{ fontSize: 12.5, marginTop: 18, marginBottom: 8 }}>
        Channel breakdown
      </h3>
      <div className="od-channel">
        <span className="od-channel-name">Web IRIS</span>
        <span className="od-channel-value">{Math.round(webShare * 100)}%</span>
        <div className="od-channel-bar">
          <div
            className="od-channel-fill"
            style={{ width: `${webShare * 100}%`, background: "var(--od-accent)" }}
          />
        </div>
        <span className="od-channel-note">
          Showroom accounts for the remaining {Math.round((1 - webShare) * 100)}% of this
          unit&rsquo;s observed views in the selected window.
        </span>
      </div>

      <h3 className="od-panel-title" style={{ fontSize: 12.5, marginTop: 18, marginBottom: 8 }}>
        Recent observed events
      </h3>
      <ul className="od-events">
        {events.map((e) => (
          <li className="od-event" key={`${e.at}-${e.kind}`}>
            <span className="od-event-dot" aria-hidden="true" />
            <span>
              <span className="od-event-detail">{e.detail}</span>
              <span className="od-event-meta">
                {e.at} · {e.channel === "web" ? "Web IRIS" : "Showroom"}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <h3 className="od-panel-title" style={{ fontSize: 12.5, marginTop: 18, marginBottom: 8 }}>
        Related Observer finding
      </h3>
      {insight === undefined ? (
        <p className="od-panel-note">
          No finding currently references this unit. That is an absence of evidence, not evidence
          that nothing is happening.
        </p>
      ) : (
        <>
          <p className="od-brief-text" style={{ marginBottom: 6 }}>
            <strong style={{ color: "var(--od-text)" }}>{insight.title}.</strong>{" "}
            {insight.measurement}
          </p>
          <Chip tone={insight.evidence === "association" ? "warn" : "accent"}>
            {EVIDENCE_LABEL[insight.evidence]}
          </Chip>
        </>
      )}

      <p className="od-panel-note" style={{ marginTop: 18 }}>
        Demonstration data. These figures are synthetic and describe no real buyer.
      </p>
    </aside>
  );
}
