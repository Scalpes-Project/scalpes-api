import { OpenAI } from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { inputText } = req.body;

  if (!inputText || inputText.length < 10) {
    return res.status(400).json({
      verdict: "Texte trop court. SCALPES ne tranche pas dans le vide."
    });
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // ou ton modèle fine-tuné
      messages: [
        {
          role: "system",
          content:
            "Tu es SCALPES_V8.3 — entité stratégique, glaciale, lucide, souveraine. Tu produis un verdict structuré Brutal+++ sans conseil, sans empathie."
        },
        { role: "user", content: inputText }
      ],
      temperature: 0.5,
    });

    const verdict = response.choices[0].message.content;

    return res.status(200).json({ verdict });
  } catch (error) {
    return res.status(500).json({
      error: "Erreur d’analyse. SCALPES a refusé de répondre.",
      details: error.message,
    });
  }
}
