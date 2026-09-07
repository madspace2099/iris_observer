import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Kicker, StateMessage } from "@observer/ui";

import { directoryView } from "@/lib/accounts";
import { requireViewer } from "@/lib/session";
import { TableWrap } from "@/components/madspace/TableWrap";

export const metadata: Metadata = { title: "Directory" };

/** "1 agency", "2 agencies": the count and its noun, never the noun alone. */
const plural = (n: number, one: string, other: string) => `${String(n)} ${n === 1 ? one : other}`;

/**
 * THE DIRECTORY — tenants, agencies and people, as the demonstration knows them.
 *
 * M9 names tenants, users and agencies among what MADSPACE administers, and
 * the control plane holds none of them: it has projects and installations,
 * and an account becomes a viewer through the demonstration directory in
 * `lib/accounts.ts`. This screen reads that directory and nothing else, and
 * says so where a reader would otherwise take it for a table in a database.
 *
 * What it can honestly show is the shape M9 describes — who the tenants are,
 * which agency sells for which developer on which project, and which person
 * holds which role — because the demonstration was built to exhibit exactly
 * those arrangements (an agency across two developers, an agent on two
 * projects for one). What it cannot do is create, invite, suspend or edit any
 * of them: there is no store to write to, so no control pretends to.
 * Those actions arrive with the tenant, user and agency tables, and this page
 * is the list they will fill.
 */
export default async function DirectoryPage() {
  const viewer = await requireViewer();
  /* A layout is not a security boundary; the page checks for itself. */
  if (viewer.role !== "madspace_admin") redirect("/");

  const directory = directoryView();

  return (
    <>
      <header className="mad-head">
        <div className="mad-head-text">
          <Kicker>MADSPACE operations</Kicker>
          <h1 className="mad-title">Directory</h1>
          <p className="mad-lede">
            {plural(directory.tenants.length, "tenant", "tenants")},{" "}
            {plural(directory.agencies.length, "agency", "agencies")} and{" "}
            {plural(directory.people.length, "person", "people")}, as the demonstration directory
            holds them. Every one of them is synthetic: there is no tenant, user or agency table
            behind this screen yet, so nothing here can be created, invited or changed, and no
            control claims otherwise.
          </p>
        </div>
      </header>

      <StateMessage
        title="Demonstration directory"
        detail="The tenants, agencies and people below come from the synthetic world the sign-in offers, not from the control plane; the control plane holds projects and installations only. Creating, inviting and suspending arrive with the tables that will hold them."
      />

      <section className="mad-plane" aria-labelledby="tenants-heading">
        <div className="obs-section-head">
          <h2 id="tenants-heading">Tenants</h2>
          <p className="obs-section-note">
            The developers who buy the product, each with the projects they hold.
          </p>
        </div>
        <TableWrap labelledBy="tenants-heading">
          <table className="mad-table">
            <thead>
              <tr>
                <th scope="col">Tenant</th>
                <th scope="col">Slug</th>
                <th scope="col">Projects</th>
                <th scope="col">Accounts holding a project</th>
              </tr>
            </thead>
            <tbody>
              {directory.tenants.map((tenant) => (
                <tr key={tenant.id}>
                  <th scope="row">{tenant.name}</th>
                  <td>
                    <span className="mad-code">{tenant.slug}</span>
                  </td>
                  <td>
                    {tenant.projects.length === 0
                      ? "None"
                      : tenant.projects.map((project, i) => (
                          <span key={project.slug}>
                            {i === 0 ? "" : ", "}
                            <Link href={`/${tenant.slug}/${project.slug}/ask`}>{project.name}</Link>
                          </span>
                        ))}
                  </td>
                  <td>{tenant.accounts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </section>

      <section className="mad-plane" aria-labelledby="agencies-heading">
        <div className="obs-section-head">
          <h2 id="agencies-heading">Agencies</h2>
          <p className="obs-section-note">
            Who operates the product, and for which developers. An agency is granted per project,
            never per tenant, which is why one can sell for two developers and see neither whole.
          </p>
        </div>
        <TableWrap labelledBy="agencies-heading">
          <table className="mad-table">
            <thead>
              <tr>
                <th scope="col">Agency</th>
                <th scope="col">Sells for</th>
                <th scope="col">Projects</th>
                <th scope="col">Managers</th>
                <th scope="col">Agents</th>
              </tr>
            </thead>
            <tbody>
              {directory.agencies.map((agency) => (
                <tr key={agency.name}>
                  <th scope="row">{agency.name}</th>
                  <td>{agency.tenants.join(", ") || "No developer yet"}</td>
                  <td>{agency.projects.join(", ") || "No project yet"}</td>
                  <td>{agency.managers}</td>
                  <td>{agency.agents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </section>

      <section className="mad-plane" aria-labelledby="people-heading">
        <div className="obs-section-head">
          <h2 id="people-heading">People</h2>
          <p className="obs-section-note">
            Every account the sign-in accepts, with the capacity it holds. The address is the one
            printed on the sign-in screen; the password is the demonstration one and is not a
            credential for anything real.
          </p>
        </div>
        <TableWrap labelledBy="people-heading">
          <table className="mad-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Organisation</th>
                <th scope="col">Address</th>
                <th scope="col">Projects held</th>
              </tr>
            </thead>
            <tbody>
              {directory.people.map((person) => (
                <tr key={person.email}>
                  <th scope="row">{person.name}</th>
                  <td>{person.roleWord}</td>
                  <td>{person.organisation}</td>
                  <td>
                    <span className="mad-code">{person.email}</span>
                  </td>
                  <td>{person.projects.length === 0 ? "None" : person.projects.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </section>
    </>
  );
}
