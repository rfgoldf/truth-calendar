// GET /api/cron/notify — runs every minute via Vercel Cron
// Checks for events starting in 10 minutes or right now and sends push notifications

import { getCachedEvents } from "../../../lib/store.js";
import { sendPushToAll } from "../notifications/send.js";
import { kv } from "@vercel/kv";

const NOTIFIED_KEY = "truth_calendar:notified";

export default async function handler(req, res) {
  // Vercel Cron authenticates with CRON_SECRET
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }

  const events = await getCachedEvents();
  const now = new Date();
  const notifications = [];

  for (const event of events) {
    if (!event.startTime || event.meetingType === "todoist") continue;

    const start = new Date(event.startTime);
    const minutesUntil = Math.round((start - now) / 60000);

    // Fire at exactly 10 min before and at the moment of the meeting
    const shouldNotify = minutesUntil === 10 || minutesUntil === 0;
    if (!shouldNotify) continue;

    // Deduplicate: don't send the same notification twice
    const notifKey = `${NOTIFIED_KEY}:${event.id}:${minutesUntil}`;
    const alreadySent = await kv.get(notifKey);
    if (alreadySent) continue;

    const isNow = minutesUntil === 0;
    const title = isNow ? `Starting now: ${event.title}` : `In 10 min: ${event.title}`;
    const body = [
      event.subtitle || (event.primaryPerson ? `${event.primaryPerson.name}` : null),
      event.meetingLink ? (event.meetingType === "zoom" ? "Zoom" : "Google Meet") : null,
    ]
      .filter(Boolean)
      .join(" · ");

    notifications.push(
      sendPushToAll({
        title,
        body: body || formatTime(event.startTime),
        tag: `${event.id}-${minutesUntil}`,
        url: "/",
        requireInteraction: isNow,
        actions: event.meetingLink
          ? [{ action: "join", title: "Join meeting" }]
          : [],
      }).then(() =>
        // Mark as sent — expire after 2 min so it doesn't linger in KV
        kv.set(notifKey, "1", { ex: 120 })
      )
    );
  }

  await Promise.allSettled(notifications);

  return res.status(200).json({ checked: events.length, fired: notifications.length });
}

function formatTime(iso) {
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, "0");
  const ap = d.getHours() >= 12 ? "pm" : "am";
  return `${h}:${m}${ap}`;
}
