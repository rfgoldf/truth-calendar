// POST /api/webhooks/google-calendar
// Receives push notifications from Google Calendar and triggers a sync
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const token = req.headers["x-goog-channel-token"];
  if (token !== process.env.WEBHOOK_SECRET) {
    return res.status(401).end();
  }

  // Acknowledge immediately (Google requires a fast response)
  res.status(200).end();

  // Trigger sync in background (fire and forget)
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    fetch(`${baseUrl}/api/sync`, {
      method: "POST",
      headers: { "x-sync-secret": process.env.WEBHOOK_SECRET },
    }).catch((e) => console.error("Background sync failed:", e.message));
  } catch (e) {
    console.error("Webhook sync trigger error:", e.message);
  }
}
