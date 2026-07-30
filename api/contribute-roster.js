import { neon } from "@neondatabase/serverless";

const rarities = new Set(["legendary", "epic", "rare"]);

function integer(value, minimum, maximum, fallback) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function cleanRoster(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw new Error("Roster must contain 1 to 50 dragons");
  return value.map((dragon) => {
    const name = String(dragon?.name || "").trim().slice(0, 60);
    if (!name) throw new Error("Every dragon needs a name");
    const rarity = rarities.has(dragon?.rarity) ? dragon.rarity : "rare";
    const stars = integer(dragon?.stars, 1, 10, 1);
    const unlocked = Math.floor(stars / 2);
    return {
      name,
      rarity,
      power: integer(dragon?.power, 0, 10000000, 0),
      stars,
      level: integer(dragon?.level, 1, 100, 1),
      habitRanks: Array.isArray(dragon?.habitRanks) ? dragon.habitRanks.slice(0, unlocked).map((rank) => integer(rank, 1, 5, 1)) : [],
      estimatedPower: Boolean(dragon?.estimatedPower),
    };
  });
}

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "POST required" });
  if (!process.env.DATABASE_URL) return response.status(503).json({ error: "Community data collection is not connected yet" });
  try {
    const contentLength = Number(request.headers?.["content-length"] || 0);
    if (contentLength > 30000) return response.status(413).json({ error: "Contribution is too large" });
    const origin = request.headers?.origin;
    const host = request.headers?.host;
    if (origin && host && new URL(origin).host !== host) return response.status(403).json({ error: "Cross-site contributions are not accepted" });
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
    const roster = cleanRoster(body.roster);
    const modelVersion = String(body.modelVersion || "unknown").slice(0, 30);
    const consentVersion = String(body.consentVersion || "unknown").slice(0, 30);
    const sql = neon(process.env.DATABASE_URL);
    await sql`INSERT INTO roster_contributions (model_version, consent_version, roster) VALUES (${modelVersion}, ${consentVersion}, ${JSON.stringify(roster)}::jsonb)`;
    response.setHeader("Cache-Control", "no-store");
    return response.status(201).json({ ok: true });
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : "Invalid contribution" });
  }
}
