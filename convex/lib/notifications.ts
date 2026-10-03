import { v } from "convex/values";

// Payload the service worker receives via the Web Push protocol and turns
// into a system notification. `url` is where notificationclick navigates.
export const notificationValidator = v.object({
  title: v.string(),
  body: v.string(),
  url: v.string(),
});

export type PushNotification = {
  title: string;
  body: string;
  url: string;
};

// Deep-link routing is out of scope for Phase 7: every notification lands on
// the Today screen (the app's default entry).
const APP_URL = "/";

function notification(title: string, body: string): PushNotification {
  return { title, body, url: APP_URL };
}

// A kid completed a points task; parents must approve it.
export function taskPendingNotification(
  kidName: string,
  taskTitle: string,
): PushNotification {
  return notification(
    "Freigabe nötig",
    `${kidName} hat „${taskTitle}“ erledigt und wartet auf deine Freigabe.`,
  );
}

// A parent approved the kid's completion (points booked when > 0).
export function taskApprovedNotification(
  taskTitle: string,
  points: number,
): PushNotification {
  const suffix = points > 0 ? ` Du bekommst ${String(points)} Punkte.` : "";
  return notification("Aufgabe freigegeben 🎉", `„${taskTitle}“ wurde freigegeben.${suffix}`);
}

// A parent sent the kid's completion back to open, with an optional note.
export function taskRejectedNotification(
  taskTitle: string,
  note?: string,
): PushNotification {
  const suffix = note ? ` Notiz: ${note}` : "";
  return notification(
    "Aufgabe zurückgegeben",
    `„${taskTitle}“ wurde zurückgegeben.${suffix}`,
  );
}

// A kid requested a reward redemption; parents must decide.
export function rewardRequestedNotification(
  kidName: string,
  rewardTitle: string,
): PushNotification {
  return notification(
    "Belohnung angefragt",
    `${kidName} möchte „${rewardTitle}“ einlösen.`,
  );
}

// A parent approved the redemption (points debited).
export function redemptionApprovedNotification(
  rewardTitle: string,
): PushNotification {
  return notification(
    "Belohnung genehmigt 🎉",
    `„${rewardTitle}“ wurde genehmigt.`,
  );
}

// A parent rejected the redemption (nothing booked).
export function redemptionRejectedNotification(
  rewardTitle: string,
): PushNotification {
  return notification(
    "Belohnung abgelehnt",
    `„${rewardTitle}“ wurde leider abgelehnt.`,
  );
}

// A parent assigned a new task to the kid.
export function newTaskNotification(taskTitle: string): PushNotification {
  return notification(
    "Neue Aufgabe",
    `Du hast eine neue Aufgabe: „${taskTitle}“.`,
  );
}
