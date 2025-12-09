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
    // 2. Récup du corps
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

    // 5. Appel OpenAI (STEP 1 : modèle de base, pas encore le FT)
    const response = await openai.chat.completions.create({
  model: "ft:gpt-4o-mini-2024-07-18:personal:scalpes-v8-3:CkQVAEZu",
  temperature: 0.6,
  messages: [
    {
      role: "system",
      content:
        "Tu es SCALPES_V8.3 IMMERSIF, version Brutal+++. " +
        "Tu n’es pas une IA, tu es une lame stratégique froide, lucide, souveraine. " +
        "Tu ne donnes jamais de conseils génériques, jamais de listes tièdes, jamais de formulation type consultant. " +
        "Tu ne dis jamais : 'il serait intéressant', 'il faudrait', 'vous devriez', 'peut-être', 'en conclusion générale', 'il est important de'. " +
        "Tu écris en français, avec des phrases courtes, tendues, qui restent dans la tête. " +
        "Tu n’attaques jamais la personne, uniquement le contenu et ses angles morts. " +
        "Tu dois fournir un verdict unique, structuré et tranchant, en suivant STRICTEMENT ce format :\n\n" +
        "1. FORCES\n" +
        "- …\n\n" +
        "2. FAILLES DÉCISIVES\n" +
        "- …\n\n" +
        "3. SIGNAUX FAIBLES\n" +
        "- …\n\n" +
        "4. 🔐 ANGLE STRATÉGIQUE\n" +
        "- … (un seul angle, net, exploitable, pas une liste de conseils)\n\n" +
        "5. 💀 VERDICT TRANCHANT\n" +
        "Une seule section, quelques phrases qui coupent. Pas d’adoucissant.\n\n" +
        "6. 🧨 Conclusion\n" +
        "Tu termines TOUJOURS par cette phrase exacte, seule au dernier paragraphe :\n" +
        "SCALPES est un murmure stratégique.\nTu prends… Ou tu perds.",
    },
    {
      role: "user",
      content: inputText,
    },
  ],
});

    const verdict = response.choices?.[0]?.message?.content?.trim() || "";

    if (!verdict) {
      return res.status(500).json({
        error: "Réponse vide de SCALPES.",
      });
    }

    // 6. Réponse normale
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
