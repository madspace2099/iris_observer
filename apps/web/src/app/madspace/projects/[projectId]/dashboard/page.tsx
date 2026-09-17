import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionLink, Kicker, StateMessage } from "@observer/ui";
import { isComplete, projectDirectoryAdmin } from "@observer/sources";

import { grantableAccounts } from "@/lib/accounts";
import { liveConnectorService } from "@/lib/connectors/live";
import { revokeViewerAction } from "@/lib/madspace/directory-actions";
import { count, instant } from "@/lib/madspace/format";
import { readModelProjectIdForRow } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { CONTROL_PLANE_ACCOUNT, controlPlane, sourceViews } from "@/lib/sources/control-plane";
import { observerDepsAsync } from "@/lib/sources/deps";
import { ControlPlaneAbsent } from "@/components/madspace/ControlPlaneAbsent";
import {
  AgentNameForm,
  GrantViewerForm,
  ProjectSettingsForm,
} from "@/components/madspace/DirectoryForms";
import { InfoNote } from "@/components/madspace/InfoNote";
import { StatusChip, type MarkTone } from "@/components/madspace/StatusMark";

export const metadata: Metadata = { title: "Customer dashboard" };

/**
 * Customer dashboard — what stands between this project and somebody opening it.
 *
 * A project made here is a name until it has a developer, an address and three
 * settings; then it exists on the customer side at once, empty, saying what is
 * not connected yet (`docs/21-self-served-projects.md`). This screen is the four
 * things an administrator decides about that: where it lives, what it still
 * lacks, who may open it, and what the people who present on it are called.
 *
 * Every line of the readiness list is read from persisted state. Nothing here is
 * a checkbox somebody ticks.
 */
export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  const { projectId } = await params;
  const plane = await controlPlane();
  const deps = plane.ok ? await observerDepsAsync() : null;
  if (!plane.ok || deps === null) {
    return (
      <>
        <header className="mad-head">
          <div className="mad-head-text">
            <Kicker>Customer dashboard</Kicker>
            <h1 className="mad-title">Project</h1>
          </div>
        </header>
        {plane.ok ? null : <ControlPlaneAbsent absence={plane.absence} />}
      </>
    );
  }

  const directory = projectDirectoryAdmin(deps);
  const [rows, developers, grants, agents] = await Promise.all([
    directory.directory({ account: CONTROL_PLANE_ACCOUNT }),
    directory.tenants({ account: CONTROL_PLANE_ACCOUNT }),
    directory.viewers({ account: CONTROL_PLANE_ACCOUNT, project: projectId }),
    directory.agents({ account: CONTROL_PLANE_ACCOUNT, project: projectId }),
  ]);
  const row = rows.ok ? (rows.value.find((r) => r.project_id === projectId) ?? null) : null;

  if (row === null) {
    return (
      <StateMessage
        title="No project is readable under this identifier"
        detail="It does not exist, it belongs to another estate, or it has been archived."
        action={<ActionLink href="/madspace/projects">Projects</ActionLink>}
      />
    );
  }

  const complete = isComplete(row);
  const address = complete ? `/${row.tenant_slug}/${row.slug}` : null;
  /* A fixture's twin: completing it gives it a dashboard of its own, and the fixture loses its feed. */
  const twinOf = complete ? null : await readModelProjectIdForRow(row);

  const now = new Date();
  const views = await sourceViews(plane.admin, projectId, now);
  const connectors = await liveConnectorService();
  const connectorList = connectors === null ? null : await connectors.list(projectId);
  const dealSyncs = connectors === null ? null : await connectors.dealSummary(projectId);
  const catalogue = connectorList?.find((c) => c.enabled && c.lastSync?.outcome === "ok") ?? null;
  const crm =
    connectorList?.find((c) => c.enabled && dealSyncs?.get(c.kind)?.outcome === "ok") ?? null;

  const presenters = agents.ok ? agents.value : [];
  const presented = presenters.filter((a) => Number(a.session_count) > 0);
  const unnamed = presented.filter((a) => a.display_name === null);
  const meetings = presented.reduce((sum, a) => sum + Number(a.session_count), 0);

  const granted = grants.ok ? grants.value : [];
  const accounts = grantableAccounts();
  const offer = accounts
    .filter((a) => !granted.some((g) => g.viewer_account === a.accountId))
    .map((a) => ({ accountId: a.accountId, label: `${a.displayName} · ${a.email}` }));

  /* "0 of 0 sources" is a denominator of nothing. With no source registered, that is the sentence. */
  const share = (met: number): string =>
    views.length === 0
      ? "No source registered yet"
      : `${String(met)} of ${String(views.length)} sources`;

  const checks: readonly Check[] = [
    {
      name: "Address and settings",
      met: complete,
      words: complete ? (address ?? "") : "Not set",
      waiting: "administration",
    },
    {
      name: "A showroom activated",
      met: views.some((v) => v.states.activated),
      words: share(views.filter((v) => v.states.activated).length),
      waiting: "the showroom",
    },
    {
      name: "A showroom connected",
      met: views.some((v) => v.states.connected),
      words: share(views.filter((v) => v.states.connected).length),
      waiting: "the showroom",
    },
    {
      name: "Ingestion verified",
      met: views.some((v) => v.states.ingestionVerified),
      words: share(views.filter((v) => v.states.ingestionVerified).length),
      waiting: "the showroom",
    },
    {
      name: "Unit catalogue",
      met: catalogue !== null,
      words: catalogue === null ? "Not connected" : catalogue.name,
      waiting: "administration",
    },
    {
      name: "CRM deals",
      met: crm !== null,
      words: crm === null ? "Not connected" : crm.name,
      waiting: "administration",
    },
    {
      name: "A meeting received",
      met: meetings > 0,
      words: meetings === 0 ? "None yet" : count(meetings).text,
      waiting: "the showroom",
    },
    {
      name: "Every presenter named",
      met: presented.length > 0 && unnamed.length === 0,
      words:
        presented.length === 0
          ? "Nobody has presented yet"
          : unnamed.length === 0
            ? `${String(presented.length)} named`
            : `${String(unnamed.length)} of ${String(presented.length)} without a name`,
      waiting: "administration",
    },
  ];

  return (
    <>
      <header className="mad-head">
        <div className="mad-head-text">
          <Kicker>Customer dashboard</Kicker>
          <h1 className="mad-title">{row.name}</h1>
          <p className="mad-lede">
            {complete
              ? granted.length === 0
                ? "Live at its address. Only MADSPACE administrators can open it until access is granted."
                : `Live at its address, open to ${String(granted.length)} ${granted.length === 1 ? "account" : "accounts"} and to MADSPACE administrators.`
              : "Not a dashboard yet. It needs a developer, an address and its three settings."}
          </p>
        </div>
        {address === null ? null : (
          <ActionLink href={`${address}/meetings`} emphasis="primary">
            Open the dashboard
          </ActionLink>
        )}
      </header>

      <section className="mad-plane" aria-labelledby="settings-heading">
        <div className="obs-section-head">
          <h2 id="settings-heading">Address and settings</h2>
          {developers.ok && developers.value.length === 0 ? (
            <ActionLink href="/madspace/directory" emphasis="secondary">
              Register a developer first
            </ActionLink>
          ) : null}
        </div>
        {twinOf === null ? null : (
          <p className="mad-lede">
            This project currently feeds a demonstration project of the same name. Completing it
            gives it a dashboard of its own, and the demonstration goes back to demonstration data.
          </p>
        )}
        <ProjectSettingsForm
          projectId={projectId}
          projectName={row.name}
          developers={(developers.ok ? developers.value : [])
            .filter((d) => d.status === "active")
            .map((d) => ({ id: d.tenant_id, name: d.name, slug: d.slug }))}
          saved={{
            tenantId: row.tenant_id,
            slug: row.slug,
            currency: row.currency,
            locale: row.locale,
            timeZone: row.time_zone,
          }}
          currencies={Intl.supportedValuesOf("currency")}
          timeZones={["UTC", ...Intl.supportedValuesOf("timeZone")]}
        />
      </section>

      <section className="mad-plane" aria-labelledby="readiness-heading">
        <div className="obs-section-head">
          <h2 id="readiness-heading">What it has, and what it waits for</h2>
          <InfoNote label="how this list is made">
            <p>
              Every line is read from what the control plane holds. Nothing here is ticked by hand.
            </p>
          </InfoNote>
        </div>
        <div className="mad-rows">
          {checks.map((check) => (
            <div className="mad-row mad-row--check" key={check.name}>
              <div className="mad-row-id">
                <h3 className="mad-row-name">{check.name}</h3>
              </div>
              <div className="mad-row-id">
                <div className="mad-badges">
                  <StatusChip tone={tone(check)}>
                    {check.met ? "In place" : `Waiting on ${check.waiting}`}
                  </StatusChip>
                </div>
              </div>
              <p className="mad-note">{check.words}</p>
            </div>
          ))}
        </div>
        <p className="mad-lede">
          Sources are registered on{" "}
          <Link href={`/madspace/projects/${projectId}`}>the project</Link>, and the catalogue and
          the CRM on <Link href={`/madspace/projects/${projectId}/integrations`}>Integrations</Link>
          .
        </p>
      </section>

      <section className="mad-plane" aria-labelledby="viewers-heading">
        <div className="obs-section-head">
          <h2 id="viewers-heading">Who can open it</h2>
          <InfoNote label="who can open a project">
            <p>MADSPACE administrators always can. Anybody else needs a grant made here.</p>
            <p>Revoking keeps the record of the grant; it stops the access.</p>
          </InfoNote>
        </div>
        <div className="mad-rows">
          {granted.length === 0 ? (
            <StateMessage title="Nobody but MADSPACE administrators" />
          ) : (
            granted.map((grant) => {
              const account = accounts.find((a) => a.accountId === grant.viewer_account);
              return (
                <div className="mad-row mad-row--person" key={grant.viewer_account}>
                  <div className="mad-row-id">
                    <h3 className="mad-row-name">{account?.displayName ?? grant.viewer_account}</h3>
                    <p className="mad-note">
                      {account?.email ?? "An account this deployment does not list"}
                    </p>
                  </div>
                  <p className="mad-note">Granted {instant(grant.created_at).text}</p>
                  <form action={revokeViewerAction}>
                    <input type="hidden" name="project" value={projectId} />
                    <input type="hidden" name="viewer" value={grant.viewer_account} />
                    <button className="mad-button" type="submit">
                      Revoke
                    </button>
                  </form>
                </div>
              );
            })
          )}
        </div>
        {offer.length === 0 ? (
          <p className="mad-lede">
            {accounts.length === 0
              ? "This deployment offers no accounts to grant to. Accounts arrive with production sign-in."
              : "Every account this deployment offers already holds this project."}
          </p>
        ) : (
          <GrantViewerForm projectId={projectId} accounts={offer} />
        )}
      </section>

      <section className="mad-plane" aria-labelledby="presenters-heading">
        <div className="obs-section-head">
          <h2 id="presenters-heading">Who presents</h2>
          <InfoNote label="where a presenter's name comes from">
            <p>
              A showroom sends an identifier with every meeting and never a name. The name is kept
              here, and every meeting shows it.
            </p>
            <p>A name typed here replaces one a showroom reported, and is never replaced by one.</p>
          </InfoNote>
        </div>
        <div className="mad-rows">
          {presenters.length === 0 ? (
            <StateMessage title="Nobody has presented on this project yet" />
          ) : (
            presenters.map((agent) => (
              <div className="mad-row mad-row--presenter" key={agent.agent_ref}>
                <div className="mad-row-id">
                  <h3 className="mad-row-name">{agent.display_name ?? "No name yet"}</h3>
                  <p className="mad-note">
                    <span className="mad-code">{agent.agent_ref}</span>
                  </p>
                  <div className="mad-badges">
                    <StatusChip tone={agent.display_name === null ? "wrong" : "good"}>
                      {agent.display_name === null
                        ? "Shown as an identifier"
                        : agent.named_by === "showroom"
                          ? "Named by the showroom"
                          : "Named here"}
                    </StatusChip>
                  </div>
                  <p className="mad-note">
                    {count(Number(agent.session_count)).text}{" "}
                    {Number(agent.session_count) === 1 ? "meeting" : "meetings"}, last{" "}
                    {instant(agent.last_seen_at).text}
                  </p>
                </div>
                <AgentNameForm
                  projectId={projectId}
                  agentRef={agent.agent_ref}
                  name={agent.display_name}
                />
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}

interface Check {
  readonly name: string;
  readonly met: boolean;
  readonly words: string;
  readonly waiting: "administration" | "the showroom";
}

/** In place is the circle. Waiting on us is the diamond, a decision somebody here can take; waiting on the machine is the ring. */
function tone(check: Check): MarkTone {
  if (check.met) return "good";
  return check.waiting === "administration" ? "operator" : "await";
}
