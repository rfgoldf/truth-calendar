// POST /api/webhooks/gmail
// Receives Gmail push notifications via Google Pub/Sub
// When a new email arrives, checks for cancellations and auto-sends Calendly links
import { checkForCancellations } from "../../../lib/google.js";
import { getCachedEvents } from "../../../lib/store.js";
import { getReschedulingLink, sendReschedulingEmail } from "../../../lib/calendly.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // Pub/Sub sends base64-encoded message data
  let message;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const data = Buffer.from(body.message?.data || "", "base64").toString();
    message = JSON.parse(data);
  } catch {
    // Still acknowledge — malformed messages shouldn't cause retries
    return res.status(200).end();
  }

  // Acknowledge immediately
  res.status(200).end();

  try {
    // Check for cancellation/reschedule signals in recent emails
    const cancellations = await checkForCancellations();

    if (!cancellations.length) return;

    const events = await getCachedEvents();

    for (const cancellation of cancellations) {
      // Try to match this cancellation to an upcoming event
      const matchedEvent = findMatchingEvent(events, cancellation);

      if (!matchedEvent) {
        console.log(`No matching event found for cancellation from ${cancellation.fromEmail}`);
        continue;
      }

      // Get the right Calendly link based on the meeting's duration
      const durationMs = new Date(matchedEvent.endTime) - new Date(matchedEvent.startTime);
      const durationMinutes = durationMs / 60000;

      const schedulingLink = await getReschedulingLink(
        matchedEvent.originalTitle,
        durationMinutes
      );

      if (!schedulingLink) {
        console.log("No matching Calendly event type found");
        continue;
      }

      // Send the rescheduling email
      await sendReschedulingEmail(
        cancellation.fromEmail,
        cancellation.fromName,
        schedulingLink,
        matchedEvent.originalTitle || matchedEvent.title
      );

      console.log(`Rescheduling email sent to ${cancellation.fromEmail} for "${matchedEvent.title}"`);
    }
  } catch (err) {
    console.error("Gmail webhook processing error:", err.message);
  }
}

function findMatchingEvent(events, cancellation) {
  const fromEmail = cancellation.fromEmail?.toLowerCase();
  const subject = cancellation.subject?.toLowerCase() || "";

  return events.find((event) => {
    // Match by attendee email
    const attendeeEmails = (event.attendees || []).map((a) => a.email?.toLowerCase());
    if (attendeeEmails.includes(fromEmail)) return true;

    // Match by name in subject line
    const personName = event.primaryPerson?.name?.toLowerCase();
    if (personName && subject.includes(personName.split(" ")[0])) return true;

    return false;
  });
}
