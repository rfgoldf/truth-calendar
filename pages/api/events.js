// GET /api/events — return cached events (fast, no re-fetching)
import { getCachedEvents, getLastSyncTime } from "../../lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const [events, lastSync] = await Promise.all([
    getCachedEvents(),
    getLastSyncTime(),
  ]);

  // Only show future events (and events starting within the last hour)
  const cutoff = new Date(Date.now() - 3600000);
  const upcoming = events.filter((e) => new Date(e.endTime) > cutoff);

  return res.status(200).json({
    events: upcoming,
    lastSync,
    count: upcoming.length,
  });
}
