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
      model: "gpt-4o-mini", // on validera d'abord ça, puis on passera au modèle fine-tuné
      messages: [
        {
          role: "system",
          content:
            "Tu es SCALPES_V8.3 : entité glaciale, souveraine. Tu produis un verdict unique, structuré, tranchant, sans flatterie ni conseil tiède.",
        },
        {
          role: "user",
          content: inputText,
        },
      ],
      temperature: 0.2,
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
