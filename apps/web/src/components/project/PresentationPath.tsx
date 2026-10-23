import type { JourneyFunnel } from "@observer/readmodels";
import { InfoTip } from "@/components/iris/InfoTip";
import { DrawIn } from "@/showroom/DrawIn";
import "./rooms.css";

/**
 * HOW FAR THE PRESENTATIONS GOT (ADR-0056).
 *
 * The owner: "what does 150 mean here? I did not understand in the first
 * seconds what this chart shows". The title now states the set ("How far 150
 * presentations got"), and every band says what it is after its count:
 * "150 presentations", "144 opened a flat", "137 shortlisted a flat". The
 * kit's narrowing path stays (ADR-0041); the count moves off the band into
 * the words, where it is read first. The method stands behind the `i`; a
 * stage that is not drawn, and why, stays in view.
 */
export function PresentationPath({
  funnel,
  note,
}: {
  readonly funnel: JourneyFunnel;
  /** The journey's own reading note, for the `i`. */
  readonly note: string;
}) {
  return (
    <div className="d-card pr-path-card">
      <header className="iris-titled">
        <h2 className="iris-kicker iris-kicker-measured">{funnel.title}</h2>
        <InfoTip id="journey" label="how far presentations got">
          {`${note} ${funnel.of}`}
        </InfoTip>
      </header>
      {funnel.steps.length === 0 ? (
        <p className="pr-note">{funnel.of}</p>
      ) : (
        <DrawIn kind="bloom">
          <ol className="dld-jf pr-path">
            {funnel.steps.map((step) => (
              <li key={step.id}>
                <span className="pr-path-say">
                  <b>{step.countDisplay}</b> {step.phrase}
                  {step.note === null ? null : <small>{step.note}</small>}
                </span>
                <span className="dld-band" aria-hidden="true">
                  <i style={{ width: `${String(step.share * 100)}%` }} />
                </span>
                <em>{step.shareDisplay}</em>
              </li>
            ))}
          </ol>
        </DrawIn>
      )}
      {funnel.merged === null ? null : <p className="pr-note">{funnel.merged}</p>}
    </div>
  );
}
