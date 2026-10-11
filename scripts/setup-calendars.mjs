// One-off setup for the central calendar sources (Convex calendar pilot).
//
//   node scripts/setup-calendars.mjs save      create/update the sources (shadow mode)
//   node scripts/setup-calendars.mjs import    run the first import for every source
//   node scripts/setup-calendars.mjs activate  switch sources to "convex" + mark configured
//   node scripts/setup-calendars.mjs bind      bind dashboard children to users, see BINDINGS below
//
// BINDINGS="besteschule:<studentId>=lukas,timetable:<childId>=hannah"
// (ids as shown by the dashboard JSON: school.students[].id / timetables[].id)
//
// The feed addresses must already exist as Convex env vars (CALENDAR_n_URL).
// Secrets come from the environment only, nothing is written to disk:
//   CONVEX_URL        browser-facing deployment URL (VITE_CONVEX_URL)
//   PARENT_SLUG       slug of a parent user (e.g. matthias)
//   PARENT_PIN        that user's PIN
//   CONVEX_SELF_HOSTED_URL / CONVEX_SELF_HOSTED_ADMIN_KEY   (only for `import`,
//                     it runs the internal fetch action through the CLI)

import { spawnSync } from "node:child_process";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const SOURCES = [
  { n: 1, sourceKey: "ferien", name: "Ferien", color: "#27ae60", panel: "column" },
  { n: 2, sourceKey: "familie", name: "Familie", color: "#9b59b6", panel: "column" },
  { n: 3, sourceKey: "abwesenheit", name: "Abwesenheitskalender", color: "#c0392b", panel: "column" },
  { n: 4, sourceKey: "hannah", name: "Hannah", color: "#e74c3c", panel: "school", person: "hannah" },
  // Feiertage are merged into the Ferien column
  { n: 5, sourceKey: "feiertage", name: "Feiertage", color: "#2ecc71", panel: "column", into: "ferien" },
  { n: 6, sourceKey: "lukas", name: "Lukas", color: "#4F8EF7", panel: "school", person: "lukas" },
];
const INTERVAL_MS = 15 * 60 * 1000;

function need(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} fehlt`);
    process.exit(1);
  }
  return value;
}

const client = new ConvexHttpClient(need("CONVEX_URL"));
const { token } = await client.action(anyApi.auth.login, {
  slug: need("PARENT_SLUG"),
  pin: need("PARENT_PIN"),
});

async function listSources() {
  return await client.query(anyApi.calendarSources.list, { token });
}

const command = process.argv[2];

if (command === "save") {
  // user ids as served by GET /dashboard/calendars (people[]); override via env
  const personIds = {
    hannah: process.env.HANNAH_USER_ID ?? "k57dj8kjrkrvantfmate7149vn8fkm14",
    lukas: process.env.LUKAS_USER_ID ?? "k57bkzdk2tta7z1bbktn9r8ksn8fk4t3",
  };
  const ids = new Map((await listSources()).map((s) => [s.sourceKey, s._id]));
  for (const s of SOURCES) {
    const intoCalendarId = s.into ? ids.get(s.into) : undefined;
    if (s.into && !intoCalendarId) {
      console.error(`Zielspalte ${s.into} fehlt noch`);
      process.exit(1);
    }
    const input = {
      token,
      source: {
        sourceKey: s.sourceKey,
        name: s.name,
        color: s.color,
        panel: s.panel,
        order: s.n,
        ...(intoCalendarId ? { intoCalendarId } : {}),
        personIds: s.person && personIds[s.person] ? [personIds[s.person]] : [],
        urlEnvKey: `CALENDAR_${s.n}_URL`,
        enabled: true,
        intervalMs: INTERVAL_MS,
      },
    };
    let id = await client.mutation(anyApi.calendarSources.save, input);
    // save() creates new sources disabled; a second save applies enabled=true
    if (!ids.has(s.sourceKey)) {
      id = await client.mutation(anyApi.calendarSources.save, input);
    }
    ids.set(s.sourceKey, id);
    console.log(`gespeichert: ${s.sourceKey} (${id})`);
  }
} else if (command === "import") {
  for (const source of await listSources()) {
    const run = spawnSync(
      "npx",
      ["convex", "run", "calendarFetch:fetchCalendar", JSON.stringify({ sourceId: source._id })],
      { stdio: "inherit" },
    );
    console.log(`Import ${source.sourceKey}: exit ${run.status}`);
  }
} else if (command === "activate") {
  for (const source of await listSources()) {
    try {
      await client.mutation(anyApi.calendarSources.activate, {
        token,
        sourceId: source._id,
        mode: "convex",
      });
      console.log(`aktiv: ${source.sourceKey}`);
    } catch (error) {
      console.error(`${source.sourceKey}: ${error.data ?? error.message}`);
    }
  }
  await client.mutation(anyApi.calendarSources.setConfigured, {
    token,
    configured: true,
  });
  console.log("configured=true");
} else if (command === "bind") {
  const userIds = {
    hannah: process.env.HANNAH_USER_ID ?? "k57dj8kjrkrvantfmate7149vn8fkm14",
    lukas: process.env.LUKAS_USER_ID ?? "k57bkzdk2tta7z1bbktn9r8ksn8fk4t3",
  };
  for (const entry of need("BINDINGS").split(",")) {
    const [source, slug] = entry.trim().split("=");
    const [kind, externalId] = source.split(":");
    const userId = userIds[slug];
    if (!userId || !externalId) {
      console.error(`ungueltig: ${entry}`);
      continue;
    }
    try {
      await client.mutation(anyApi.calendarSources.bindPerson, { token, userId, kind, externalId });
      console.log(`gebunden: ${kind}:${externalId} -> ${slug}`);
    } catch (error) {
      console.error(`${entry}: ${error.data ?? error.message}`);
    }
  }
} else {
  console.error("Aufruf: save | import | activate | bind");
  process.exit(1);
}
