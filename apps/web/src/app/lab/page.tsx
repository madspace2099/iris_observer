import type { Metadata } from "next";

export const metadata: Metadata = { title: "Design laboratory" };

export default function LabIndex() {
  return (
    <main style={{ padding: "3rem", maxWidth: "42rem" }}>
      <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Design laboratory</h1>
      <p style={{ color: "#9fadba" }}>
        Two Executive Overview concepts, same data, same design language, different emphasis.
      </p>
      <p style={{ color: "#9fadba" }}>
        Internal working drawings. Nothing here is part of the product journey, which is sign in,
        then projects, then a project.
      </p>
      <ul>
        <li>
          <a href="/lab/overview-a">Concept A — narrative-first</a>
        </li>
        <li>
          <a href="/lab/overview-b">Concept B — spatial-first</a>
        </li>
        <li>
          <a href="/lab/sign-in">Profile picker — superseded; kept as a record, not a way in</a>
        </li>
      </ul>
    </main>
  );
}
