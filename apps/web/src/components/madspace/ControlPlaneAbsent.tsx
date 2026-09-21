import { InfoNote } from "@/components/madspace/InfoNote";
import type { ControlPlaneAbsence } from "@/lib/sources/control-plane";

/**
 * Why there is nothing to read, in words an operator can act on.
 *
 * Never "something went wrong", and never the same sentence for both cases.
 * `controlPlane()` returns a discriminated absence for exactly this reason: a
 * deployment with no database and a development machine that has not set the
 * flag are different problems with different fixes, and a shared message sends
 * the reader to check the wrong one.
 *
 * The failure detail is Postgres's own sentence. It is shown because this
 * surface is MADSPACE's own and because the failure is almost always a
 * migration that will not apply or a data directory that cannot be written —
 * neither of which is diagnosable without it. No stack, no query, and nothing
 * from an event payload.
 *
 * ## Why it stopped using `StateMessage`
 *
 * `StateMessage` is an IRIS Spatial primitive and its title is a string, so
 * there is nowhere to hang the disclosure that the reassurance sentence now
 * lives behind. The markup here is the same two elements in the `/madspace`
 * vocabulary instead of the product's, which also keeps the shape on the right
 * side of the surface boundary.
 */
export function ControlPlaneAbsent({ absence }: { absence: ControlPlaneAbsence }) {
  if (absence.kind === "not_enabled") {
    return (
      <div className="mad-empty" role="status">
        <strong>
          Unavailable. No control plane is configured for this process.
          <InfoNote label="how to read this state">
            <p>
              This is a configuration state rather than a failure: nothing has been lost, and
              nothing is being hidden.
            </p>
          </InfoNote>
        </strong>
        <span>
          A deployment reaches Postgres with SUPABASE_URL and SUPABASE_SECRET_KEY; a development
          machine runs the local control plane with OBSERVER_LOCAL_CONTROL_PLANE=1. Neither is set
          here, so there is no estate to read.
        </span>
      </div>
    );
  }

  /*
   * An empty detail is not a shorter sentence, it is a different fact: the
   * database refused and said nothing. "It said: " with nothing after the colon
   * reads as text that was cut off, which sends an operator looking for a
   * rendering bug instead of at their own connection string.
   */
  const said = absence.detail.trim();

  return (
    <div className="mad-empty" role="status">
      <strong>Unavailable. The control plane was configured but would not open.</strong>
      <span>
        The database refused the connection or the migrations would not apply.{" "}
        {said.length === 0 ? "It gave no reason." : `It said: ${said}`}
      </span>
    </div>
  );
}
