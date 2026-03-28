// POST /api/notifications/subscribe — save a device's push subscription
// DELETE /api/notifications/subscribe — remove a subscription
import { kv } from "@vercel/kv";

const SUBSCRIPTIONS_KEY = "truth_calendar:push_subscriptions";

export default async function handler(req, res) {
  if (req.method === "POST") {
    const subscription = req.body;

    if (!subscription?.endpoint) {
      return res.status(400).json({ error: "Invalid subscription" });
    }

    // Store keyed by endpoint so we don't duplicate
    const key = `${SUBSCRIPTIONS_KEY}:${Buffer.from(subscription.endpoint).toString("base64").slice(0, 32)}`;
    await kv.set(key, subscription, { ex: 60 * 60 * 24 * 30 }); // 30 days

    return res.status(201).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });

    const key = `${SUBSCRIPTIONS_KEY}:${Buffer.from(endpoint).toString("base64").slice(0, 32)}`;
    await kv.del(key);

    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
