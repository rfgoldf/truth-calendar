// Internal helper — send a push notification to all subscribed devices
import webpush from "web-push";
import { kv } from "@vercel/kv";

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const SUBSCRIPTIONS_KEY = "truth_calendar:push_subscriptions";

export async function sendPushToAll(payload) {
  // Get all subscription keys
  const keys = await kv.keys(`${SUBSCRIPTIONS_KEY}:*`);
  if (!keys.length) return;

  const subscriptions = await Promise.all(keys.map((k) => kv.get(k)));
  const validSubs = subscriptions.filter(Boolean);

  const results = await Promise.allSettled(
    validSubs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload));
      } catch (err) {
        // Remove expired/invalid subscriptions
        if (err.statusCode === 404 || err.statusCode === 410) {
          const key = `${SUBSCRIPTIONS_KEY}:${Buffer.from(sub.endpoint).toString("base64").slice(0, 32)}`;
          await kv.del(key);
        }
        throw err;
      }
    })
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  return { sent, failed };
}

// Direct API endpoint (for testing)
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (req.headers["x-sync-secret"] !== process.env.WEBHOOK_SECRET) return res.status(401).end();

  const { title, body, tag, url } = req.body;
  const result = await sendPushToAll({ title, body, tag, url });
  return res.status(200).json(result);
}
