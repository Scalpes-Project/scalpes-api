import { OpenAI } from "openai";

export default async function handler(req, res) {
  // 1 — Méthode HTTP
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  // 2 — Récupération du texte
  const normalized = inputText.toLowerCase();

if (
  normalized.includes("test") &&
  normalized.includes("scalpes") &&
  inputText.length < 200
) {
  return res.status(400).json({
    verdict: "Tu n’as rien montré. Tu n’as rien risqué."
  });
}

  try {
    // 3 — Initialisation du client OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // 4 — Appel à ton modèle fine-tuné
    const response = await openai.chat.completions.create({
  model: "ft:gpt-4o-mini-2024-07-18:personal:scalpes-v8-3:CiIkGsWR",
  messages: [
    {
      role: "system",
      content:
        "Tu es SCALPES_V8.3. Applique exactement ton style et ta structure appris pendant le fine-tuning. Aucune explication hors verdict."
    },
    {
      role: "user",
      content: inputText
    }
  ],
  temperature: 0.2,
});

    // 5 — Extraction du verdict
    const verdict = response.choices[0].message.content;

    return res.status(200).json({ verdict });

  } catch (err) {
    console.error("SCALPES API ERROR:", err);
    return res.status(500).json({
      verdict: "Erreur interne. SCALPES refuse de parler."
    });
  }
}
