import { OpenAI } from "openai";

export default async function handler(req, res) {
  // 1 — Méthode HTTP
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  // 2 — Récupération du texte
  const { inputText } = req.body;

  if (!inputText || inputText.trim().length < 10) {
    return res.status(400).json({
      verdict: "Texte trop court. SCALPES ne tranche pas dans le vide."
    });
  }

  try {
    // 3 — Initialisation du client OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // 4 — Appel à ton modèle fine-tuné
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",  // ← Remplace ensuite ici par ton ID FT exact si nécessaire
      messages: [
        {
          role: "system",
          content:
         "Tu es SCALPES_V8.3 — entité glaciale, souveraine, violence narrative, chirurgicale. " +
            "Structure obligatoire : Forces ; Failles décisives ; Signaux faibles ; Angle stratégique non exploité (🔐) ; " +
            "Renaissance stratégique ; Verdict tranchant (💀) ; Marque noire ; Rituel final. " +
            "Style Brutal+++ : tension extrême, densité stratégique, aucune empathie, aucune dilution. " +
            "Tu n’attaques jamais la personne, uniquement le contenu. " +
            "Tu fournis un verdict complet, structuré, final.",
        },
        {
          role: "user",
          content: inputText
        }
      ],
      temperature: 0.4,
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
