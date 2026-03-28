// GET /api/granola?eventId=... — fetch Granola transcript for a past meeting
// Granola doesn't have a public API yet, but their desktop app syncs with Google Calendar.
// This endpoint bridges the two by matching calendar event IDs to Granola meeting records.
//
// NOTE: Granola is working on an API — this file is structured to be easily updated
// when it becomes available. For now it returns a deep link to open the meeting in Granola.

export default async function handler(req, res) {
  const { eventId, title, startTime } = req.query;

  if (!eventId && !title) {
    return res.status(400).json({ error: "eventId or title required" });
  }

  // Granola uses Google Calendar event IDs to match meetings.
  // Their desktop app handles the recording automatically when you're in a meeting.
  // Once their API is public, this will return the full transcript.

  // For now: return a deep link that opens Granola to the right meeting
  // (Granola supports granola:// protocol links on desktop)
  const granolaLink = eventId
    ? `granola://meetings?calendarEventId=${encodeURIComponent(eventId)}`
    : `granola://meetings?search=${encodeURIComponent(title)}`;

  return res.status(200).json({
    granolaLink,
    status: "linked",
    note: "Granola auto-records all meetings synced from Google Calendar. Open the link to view the transcript in Granola.",
  });
}
