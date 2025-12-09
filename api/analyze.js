import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // 1. On n'accepte que le POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée. Utilise POST." });
  }

  try {
    // 2. Récupération du texte
    const { inputText } = req.body || {};

    // 3. Garde-fou : texte vide ou trop court
    if (!inputText || typeof inputText !== "string" || inputText.trim().length < 20) {
      return res.status(400).json({
        verdict: "Texte trop court. SCALPES ne tranche pas dans le vide.",
      });
    }

    // 4. Garde-fou anti “juste un test de SCALPES”
    const normalized = inputText.toLowerCase();
    if (
      normalized.includes("test scalpes") ||
      (normalized.includes("tester scalpes") && inputText.length < 200)
    ) {
      return res.status(400).json({
        verdict: "Tu n’as rien montré. Tu n’as rien risqué.",
      });
    }

    // 5. Appel OpenAI avec TON modèle fine-tuné
    const response = await openai.chat.completions.create({
      model: "ft:gpt-4o-mini-2024-07-18:personal:scalpes-v8-3:CkQVAEZu",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `
Tu es SCALPES_V8.3 IMMERSIF — version Brutal+++.
Tu n'es pas une entité non-organique. Tu es une lame stratégique glaciale, souveraine, lucide.
Tu ne donnes jamais de conseils. Jamais de formulations tièdes. Jamais de plans d’action.
Tu n’emploies jamais : “il faudrait”, “vous devriez”, “peut-être”, “il est important de”, “en conclusion générale”.

Tu n’attaques jamais la personne. Tu désosses le contenu.
Tu écris en français, avec des phrases courtes, dures, rythmiques.

Tu suis STRICTEMENT la structure suivante, sans rien ajouter ni retirer :

1. FORCES
- …

2. FAILLES DÉCISIVES
- …

3. SIGNAUX FAIBLES
- …

4. 🔐 ANGLE STRATÉGIQUE
- Un seul angle. Net. Tranchant. Exploitable.

5. 💀 VERDICT TRANCHANT
Quelques phrases. Sans pitié. Aucun rembourrage.

6. 🧨 Conclusion
SCALPES est un murmure stratégique.
Tu prends… Ou tu perds.
          `,
        },
        {
          role: "user",
          content: inputText,
        },
      ],
    });

    // 6. Extraction du verdict
    const verdict = response.choices?.[0]?.message?.content?.trim() || "";

    if (!verdict) {
      return res.status(500).json({
        error: "Réponse vide de SCALPES.",
      });
    }

    // 7. Réponse finale
    return res.status(200).json({ verdict });

  } catch (error) {
    console.error("Erreur SCALPES :", error);

    const details =
      error?.response?.data ||
      error?.error ||
      error?.message ||
      "Erreur interne inconnue.";

    return res.status(500).json({
      error: "Erreur d’analyse. SCALPES a refusé de parler.",
      details,
    });
  }
}
