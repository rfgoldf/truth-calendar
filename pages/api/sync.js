// POST /api/sync — pull all calendars, deduplicate, cache, schedule focus block
import { getEventsFromAllCalendars } from "../../lib/google.js";
import { getOutlookEvents } from "../../lib/outlook.js";
import { getCalendlyEvents } from "../../lib/calendly.js";
import { deduplicateEvents } from "../../lib/deduplication.js";
import { scheduleFocusBlock } from "../../lib/todoist.js";
import { setCachedEvents, setLastSyncTime } from "../../lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // Optional: require a secret header for security
  const authHeader = req.headers["x-sync-secret"];
  if (process.env.WEBHOOK_SECRET && authHeader !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log("Starting calendar sync...");

    // Fetch from all sources in parallel
    const [googleEvents, outlookEvents, calendlyEvents] = await Promise.allSettled([
      getEventsFromAllCalendars(21),
      getOutlookEvents(21),
      getCalendlyEvents(21),
    ]);

    const allEvents = [
      ...(googleEvents.status === "fulfilled" ? googleEvents.value : []),
      ...(outlookEvents.status === "fulfilled" ? outlookEvents.value : []),
      ...(calendlyEvents.status === "fulfilled" ? calendlyEvents.value : []),
    ];

    console.log(`Fetched ${allEvents.length} raw events`);

    // Deduplicate
    const deduplicated = deduplicateEvents(allEvents);
    console.log(`After deduplication: ${deduplicated.length} events`);

    // Schedule Todoist focus block (finds open slot and creates calendar event)
    let focusBlock = null;
    try {
      focusBlock = await scheduleFocusBlock(deduplicated);
      if (focusBlock) {
        // Add focus block to the deduplicated list, removing any old one
        const withoutOldBlock = deduplicated.filter((e) => e.title !== "Todoist Focus Block");
        withoutOldBlock.push(focusBlock);
        withoutOldBlock.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        await setCachedEvents(withoutOldBlock);
      } else {
        await setCachedEvents(deduplicated);
      }
    } catch (e) {
      console.error("Focus block scheduling failed:", e.message);
      await setCachedEvents(deduplicated);
    }

    await setLastSyncTime();

    return res.status(200).json({
      ok: true,
      eventCount: deduplicated.length,
      focusBlockScheduled: !!focusBlock,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Sync failed:", err);
    return res.status(500).json({ error: err.message });
  }
}
