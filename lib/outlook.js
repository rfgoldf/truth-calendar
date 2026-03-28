// Microsoft Outlook integration via Microsoft Graph API
import { ConfidentialClientApplication } from "@azure/msal-node";

const msalConfig = {
  auth: {
    clientId: process.env.OUTLOOK_CLIENT_ID,
    clientSecret: process.env.OUTLOOK_CLIENT_SECRET,
    authority: `https://login.microsoftonline.com/${process.env.OUTLOOK_TENANT_ID}`,
  },
};

async function getAccessToken() {
  const cca = new ConfidentialClientApplication(msalConfig);
  const result = await cca.acquireTokenByRefreshToken({
    refreshToken: process.env.OUTLOOK_REFRESH_TOKEN,
    scopes: ["https://graph.microsoft.com/Calendars.Read", "https://graph.microsoft.com/Mail.Read"],
  });
  return result.accessToken;
}

async function graphRequest(endpoint, token) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Graph API error: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getOutlookEvents(daysAhead = 14) {
  if (!process.env.OUTLOOK_REFRESH_TOKEN) return [];

  try {
    const token = await getAccessToken();
    const start = new Date().toISOString();
    const end = new Date(Date.now() + daysAhead * 86400000).toISOString();

    const data = await graphRequest(
      `/me/calendarView?startDateTime=${start}&endDateTime=${end}&$top=100&$orderby=start/dateTime&$select=id,subject,start,end,location,body,attendees,onlineMeeting,webLink`,
      token
    );

    return (data.value || []).map(normalizeOutlookEvent);
  } catch (err) {
    console.error("Outlook fetch error:", err.message);
    return [];
  }
}

function normalizeOutlookEvent(event) {
  // Extract meeting link
  let meetingLink = event.onlineMeeting?.joinUrl || null;
  let meetingType = meetingLink ? "teams" : null;

  const zoomRegex = /https:\/\/[\w.]*zoom\.us\/j\/[\w?=&]+/i;
  const meetRegex = /https:\/\/meet\.google\.com\/[\w-]+/i;
  const bodyText = event.body?.content || "";

  const zoomMatch = bodyText.match(zoomRegex);
  const meetMatch = bodyText.match(meetRegex);

  if (zoomMatch) { meetingLink = zoomMatch[0]; meetingType = "zoom"; }
  else if (meetMatch) { meetingLink = meetMatch[0]; meetingType = "google"; }

  const attendees = (event.attendees || [])
    .filter((a) => a.type !== "required" || !a.emailAddress?.address?.endsWith("@outlook.com"))
    .map((a) => ({ name: a.emailAddress?.name, email: a.emailAddress?.address }));

  const primaryPerson = attendees[0] || null;

  return {
    id: `outlook_${event.id}`,
    sourceId: event.id,
    source: "outlook",
    title: primaryPerson?.name || event.subject || "Untitled",
    originalTitle: event.subject,
    startTime: event.start?.dateTime ? `${event.start.dateTime}Z` : event.start?.dateTime,
    endTime: event.end?.dateTime ? `${event.end.dateTime}Z` : event.end?.dateTime,
    meetingLink,
    meetingType,
    attendees,
    primaryPerson,
    calendarName: "Outlook",
    calendarId: "outlook",
    description: event.body?.content,
    location: event.location?.displayName,
  };
}
