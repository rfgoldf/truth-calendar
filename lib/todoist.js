// Todoist integration: fetch due tasks + schedule a daily 1-hour focus block
import { google } from "googleapis";
import { format, parseISO, addHours, isBefore, isAfter, setHours, setMinutes } from "date-fns";

const TODOIST_BASE = "https://api.todoist.com/rest/v2";
const FOCUS_BLOCK_TITLE = "Todoist Focus Block";
const FOCUS_BLOCK_DURATION_HOURS = 1;

// Working hours window for the focus block
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;

async function todoistFetch(path, options = {}) {
  const res = await fetch(`${TODOIST_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.TODOIST_API_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`Todoist error: ${res.status}`);
  return res.json();
}

export async function getTodaysTasks() {
  const today = format(new Date(), "yyyy-MM-dd");
  const tasks = await todoistFetch(`/tasks?filter=due:${today}|overdue`);
  return tasks;
}

// ─── Find a free slot in Google Calendar ──────────────────────────────────────

async function findFreeSlot(existingEvents, targetDate) {
  const dayStart = setHours(setMinutes(new Date(targetDate), 0), WORK_START_HOUR);
  const dayEnd = setHours(setMinutes(new Date(targetDate), 0), WORK_END_HOUR);

  // Get events on this day, sorted by start time
  const dayEvents = existingEvents
    .filter((e) => {
      const start = parseISO(e.startTime);
      return (
        start >= dayStart &&
        start < dayEnd &&
        e.title !== FOCUS_BLOCK_TITLE // ignore existing focus blocks
      );
    })
    .sort((a, b) => parseISO(a.startTime) - parseISO(b.startTime));

  // Try slots in order: between meetings, then at day start
  const candidates = [dayStart];

  for (const event of dayEvents) {
    const endTime = parseISO(event.endTime);
    candidates.push(addHours(endTime, 0)); // right after each meeting
  }

  for (const slot of candidates) {
    const slotEnd = addHours(slot, FOCUS_BLOCK_DURATION_HOURS);

    // Must end before work day ends
    if (isAfter(slotEnd, dayEnd)) continue;

    // Must not overlap any existing event
    const conflicts = dayEvents.filter((e) => {
      const eStart = parseISO(e.startTime);
      const eEnd = parseISO(e.endTime);
      return !(slotEnd <= eStart || slot >= eEnd);
    });

    if (!conflicts.length) return { start: slot, end: slotEnd };
  }

  return null; // no free slot found today
}

// ─── Create or update today's focus block ────────────────────────────────────

export async function scheduleFocusBlock(existingEvents) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: "v3", auth });

  const today = new Date();
  const slot = await findFreeSlot(existingEvents, today);

  if (!slot) {
    console.log("No free slot found today for focus block");
    return null;
  }

  // Check if a focus block already exists today and delete it first
  const existingBlock = existingEvents.find(
    (e) => e.title === FOCUS_BLOCK_TITLE && e.source === "google"
  );

  if (existingBlock?.sourceId) {
    try {
      await calendar.events.delete({
        calendarId: "primary",
        eventId: existingBlock.sourceId,
      });
    } catch (e) {
      console.error("Could not delete old focus block:", e.message);
    }
  }

  // Create the new focus block
  const { data } = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: FOCUS_BLOCK_TITLE,
      description: "Focus time — do not book",
      start: { dateTime: slot.start.toISOString() },
      end: { dateTime: slot.end.toISOString() },
      colorId: "11", // Tomato red
    },
  });

  return {
    id: `google_${data.id}`,
    sourceId: data.id,
    source: "google",
    title: FOCUS_BLOCK_TITLE,
    startTime: slot.start.toISOString(),
    endTime: slot.end.toISOString(),
    meetingLink: null,
    meetingType: "todoist",
    calendarName: "Todoist",
    calendarId: "primary",
  };
}
