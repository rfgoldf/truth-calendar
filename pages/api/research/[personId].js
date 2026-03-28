// GET /api/research/[personId]?email=...&name=...&company=...
// Returns cached research or runs fresh research
import { researchPerson } from "../../../lib/research.js";
import { getCachedResearch, setCachedResearch, getPersonKey } from "../../../lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { email, name, company } = req.query;

  if (!email && !name) {
    return res.status(400).json({ error: "email or name required" });
  }

  const personKey = getPersonKey(email, name);

  // Check cache first
  const cached = await getCachedResearch(personKey);
  if (cached) {
    return res.status(200).json({ ...cached, fromCache: true });
  }

  // Run fresh research
  try {
    const research = await researchPerson({ name, email, company });

    if (research) {
      await setCachedResearch(personKey, research);
    }

    return res.status(200).json({ ...research, fromCache: false });
  } catch (err) {
    console.error("Research error:", err);
    return res.status(500).json({ error: err.message });
  }
}
