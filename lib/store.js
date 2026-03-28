// Vercel KV store — caches events and person research between requests
import { kv } from "@vercel/kv";

const EVENTS_KEY = "truth_calendar:events";
const RESEARCH_KEY = "truth_calendar:research";
const LAST_SYNC_KEY = "truth_calendar:last_sync";

// ─── Events ───────────────────────────────────────────────────────────────────

export async function getCachedEvents() {
  try {
    return (await kv.get(EVENTS_KEY)) || [];
  } catch {
    return [];
  }
}

export async function setCachedEvents(events) {
  await kv.set(EVENTS_KEY, events, { ex: 86400 }); // expire after 24h as safety net
}

export async function getLastSyncTime() {
  return kv.get(LAST_SYNC_KEY);
}

export async function setLastSyncTime() {
  await kv.set(LAST_SYNC_KEY, new Date().toISOString());
}

// ─── Person research ─────────────────────────────────────────────────────────

export async function getCachedResearch(personKey) {
  try {
    return kv.get(`${RESEARCH_KEY}:${personKey}`);
  } catch {
    return null;
  }
}

export async function setCachedResearch(personKey, data) {
  // Cache research for 7 days
  await kv.set(`${RESEARCH_KEY}:${personKey}`, data, { ex: 604800 });
}

export function getPersonKey(email, name) {
  return (email || name || "unknown").toLowerCase().replace(/[^a-z0-9]/g, "_");
}
