"use client";

import { useMemo, useState } from "react";
import {
  DEMO_INSIGHTS,
  EVIDENCE_LABEL,
  EVIDENCE_MEANING,
  STATUS_LABEL,
  TOPIC_LABEL,
} from "../insights";
import type { EvidenceType, InsightStatus, ObserverInsight } from "../types";
import { Chip, EmptyState, Panel } from "./pieces";

const ALL = "all";

const TONE: Readonly<Record<EvidenceType, "accent" | "good" | "warn">> = {
  "observed-sequence": "accent",
  "attributed-conversion": "good",
  association: "warn",
};

export function Insights() {
  const [evidence, setEvidence] = useState<EvidenceType | typeof ALL>(ALL);
  const [topic, setTopic] = useState<ObserverInsight["topic"] | typeof ALL>(ALL);
  const [status, setStatus] = useState<InsightStatus | typeof ALL>(ALL);

  const filtered = useMemo(
    () =>
      DEMO_INSIGHTS.filter(
        (i) =>
          (evidence === ALL || i.evidence === evidence) &&
          (topic === ALL || i.topic === topic) &&
          (status === ALL || i.status === status),
      ),
    [evidence, topic, status],
  );

  return (
    <>
      <Panel
        title="What the evidence words mean"
        note="Three findings can look alike and be worth completely different things. Observer says which it is, on every finding, and never lets the weakest read as the strongest."
      >
        <div className="od-row od-row-3">
          {(Object.keys(EVIDENCE_LABEL) as EvidenceType[]).map((e) => (
            <div key={e} className="od-fact">
              <dt style={{ marginBottom: 6 }}>
                <Chip tone={TONE[e]}>{EVIDENCE_LABEL[e]}</Chip>
              </dt>
              <dd
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontWeight: 450,
                  color: "var(--od-text-2)",
                  lineHeight: 1.5,
                }}
              >
                {EVIDENCE_MEANING[e]}
              </dd>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Observer findings"
        note={`${filtered.length} of ${DEMO_INSIGHTS.length} findings. Every one states what was observed and what a person might do; none of them says what caused anything.`}
        aside={<Chip>Demonstration data</Chip>}
      >
        <div className="od-filters" style={{ marginBottom: 16 }}>
          <label className="od-select">
            <span className="od-visually-hidden">Evidence type</span>
            <select
              value={evidence}
              onChange={(e) => setEvidence(e.target.value as EvidenceType | typeof ALL)}
            >
              <option value={ALL}>Any evidence type</option>
              {(Object.keys(EVIDENCE_LABEL) as EvidenceType[]).map((e) => (
                <option key={e} value={e}>
                  {EVIDENCE_LABEL[e]}
                </option>
              ))}
            </select>
          </label>

          <label className="od-select">
            <span className="od-visually-hidden">Topic</span>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value as ObserverInsight["topic"] | typeof ALL)}
            >
              <option value={ALL}>Any topic</option>
              {(Object.keys(TOPIC_LABEL) as ObserverInsight["topic"][]).map((t) => (
                <option key={t} value={t}>
                  {TOPIC_LABEL[t]}
                </option>
              ))}
            </select>
          </label>

          <label className="od-select">
            <span className="od-visually-hidden">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as InsightStatus | typeof ALL)}
            >
              <option value={ALL}>Any status</option>
              {(Object.keys(STATUS_LABEL) as InsightStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No finding matches these filters"
            body="No finding in the current window carries all three of these properties at once. Widen the evidence type or the status."
          />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filtered.map((insight) => (
              <article className="od-insight" key={insight.id} data-evidence={insight.evidence}>
                <div className="od-insight-head">
                  <h3 className="od-insight-title">{insight.title}</h3>
                  <div className="od-panel-aside">
                    <Chip tone={TONE[insight.evidence]}>{EVIDENCE_LABEL[insight.evidence]}</Chip>
                    <Chip
                      tone={
                        insight.status === "new"
                          ? "accent"
                          : insight.status === "monitoring"
                            ? "warn"
                            : "neutral"
                      }
                    >
                      {STATUS_LABEL[insight.status]}
                    </Chip>
                  </div>
                </div>

                <div className="od-insight-body">
                  <dl className="od-field">
                    <dt>Measurement</dt>
                    <dd>{insight.measurement}</dd>
                    <dt>Why it matters</dt>
                    <dd>{insight.whyItMatters}</dd>
                    <dt>Recommended action</dt>
                    <dd>
                      <strong>{insight.recommendation}</strong>
                    </dd>
                  </dl>
                  <dl className="od-field">
                    <dt>Subject</dt>
                    <dd>{insight.subject}</dd>
                    <dt>Topic</dt>
                    <dd>{TOPIC_LABEL[insight.topic]}</dd>
                    <dt>Evidence strength</dt>
                    <dd>{insight.strength}</dd>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
