import { describe, expect, it } from "vitest";
import {
  newTaskNotification,
  redemptionApprovedNotification,
  redemptionRejectedNotification,
  rewardRequestedNotification,
  taskApprovedNotification,
  taskPendingNotification,
  taskRejectedNotification,
} from "../../convex/lib/notifications.js";

describe("notification builders", () => {
  it("taskPendingNotification names the kid and the task", () => {
    expect(taskPendingNotification("Lukas", "Zimmer aufräumen")).toEqual({
      title: "Freigabe nötig",
      body: "Lukas hat „Zimmer aufräumen“ erledigt und wartet auf deine Freigabe.",
      url: "/",
    });
  });

  it("taskApprovedNotification includes the points when positive", () => {
    const withPoints = taskApprovedNotification("Zimmer aufräumen", 10);
    expect(withPoints.title).toBe("Aufgabe freigegeben 🎉");
    expect(withPoints.body).toContain("Zimmer aufräumen");
    expect(withPoints.body).toContain("10 Punkte");
    expect(withPoints.url).toBe("/");

    const withoutPoints = taskApprovedNotification("Zimmer aufräumen", 0);
    expect(withoutPoints.body).not.toContain("Punkte");
  });

  it("taskRejectedNotification omits an absent note and appends a given one", () => {
    const withoutNote = taskRejectedNotification("Zimmer", undefined);
    expect(withoutNote.title).toBe("Aufgabe zurückgegeben");
    expect(withoutNote.body).toContain("Zimmer");
    expect(withoutNote.body).not.toContain("Notiz");
    expect(withoutNote.url).toBe("/");

    const withNote = taskRejectedNotification("Zimmer", "Bitte gründlicher");
    expect(withNote.body).toContain("Notiz: Bitte gründlicher");
  });

  it("rewardRequestedNotification names the kid and the reward", () => {
    expect(rewardRequestedNotification("Hannah", "Kinoabend")).toEqual({
      title: "Belohnung angefragt",
      body: "Hannah möchte „Kinoabend“ einlösen.",
      url: "/",
    });
  });

  it("redemptionApprovedNotification names the reward", () => {
    const approved = redemptionApprovedNotification("Kinoabend");
    expect(approved.title).toBe("Belohnung genehmigt 🎉");
    expect(approved.body).toContain("Kinoabend");
    expect(approved.url).toBe("/");
  });

  it("redemptionRejectedNotification names the reward", () => {
    const rejected = redemptionRejectedNotification("Kinoabend");
    expect(rejected.title).toBe("Belohnung abgelehnt");
    expect(rejected.body).toContain("Kinoabend");
    expect(rejected.url).toBe("/");
  });

  it("newTaskNotification names the task", () => {
    expect(newTaskNotification("Müll rausbringen")).toEqual({
      title: "Neue Aufgabe",
      body: "Du hast eine neue Aufgabe: „Müll rausbringen“.",
      url: "/",
    });
  });
});
