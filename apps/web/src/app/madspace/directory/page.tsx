import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Kicker } from "@observer/ui";

import { requireViewer } from "@/lib/session";
import { dynamicRoute } from "@/lib/href";
import {
  KIND_WORD,
  companyDirectory,
  companySummary,
  directorySentence,
  type Company,
} from "@/lib/madspace/companies";
import { DeveloperForm } from "@/components/madspace/DirectoryForms";
import { TableWrap } from "@/components/madspace/TableWrap";

export const metadata: Metadata = { title: "Directory" };

/**
 * THE DIRECTORY: COMPANIES FIRST, EACH OPENING ONTO ITS PEOPLE (ADR-0047).
 *
 * One list of companies (the developers, the sales agencies and MADSPACE),
 * each a native `<details>` so a keyboard and a screen reader open it the way
 * they open any disclosure. Inside: its people, a developer's projects, an
 * agency's clients. The control plane's "register a developer" form sits
 * behind Add company rather than leading the page. The people come from the
 * demonstration directory the sign-in offers, and the page says so once.
 */
export default async function DirectoryPage() {
  const viewer = await requireViewer();
  /* A layout is not a security boundary; the page checks for itself. */
  if (viewer.role !== "madspace_admin") redirect("/");

  const directory = await companyDirectory(viewer);

  return (
    <>
      <header className="mad-head">
        <div className="mad-head-text">
          <Kicker>MADSPACE administration</Kicker>
          <h1 className="mad-title">Directory</h1>
          <p className="mad-lede">{directorySentence(directory)}</p>
        </div>
      </header>

      <details className="mad-fold mad-add">
        <summary className="mad-button" data-emphasis="secondary">
          Add company
        </summary>
        {directory.canAdd ? (
          <div className="mad-add-body">
            <p className="mad-note">
              A developer is the kind of company the control plane can hold today. Its address fixes
              every link to its projects.
            </p>
            <DeveloperForm />
          </div>
        ) : (
          <p className="mad-note">
            No control plane on this deployment, so there is nowhere to keep a new company.
          </p>
        )}
      </details>

      <section className="mad-plane" aria-labelledby="companies-heading">
        <div className="mad-section-head">
          <h2 id="companies-heading">Companies</h2>
          <p>
            A sales agency is a company of its own: it sells for developers, and each of its people
            is granted one project at a time, so one agency can sell for two developers and see
            neither whole.
          </p>
          <p>
            The people are the demonstration directory&rsquo;s, the accounts the sign-in offers.
            Inviting and suspending people arrive with the tables that will hold them.
          </p>
        </div>
        <ul className="mad-companies">
          {directory.companies.map((company) => (
            <li key={company.key}>
              <CompanyRow company={company} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function CompanyRow({ company }: { company: Company }) {
  const id = `company-${company.key.replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <details className="mad-company">
      <summary>
        <span className="mad-company-name">{company.name}</span>
        <span className="mad-kind">{KIND_WORD[company.kind]}</span>
        <span className="mad-company-summary">{companySummary(company)}</span>
      </summary>

      <div className="mad-company-body">
        {company.address === null ? null : (
          <p className="mad-note">
            Address <span className="mad-code">/{company.address}</span>
            {company.registered ? ", kept by the control plane" : ", from the demonstration"}
          </p>
        )}

        {company.kind === "agency" ? (
          <p className="mad-note">
            Sells for{" "}
            {company.sellsFor.length === 0 ? "no developer yet" : company.sellsFor.join(", ")}.
          </p>
        ) : company.projects.length + company.notYetInObserver === 0 ? (
          <p className="mad-note">No project yet.</p>
        ) : (
          <ul className="mad-company-projects" aria-label={`Projects of ${company.name}`}>
            {company.projects.map((project) => (
              <li key={project.href}>
                <Link href={dynamicRoute(project.href)}>{project.name}</Link>
              </li>
            ))}
            {company.notYetInObserver === 0 ? null : (
              <li className="mad-note">
                {`${String(company.notYetInObserver)} registered on the control plane, not in Observer yet`}
              </li>
            )}
          </ul>
        )}

        <h3 className="mad-company-heading" id={id}>
          People
        </h3>
        {company.people.length === 0 ? (
          <p className="mad-note">Nobody in the demonstration directory works here.</p>
        ) : (
          <TableWrap labelledBy={id}>
            <table className="mad-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Role</th>
                  <th scope="col">Company role</th>
                  <th scope="col">Address</th>
                  <th scope="col">Projects held</th>
                </tr>
              </thead>
              <tbody>
                {company.people.map((person) => (
                  <tr key={person.email}>
                    <th scope="row">{person.name}</th>
                    <td>{person.roleWord}</td>
                    <td>{person.companyRoleWord}</td>
                    <td>
                      <span className="mad-code">{person.email}</span>
                    </td>
                    <td>{person.projects.length === 0 ? "None" : person.projects.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>
    </details>
  );
}
