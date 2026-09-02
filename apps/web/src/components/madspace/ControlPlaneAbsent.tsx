import { StateMessage } from "@observer/ui";
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
 */
export function ControlPlaneAbsent({ absence }: { absence: ControlPlaneAbsence }) {
  if (absence.kind === "not_enabled") {
    return (
      <StateMessage
        title="Unavailable — no control plane is configured for this process"
        detail="A deployment reaches Postgres with SUPABASE_URL and SUPABASE_SECRET_KEY; a development machine runs the local control plane with OBSERVER_LOCAL_CONTROL_PLANE=1. Neither is set here, so there is no estate to read. This is a configuration state rather than a failure: nothing has been lost, and nothing is being hidden."
      />
    );
  }

  return (
    <StateMessage
      title="Unavailable — the control plane was configured but would not open"
      detail={`The database refused the connection or the migrations would not apply. It said: ${absence.detail}`}
    />
  );
}
