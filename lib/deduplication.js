// Deduplication logic: merges events from Google, Outlook, and Calendly
// into one clean list with no copies

import { parseISO, differenceInMinutes } from "date-fns";

const TIME_WINDOW_MINUTES = 30; // events within 30 min of each other are candidates

export function deduplicateEvents(events) {
  if (!events.length) return [];

  // Sort by start time
  const sorted = [...events].sort(
    (a, b) => new Date(a.startTime) - new Date(b.startTime)
  );

  const kept = [];
  const skip = new Set();

  for (let i = 0; i < sorted.length; i++) {
    if (skip.has(i)) continue;

    const base = sorted[i];
    const duplicates = [base];

    for (let j = i + 1; j < sorted.length; j++) {
      if (skip.has(j)) continue;
      const candidate = sorted[j];

      if (isDuplicate(base, candidate)) {
        duplicates.push(candidate);
        skip.add(j);
      }
    }

    // Merge duplicates: prefer Google source, then Calendly, then Outlook
    const merged = mergeDuplicates(duplicates);
    kept.push(merged);
  }

  return kept;
}

function isDuplicate(a, b) {
  const aStart = parseISO(a.startTime);
  const bStart = parseISO(b.startTime);

  // Must be within TIME_WINDOW_MINUTES of each other
  if (Math.abs(differenceInMinutes(aStart, bStart)) > TIME_WINDOW_MINUTES) return false;

  // Check title similarity
  if (titlesMatch(a.originalTitle, b.originalTitle)) return true;

  // Check attendee email overlap
  const aEmails = new Set((a.attendees || []).map((att) => att.email?.toLowerCase()).filter(Boolean));
  const bEmails = (b.attendees || []).map((att) => att.email?.toLowerCase()).filter(Boolean);
  const overlap = bEmails.filter((e) => aEmails.has(e));
  if (overlap.length > 0) return true;

  // Check meeting link match
  if (a.meetingLink && b.meetingLink && a.meetingLink === b.meetingLink) return true;

  return false;
}

function titlesMatch(a, b) {
  if (!a || !b) return false;
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  // One contains the other (handles truncation)
  if (na.length > 5 && (nb.includes(na) || na.includes(nb))) return true;
  return false;
}

function mergeDuplicates(duplicates) {
  // Priority: google > calendly > outlook
  const priority = { google: 0, calendly: 1, outlook: 2 };
  const sorted = [...duplicates].sort(
    (a, b) => (priority[a.source] ?? 99) - (priority[b.source] ?? 99)
  );

  const primary = sorted[0];

  // Fill in missing fields from other sources
  const meetingLink =
    primary.meetingLink ||
    sorted.find((e) => e.meetingLink)?.meetingLink ||
    null;

  const meetingType =
    primary.meetingType ||
    sorted.find((e) => e.meetingType)?.meetingType ||
    null;

  const primaryPerson =
    primary.primaryPerson ||
    sorted.find((e) => e.primaryPerson)?.primaryPerson ||
    null;

  // Collect all calendar names for display
  const calendarSources = [...new Set(sorted.map((e) => e.calendarName).filter(Boolean))];

  return {
    ...primary,
    meetingLink,
    meetingType,
    primaryPerson,
    calendarName: calendarSources[0] || primary.calendarName,
    calendarSources,
    isDeduplicated: duplicates.length > 1,
    sourceCount: duplicates.length,
  };
}
