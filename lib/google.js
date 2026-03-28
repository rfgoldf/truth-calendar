// Google Calendar + Gmail integration
import { google } from "googleapis";

function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return client;
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export async function getAllCalendars() {
  const auth = getOAuthClient();
  const calendar = google.calendar({ version: "v3", auth });
  const { data } = await calendar.calendarList.list();
  return data.items || [];
}

export async function getEventsFromAllCalendars(daysAhead = 14) {
  const auth = getOAuthClient();
  const calendar = google.calendar({ version: "v3", auth });

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + daysAhead * 86400000).toISOString();

  const calendars = await getAllCalendars();
  const allEvents = [];

  for (const cal of calendars) {
    try {
      const { data } = await calendar.events.list({
        calendarId: cal.id,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 100,
      });

      const events = (data.items || [])
        .filter((e) => {
          // Skip cancelled events
          if (e.status === "cancelled") return false;
          // Skip events with no title, no external attendees, and no meeting link
          const hasTitle = !!(e.summary && e.summary.trim());
          const hasExternalAttendees = (e.attendees || []).some((a) => !a.self);
          const hasConference = !!(e.conferenceData || e.location);
          return hasTitle || hasExternalAttendees || hasConference;
        })
        .map((e) => ({
          ...normalizeGoogleEvent(e),
          calendarName: cal.summary,
          calendarId: cal.id,
        }));

      allEvents.push(...events);
    } catch (err) {
      console.error(`Failed to fetch events from ${cal.summary}:`, err.message);
    }
  }

  return allEvents;
}

function normalizeGoogleEvent(event) {
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;

  // Extract meeting link from location, description, or conferenceData
  let meetingLink = null;
  let meetingType = null;

  const zoomRegex = /https:\/\/[\w.]*zoom\.us\/j\/[\w?=&]+/i;
  const meetRegex = /https:\/\/meet\.google\.com\/[\w-]+/i;

  const searchText = [
    event.location || "",
    event.description || "",
    event.conferenceData?.entryPoints?.map((ep) => ep.uri).join(" ") || "",
  ].join(" ");

  const zoomMatch = searchText.match(zoomRegex);
  const meetMatch = searchText.match(meetRegex);

  if (zoomMatch) {
    meetingLink = zoomMatch[0];
    meetingType = "zoom";
  } else if (event.conferenceData?.conferenceSolution?.name?.includes("Meet") || meetMatch) {
    meetingLink = meetMatch?.[0] || event.conferenceData?.entryPoints?.[0]?.uri;
    meetingType = "google";
  }

  // Extract attendees (excluding self)
  const attendees = (event.attendees || [])
    .filter((a) => !a.self)
    .map((a) => ({ name: a.displayName || a.email, email: a.email }));

  const primaryPerson = attendees[0] || null;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const rawTitle = event.summary || "";
  const titleIsEmail = emailRegex.test(rawTitle.trim());
  const displayTitle = titleIsEmail
    ? (primaryPerson?.name && !emailRegex.test(primaryPerson.name) ? primaryPerson.name : rawTitle)
    : (rawTitle || primaryPerson?.name || "(No title)");

  return {
    id: `google_${event.id}`,
    sourceId: event.id,
    source: "google",
    title: displayTitle,
    originalTitle: event.summary,
    startTime: start,
    endTime: end,
    meetingLink,
    meetingType,
    attendees,
    primaryPerson,
    description: event.description,
    location: event.location,
    status: event.status,
    htmlLink: event.htmlLink,
  };
}

// ─── Register webhook (push notifications) ────────────────────────────────────

export async function registerCalendarWebhook(calendarId = "primary") {
  const auth = getOAuthClient();
  const calendar = google.calendar({ version: "v3", auth });
  const channelId = `truth-cal-${calendarId}-${Date.now()}`;

  const { data } = await calendar.events.watch({
    calendarId,
    requestBody: {
      id: channelId,
      type: "web_hook",
      address: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/google-calendar`,
      token: process.env.WEBHOOK_SECRET,
      expiration: String(Date.now() + 7 * 86400000), // 7 days
    },
  });

  return data;
}

// ─── Gmail ─────────────────────────────────────────────────────────────────────

export async function searchEmailHistory(email, name) {
  const auth = getOAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  const queries = [`from:${email}`, `to:${email}`];
  const threads = [];

  for (const q of queries) {
    try {
      const { data } = await gmail.users.threads.list({
        userId: "me",
        q,
        maxResults: 10,
      });
      if (data.threads) threads.push(...data.threads);
    } catch (e) {
      console.error("Gmail search error:", e.message);
    }
  }

  // Deduplicate threads
  const seen = new Set();
  const uniqueThreads = threads.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  if (!uniqueThreads.length) return "No prior email history found.";

  // Get snippets from the most recent 3 threads
  const recent = uniqueThreads.slice(0, 3);
  const summaries = [];

  for (const thread of recent) {
    try {
      const { data } = await gmail.users.threads.get({
        userId: "me",
        id: thread.id,
        format: "metadata",
        metadataHeaders: ["Subject", "Date", "From"],
      });

      const msg = data.messages?.[0];
      const subject = msg?.payload?.headers?.find((h) => h.name === "Subject")?.value;
      const date = msg?.payload?.headers?.find((h) => h.name === "Date")?.value;
      const snippet = data.messages?.[data.messages.length - 1]?.snippet;

      if (subject) {
        summaries.push({
          subject,
          date: date ? new Date(date).toLocaleDateString() : "Unknown date",
          snippet: snippet?.slice(0, 120),
          messageCount: data.messages?.length || 1,
        });
      }
    } catch (e) {
      console.error("Thread fetch error:", e.message);
    }
  }

  if (!summaries.length) return "No email history could be retrieved.";

  const count = uniqueThreads.length;
  const latest = summaries[0];
  return `${count} thread${count > 1 ? "s" : ""} total. Most recent: "${latest.subject}" (${latest.date}, ${latest.messageCount} message${latest.messageCount > 1 ? "s" : ""}). Last note: "${latest.snippet}…"`;
}

// ─── Detect cancellations ──────────────────────────────────────────────────────

export async function checkForCancellations() {
  const auth = getOAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  const since = new Date(Date.now() - 3600000).toISOString(); // last 1 hour
  const query = `(subject:cancel OR subject:reschedule OR subject:"can't make it" OR subject:"need to reschedule") after:${Math.floor((Date.now() - 3600000) / 1000)}`;

  const { data } = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 20,
  });

  if (!data.messages?.length) return [];

  const cancellations = [];

  for (const msg of data.messages) {
    const { data: full } = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "Date"],
    });

    const subject = full.payload?.headers?.find((h) => h.name === "Subject")?.value || "";
    const from = full.payload?.headers?.find((h) => h.name === "From")?.value || "";
    const emailMatch = from.match(/[\w.+-]+@[\w-]+\.[\w.]+/);

    if (emailMatch) {
      cancellations.push({
        messageId: msg.id,
        subject,
        fromEmail: emailMatch[0],
        fromName: from.replace(/<.*>/, "").trim(),
        snippet: full.snippet,
      });
    }
  }

  return cancellations;
}

// ─── Register Gmail push notifications ────────────────────────────────────────

export async function registerGmailWebhook() {
  const auth = getOAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  // Requires a Pub/Sub topic set up in Google Cloud
  const { data } = await gmail.users.watch({
    userId: "me",
    requestBody: {
      labelIds: ["INBOX"],
      topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT}/topics/gmail-notifications`,
    },
  });

  return data;
}
