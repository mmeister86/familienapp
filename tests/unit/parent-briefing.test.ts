import { describe, expect, it } from "vitest";
import {
  FAMILY_WHO,
  MAX_ITEMS,
  briefingKindForHour,
  buildPrompt,
  cleanText,
  extractCandidateText,
  parseBriefingResponse,
  responseSchema,
  type BriefingContext,
} from "../../convex/lib/parentBriefing.js";

const SLUGS = ["matthias", "anica", "hannah", "lukas"];

const CONTEXT: BriefingContext = {
  kind: "morning",
  today: "2026-10-03",
  tomorrow: "2026-10-04",
  nowLabel: "Samstag, 3. Oktober 2026 um 07:00 Uhr",
  holidays: [{ date: "2026-10-03", name: "Tag der Deutschen Einheit" }],
  members: [
    { slug: "matthias", name: "Matthias", role: "parent" },
    { slug: "hannah", name: "Hannah", role: "child" },
  ],
  tasksToday: [
    { title: "Zimmer aufräumen", who: "hannah", status: "open", points: 5 },
    { title: "Müll rausbringen", who: null, status: "done" },
  ],
  tasksOverdue: [],
  tasksTomorrow: [],
  pendingApprovals: 2,
  rewardRequests: [{ who: "Hannah", title: "Eis essen gehen" }],
  kids: [
    {
      slug: "hannah",
      name: "Hannah",
      stale: true,
      days: [
        {
          date: "2026-10-03",
          timetable: [
            {
              subject: "Sport",
              start: "09:30",
              end: "10:15",
              change: { type: "cancelled" },
            },
          ],
          events: [],
          meal: { ordered: false },
        },
      ],
      homework: [],
      exams: [{ subject: "Deutsch", date: "2026-10-07", text: "Diktat" }],
    },
  ],
};

describe("briefingKindForHour", () => {
  it("switches to evening at 14:00", () => {
    expect(briefingKindForHour(13)).toBe("morning");
    expect(briefingKindForHour(14)).toBe("evening");
  });
});

describe("buildPrompt", () => {
  const prompt = buildPrompt(CONTEXT);

  it("lists people, holidays, tasks and approvals", () => {
    expect(prompt).toContain("- hannah: Hannah, Kind");
    expect(prompt).toContain("2026-10-03: Tag der Deutschen Einheit");
    expect(prompt).toContain("Zimmer aufräumen (Hannah, offen, 5 Punkte)");
    expect(prompt).toContain("Müll rausbringen (Familie, erledigt)");
    expect(prompt).toContain("Offene Freigaben für die Eltern: 2");
    expect(prompt).toContain("- Hannah: Eis essen gehen");
  });

  it("includes school changes, missing meals, exams and staleness", () => {
    expect(prompt).toContain("Änderung: Sport (09:30) – cancelled");
    expect(prompt).toContain("Mittagessen: NICHT bestellt");
    expect(prompt).toContain("Deutsch am 2026-10-07: Diktat");
    expect(prompt).toContain("Daten älter als 2 Stunden");
  });
});

describe("responseSchema", () => {
  it("restricts who to known slugs plus familie", () => {
    const schema = responseSchema(SLUGS) as {
      properties: { today: { items: { properties: { who: { enum: string[] } } } } };
    };
    expect(schema.properties.today.items.properties.who.enum).toEqual([
      ...SLUGS,
      FAMILY_WHO,
    ]);
  });
});

describe("cleanText", () => {
  it("strips Markdown and bullets", () => {
    expect(cleanText("- **Hannah:** Zimmer   aufräumen", 200)).toBe(
      "Hannah: Zimmer aufräumen",
    );
  });

  it("truncates with an ellipsis", () => {
    expect(cleanText("abcdefghij", 5)).toBe("abcd…");
  });
});

describe("parseBriefingResponse", () => {
  it("parses and sanitises a valid answer", () => {
    const parsed = parseBriefingResponse(
      JSON.stringify({
        headline: "**Feiertag** mit Ruhe",
        summary: "Heute ist frei.",
        today: [
          { who: "Hannah", emoji: "🧹 extra", text: "Zimmer aufräumen steht an." },
          { who: "nobody", emoji: "", text: "Müll ist erledigt." },
          { who: "lukas", emoji: "✅", text: "   " },
        ],
        ahead: [{ who: "familie", emoji: "📝", text: "Mittwoch Diktat." }],
      }),
      SLUGS,
    );
    expect(parsed.headline).toBe("Feiertag mit Ruhe");
    expect(parsed.today).toEqual([
      { who: "hannah", emoji: "🧹", text: "Zimmer aufräumen steht an." },
      { who: FAMILY_WHO, emoji: "•", text: "Müll ist erledigt." },
    ]);
    expect(parsed.ahead).toHaveLength(1);
  });

  it("accepts a fenced JSON payload and caps the item count", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      who: "familie",
      emoji: "•",
      text: `Punkt ${String(i)}`,
    }));
    const parsed = parseBriefingResponse(
      "```json\n" +
        JSON.stringify({ headline: "H", summary: "S", today: items, ahead: [] }) +
        "\n```",
      SLUGS,
    );
    expect(parsed.today).toHaveLength(MAX_ITEMS);
  });

  it("rejects invalid or empty answers with German messages", () => {
    expect(() => parseBriefingResponse("not json", SLUGS)).toThrow(
      "kein gültiges JSON",
    );
    expect(() =>
      parseBriefingResponse(
        JSON.stringify({ headline: "", summary: "", today: [], ahead: [] }),
        SLUGS,
      ),
    ).toThrow("leer");
  });
});

describe("extractCandidateText", () => {
  it("joins answer parts and skips thought parts", () => {
    expect(
      extractCandidateText({
        candidates: [
          {
            content: {
              parts: [{ text: "thinking…", thought: true }, { text: '{"a":' }, { text: "1}" }],
            },
          },
        ],
      }),
    ).toBe('{"a":1}');
  });

  it("explains blocked or empty responses", () => {
    expect(() =>
      extractCandidateText({ promptFeedback: { blockReason: "SAFETY" } }),
    ).toThrow("SAFETY");
    expect(() => extractCandidateText({ candidates: [] })).toThrow(
      "keine Antwort",
    );
  });
});
