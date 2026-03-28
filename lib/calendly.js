// Calendly integration
const BASE = "https://api.calendly.com";

async function calendlyFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.CALENDLY_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`Calendly error: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getCalendlyUser() {
  const { resource } = await calendlyFetch("/users/me");
  return resource;
}

export async function getCalendlyEvents(daysAhead = 14) {
  const user = await getCalendlyUser();
  const minStartTime = new Date().toISOString();
  const maxStartTime = new Date(Date.now() + daysAhead * 86400000).toISOString();

  const { collection } = await calendlyFetch(
    `/scheduled_events?user=${encodeURIComponent(user.uri)}&min_start_time=${minStartTime}&max_start_time=${maxStartTime}&status=active&count=100`
  );

  const events = [];
  for (const event of collection || []) {
    try {
      const inviteesData = await calendlyFetch(
        `/scheduled_events/${event.uri.split("/").pop()}/invitees`
      );
      const invitee = inviteesData.collection?.[0];

      events.push(normalizeCalendlyEvent(event, invitee));
    } catch (e) {
      events.push(normalizeCalendlyEvent(event, null));
    }
  }

  return events;
}

function normalizeCalendlyEvent(event, invitee) {
  const zoomRegex = /https:\/\/[\w.]*zoom\.us\/j\/[\w?=&]+/i;
  const meetRegex = /https:\/\/meet\.google\.com\/[\w-]+/i;

  let meetingLink = null;
  let meetingType = null;

  for (const loc of event.location ? [event.location] : []) {
    if (loc.type === "zoom" || loc.join_url?.includes("zoom")) {
      meetingLink = loc.join_url;
      meetingType = "zoom";
    } else if (loc.type === "google_conference" || loc.join_url?.includes("meet.google")) {
      meetingLink = loc.join_url;
      meetingType = "google";
    }
  }

  const personName = invitee?.name || event.name;
  const personEmail = invitee?.email;

  return {
    id: `calendly_${event.uri.split("/").pop()}`,
    sourceId: event.uri,
    source: "calendly",
    title: personName,
    originalTitle: event.name,
    startTime: event.start_time,
    endTime: event.end_time,
    meetingLink,
    meetingType,
    attendees: invitee ? [{ name: invitee.name, email: invitee.email }] : [],
    primaryPerson: invitee ? { name: invitee.name, email: invitee.email } : null,
    calendarName: "Calendly",
    calendarId: "calendly",
    eventTypeUri: event.event_type,
    calendlyUri: event.uri,
  };
}

// ─── Event types (for rescheduling links) ────────────────────────────────────

export async function getEventTypes() {
  const user = await getCalendlyUser();
  const { collection } = await calendlyFetch(
    `/event_types?user=${encodeURIComponent(user.uri)}&active=true`
  );
  return collection || [];
}

// Match a cancelled event to the right Calendly event type and return scheduling link
export async function getReschedulingLink(cancelledEventTitle, durationMinutes) {
  const eventTypes = await getEventTypes();

  // Try to match by duration or title keywords
  let matched = eventTypes.find((et) => {
    const etDuration = et.duration;
    const durationClose = Math.abs(etDuration - durationMinutes) <= 15;
    const titleMatch = cancelledEventTitle?.toLowerCase().includes(et.name?.toLowerCase().split(" ")[0]);
    return durationClose || titleMatch;
  });

  // Fall back to first active event type
  if (!matched) matched = eventTypes[0];

  return matched?.scheduling_url || null;
}

// ─── Send rescheduling email ───────────────────────────────────────────────────

export async function sendReschedulingEmail(toEmail, toName, schedulingLink, originalEventTitle) {
  // Uses Gmail API to send the email (keep it in Google ecosystem)
  const { google } = await import("googleapis");
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  const gmail = google.gmail({ version: "v1", auth });

  const subject = `Let's find a new time — ${originalEventTitle}`;
  const body = `Hi ${toName.split(" ")[0]},

Just wanted to flag that our upcoming meeting needs to be rescheduled. Apologies for the inconvenience!

You can grab a new time that works for you here:
${schedulingLink}

Looking forward to connecting soon.

Best,
Rachael`;

  const message = [
    `To: ${toEmail}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    "",
    body,
  ].join("\n");

  const encoded = Buffer.from(message).toString("base64url");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });

  return { success: true, to: toEmail, subject };
}
