import { useState, useEffect, useCallback } from "react";

// ─── Push notification registration ──────────────────────────────────────────

async function registerPushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  try {
    // Register service worker
    const reg = await navigator.serviceWorker.register("/sw.js");

    // Ask for permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    // Subscribe to push
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    });

    // Send subscription to server
    await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });
  } catch (err) {
    console.error("Push registration failed:", err);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function fmt(t) {
  if (!t) return "";
  const d = new Date(t);
  const h = d.getHours(), m = d.getMinutes();
  const ap = h >= 12 ? "pm" : "am";
  const hr = h % 12 || 12;
  return m === 0 ? `${hr}${ap}` : `${hr}:${m.toString().padStart(2,"0")}${ap}`;
}

function dur(startTime, endTime) {
  const mins = (new Date(endTime) - new Date(startTime)) / 60000;
  if (mins < 60) return `${mins}m`;
  if (mins === 60) return `1h`;
  return `${Math.floor(mins/60)}h${mins%60>0?` ${mins%60}m`:""}`;
}

function groupByDate(events) {
  return events.reduce((acc, e) => {
    const d = new Date(e.startTime).toLocaleDateString("en-CA"); // YYYY-MM-DD
    if (!acc[d]) acc[d] = [];
    acc[d].push(e);
    return acc;
  }, {});
}

function dateHeading(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  const label = d.getTime() === today.getTime() ? "Today"
    : d.getTime() === tomorrow.getTime() ? "Tomorrow"
    : DAYS_SHORT[d.getDay()];
  const sub = `${DAYS_SHORT[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return { label, sub };
}

const sourceColors = {
  "Google – Work":     { bar: "#60a5fa", badge: "#eff6ff", badgeText: "#2563eb" },
  "Google – Personal": { bar: "#4ade80", badge: "#f0fdf4", badgeText: "#16a34a" },
  "Calendly":          { bar: "#a78bfa", badge: "#f5f3ff", badgeText: "#7c3aed" },
  "Outlook":           { bar: "#fb923c", badge: "#fff7ed", badgeText: "#ea580c" },
  "Todoist":           { bar: "#f87171", badge: "#fef2f2", badgeText: "#dc2626" },
};

function calColor(source) {
  return sourceColors[source] || { bar: "#cbd5e1", badge: "#f1f5f9", badgeText: "#64748b" };
}

function Badge({ source }) {
  const c = calColor(source);
  return (
    <span style={{ background: c.badge, color: c.badgeText, fontSize: 11, padding: "2px 8px", borderRadius: 999, fontWeight: 500, whiteSpace: "nowrap" }}>
      {source}
    </span>
  );
}

function JoinBtn({ link, type }) {
  if (!link) return null;
  const isZoom = type === "zoom";
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: isZoom ? "#2563eb" : "#16a34a",
      color: "#fff", fontSize: 12, fontWeight: 500,
      padding: "5px 12px", borderRadius: 8, whiteSpace: "nowrap", textDecoration: "none",
    }}>
      <VideoIcon />
      {isZoom ? "Join Zoom" : "Join Meet"}
    </a>
  );
}

function VideoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
  );
}

function Icon({ name, size = 13, color = "#94a3b8" }) {
  const paths = {
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    globe: <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
    mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
    news: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>,
    li: <><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></>,
    refresh: <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function EventCard({ event, onClick, selected }) {
  const isTodoist = event.meetingType === "todoist";
  const c = calColor(event.calendarName);
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={() => onClick(event)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%", textAlign: "left",
        padding: "12px 14px", borderRadius: 12,
        border: selected ? "1.5px solid #cbd5e1" : "1.5px solid transparent",
        background: selected || hovered ? "#f8fafc" : "transparent",
        cursor: "pointer", transition: "all 0.12s",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: 1, minWidth: 0 }}>
        <div style={{ textAlign: "right", minWidth: 48, paddingTop: 2, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#475569" }}>{fmt(event.startTime)}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{dur(event.startTime, event.endTime)}</div>
        </div>
        <div style={{ width: 3, alignSelf: "stretch", borderRadius: 99, background: isTodoist ? "#fca5a5" : c.bar, minHeight: 36, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: isTodoist ? "#dc2626" : "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {event.title}
          </div>
          {event.subtitle && (
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {event.subtitle}
            </div>
          )}
          {event.primaryPerson && !event.subtitle && (
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
              {[event.primaryPerson.name, event.primaryPerson.email].filter(Boolean).join(" · ")}
            </div>
          )}
          <div style={{ marginTop: 8 }}><Badge source={event.calendarName} /></div>
        </div>
      </div>
      {!isTodoist && event.meetingLink && (
        <div style={{ flexShrink: 0, paddingTop: 2 }}>
          <JoinBtn link={event.meetingLink} type={event.meetingType} />
        </div>
      )}
    </button>
  );
}

function DetailPanel({ event, onClose }) {
  const [research, setResearch] = useState(null);
  const [loading, setLoading] = useState(false);
  const { primaryPerson } = event;

  useEffect(() => {
    if (!primaryPerson) return;
    setLoading(true);
    setResearch(null);

    const params = new URLSearchParams();
    if (primaryPerson.email) params.set("email", primaryPerson.email);
    if (primaryPerson.name) params.set("name", primaryPerson.name);

    fetch(`/api/research/${encodeURIComponent(primaryPerson.email || primaryPerson.name)}?${params}`)
      .then((r) => r.json())
      .then(setResearch)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [event.id]);

  const isTodoist = event.meetingType === "todoist";

  return (
    <aside style={{
      width: 320, flexShrink: 0, borderLeft: "1px solid #f1f5f9",
      overflowY: "auto", height: "100vh", position: "sticky", top: 0,
    }}>
      <div style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#1e293b" }}>
              {isTodoist ? "Todoist Focus Block" : (research?.name || event.title)}
            </div>
            {!isTodoist && (research?.company || event.primaryPerson?.name) && (
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 3 }}>
                {[research?.role, research?.company].filter(Boolean).join(" · ")}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>{fmt(event.startTime)} – {fmt(event.endTime)}</span>
              <Badge source={event.calendarName} />
            </div>
          </div>
          <button onClick={onClose} style={{ padding: 4, color: "#94a3b8", cursor: "pointer", background: "none", border: "none", marginLeft: 8 }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {event.meetingLink && <div style={{ marginBottom: 20 }}><JoinBtn link={event.meetingLink} type={event.meetingType} /></div>}

        {isTodoist && (
          <div style={{ background: "#fef2f2", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#dc2626", marginBottom: 10 }}>Tasks due today</div>
            {(event.tasks || []).map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, fontSize: 13, color: "#7f1d1d" }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#f87171", marginTop: 6, flexShrink: 0 }} />
                {t}
              </div>
            ))}
          </div>
        )}

        {!isTodoist && loading && (
          <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 16 }}>Researching…</div>
        )}

        {!isTodoist && research && (
          <>
            <div style={{ height: 1, background: "#f1f5f9", marginBottom: 20 }} />

            {[
              { icon: "globe", label: "Background", text: research.brief },
              { icon: "news", label: "Recent News", text: research.recentNews },
              { icon: "mail", label: "Email History", text: research.emailHistory },
            ].filter(({ text }) => text).map(({ icon, label, text }) => (
              <div key={label} style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <Icon name={icon} size={12} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
                </div>
                <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.65, margin: 0 }}>{text}</p>
              </div>
            ))}

            {research.linkedinUrl && (
              <>
                <div style={{ height: 1, background: "#f1f5f9", marginBottom: 16 }} />
                <a href={research.linkedinUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#2563eb", fontWeight: 500, textDecoration: "none" }}>
                  <Icon name="li" size={13} color="#2563eb" />
                  View on LinkedIn
                </a>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

export default function Home() {
  const [events, setEvents] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [selected, setSelected] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      setEvents(data.events || []);
      setLastSync(data.lastSync);
    } catch (e) {
      console.error("Failed to load events:", e);
    }
  }, []);

  const triggerSync = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch("/api/sync", {
        method: "POST",
        headers: { "x-sync-secret": "" }, // handled server-side
      });
      await loadEvents();
    } finally {
      setSyncing(false);
    }
  }, [loadEvents]);

  useEffect(() => {
    loadEvents();
    // Register push notifications on first load
    registerPushNotifications();
    // Poll every 60 seconds as a fallback (webhooks handle real-time updates)
    const interval = setInterval(loadEvents, 60000);
    return () => clearInterval(interval);
  }, [loadEvents]);

  const grouped = groupByDate(events);
  const dates = Object.keys(grouped).sort();
  const meetingCount = events.filter((e) => e.meetingType !== "todoist").length;
  const today = new Date();

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#fff", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, flexShrink: 0, borderRight: "1px solid #f1f5f9",
        padding: "24px 16px", display: "flex", flexDirection: "column", gap: 24,
        position: "sticky", top: 0, height: "100vh", overflowY: "auto",
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b" }}>Truth Calendar</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Rachael Goldfarb</div>
        </div>

        {/* Mini calendar */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {MONTHS[today.getMonth()]} {today.getFullYear()}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px 0", textAlign: "center" }}>
            {["S","M","T","W","T","F","S"].map((d,i) => (
              <div key={i} style={{ fontSize: 10, color: "#cbd5e1", paddingBottom: 4 }}>{d}</div>
            ))}
            {Array.from({ length: new Date(today.getFullYear(), today.getMonth(), 1).getDay() }, (_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {Array.from({ length: new Date(today.getFullYear(), today.getMonth()+1, 0).getDate() }, (_, i) => i+1).map(day => (
              <button key={day} style={{
                fontSize: 11, width: 24, height: 24, margin: "0 auto", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: day === today.getDate() ? "#1e293b" : "transparent",
                color: day === today.getDate() ? "#fff" : "#94a3b8",
                fontWeight: day === today.getDate() ? 600 : 400,
                cursor: "default", border: "none",
              }}>{day}</button>
            ))}
          </div>
        </div>

        {/* Calendar legend */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Calendars
          </div>
          {Object.entries(sourceColors).map(([name, c]) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: c.bar, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "#475569" }}>{name}</span>
            </div>
          ))}
        </div>

        {/* Sync status */}
        <div style={{ marginTop: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 11, color: "#94a3b8" }}>Live sync</span>
          </div>
          {lastSync && (
            <div style={{ fontSize: 11, color: "#cbd5e1" }}>
              Last sync: {new Date(lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
          <button
            onClick={triggerSync}
            disabled={syncing}
            style={{
              marginTop: 8, display: "flex", alignItems: "center", gap: 5,
              fontSize: 11, color: syncing ? "#cbd5e1" : "#94a3b8",
              background: "none", border: "none", cursor: syncing ? "not-allowed" : "pointer", padding: 0,
            }}
          >
            <Icon name="refresh" size={11} color={syncing ? "#cbd5e1" : "#94a3b8"} />
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        <div style={{ maxWidth: 660, margin: "0 auto", padding: "32px 32px" }}>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: "#1e293b" }}>Upcoming</h1>
            <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 3 }}>
              {dates.length} days · {meetingCount} meetings
            </p>
          </div>

          {events.length === 0 ? (
            <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 14, marginTop: 60 }}>
              <div style={{ marginBottom: 12 }}>No upcoming events</div>
              <button onClick={triggerSync} style={{ fontSize: 13, color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}>
                Sync calendars
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              {dates.map(date => {
                const { label, sub } = dateHeading(date);
                return (
                  <div key={date}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                      <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1e293b" }}>{label}</h2>
                      <span style={{ fontSize: 13, color: "#94a3b8" }}>{sub}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {grouped[date].map(event => (
                        <EventCard
                          key={event.id}
                          event={event}
                          onClick={setSelected}
                          selected={selected?.id === event.id}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {selected && <DetailPanel event={selected} onClose={() => setSelected(null)} />}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
      `}</style>
    </div>
  );
}
