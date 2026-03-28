// Person research: web search + LinkedIn + email history
import { searchEmailHistory } from "./google.js";

const SERPER_URL = "https://google.serper.dev/search";

async function webSearch(query) {
  const res = await fetch(SERPER_URL, {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 5 }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.organic || [];
}

async function searchNews(query) {
  const res = await fetch(SERPER_URL, {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 3, type: "news" }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.news || [];
}

// ─── Main research function ────────────────────────────────────────────────────

export async function researchPerson({ name, email, company }) {
  if (!name && !email) return null;

  const searchName = name || email.split("@")[0].replace(/[._]/g, " ");
  const searchCompany = company || (email ? email.split("@")[1]?.replace(/\.(com|org|io|co)$/, "") : "");

  const queries = {
    professional: `${searchName} ${searchCompany} site:linkedin.com OR site:crunchbase.com`,
    background: `"${searchName}" ${searchCompany} CEO founder executive`,
    news: `"${searchName}" OR "${searchCompany}" news 2025 2026`,
  };

  const [professionalResults, backgroundResults, newsResults, emailHistory] = await Promise.allSettled([
    webSearch(queries.professional),
    webSearch(queries.background),
    searchNews(queries.news),
    email ? searchEmailHistory(email, searchName) : Promise.resolve(null),
  ]);

  const professional = professionalResults.status === "fulfilled" ? professionalResults.value : [];
  const background = backgroundResults.status === "fulfilled" ? backgroundResults.value : [];
  const news = newsResults.status === "fulfilled" ? newsResults.value : [];
  const emailHistorySummary = emailHistory.status === "fulfilled" ? emailHistory.value : null;

  // Extract LinkedIn URL
  const linkedinResult = professional.find((r) => r.link?.includes("linkedin.com/in/"));
  const linkedinUrl = linkedinResult?.link || null;

  // Extract role/company from LinkedIn snippet
  let roleFromLinkedIn = null;
  if (linkedinResult?.snippet) {
    const match = linkedinResult.snippet.match(/^([^·•]+)[·•]/);
    if (match) roleFromLinkedIn = match[1].trim();
  }

  // Compile background summary
  const backgroundSnippets = background
    .filter((r) => r.snippet && !r.link?.includes("linkedin.com"))
    .slice(0, 3)
    .map((r) => r.snippet);

  // Compile news
  const newsItems = news.slice(0, 2).map((r) => ({
    title: r.title,
    snippet: r.snippet?.slice(0, 150),
    date: r.date,
    link: r.link,
  }));

  // Build the brief (2-3 sentence summary)
  const briefParts = [];

  if (roleFromLinkedIn) briefParts.push(roleFromLinkedIn);
  if (backgroundSnippets.length) {
    // Take the most informative snippet
    const best = backgroundSnippets.reduce((a, b) => (b.length > a.length ? b : a), "");
    briefParts.push(best.slice(0, 200));
  }

  const brief = briefParts.join(" ").replace(/\s+/g, " ").trim() || "No public background found.";

  // Recent news summary
  const recentNews = newsItems.length
    ? newsItems.map((n) => `${n.title}${n.date ? ` (${n.date})` : ""}: ${n.snippet}`).join(" · ")
    : null;

  return {
    name: searchName,
    email,
    company: searchCompany,
    linkedinUrl,
    brief,
    recentNews,
    emailHistory: emailHistorySummary,
    researchedAt: new Date().toISOString(),
  };
}
