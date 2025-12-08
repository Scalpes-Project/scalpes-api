import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { OpenAI } from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Client OpenAI (nouvelle lib)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Route principale SCALPES
app.post("/api/analyze", async (req, res) => {
  const { inputText } = req.body;

  // Garde-fou : pas de verdict sur 3 lignes
  if (!inputText || inputText.trim().length < 50) {
    return res.status(400).json({
      verdict: "Texte trop court. SCALPES ne tranche pas dans le vide.",
    });
  }

  try {
    const completion = await openai.chat.completions.create({
      // ✅ Ton modèle fine-tuné SCALPES_V8.3
      model: "ft:gpt-4o-mini-2024-07-18:personal:scalpes-v8-3:CiIkGsWR",
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
          content: inputText,
        },
      ],
      temperature: 0.4,
    });

    const verdict =
      completion.choices?.[0]?.message?.content ||
      "Erreur : verdict vide. SCALPES a refusé de répondre.";

    return res.json({ verdict });
  } catch (error) {
    console.error("Erreur SCALPES :", error);
    return res.status(500).json({
      verdict: "Erreur d’analyse. SCALPES a refusé de parler.",
    });
  }
});

// Démarrage local (utile si tu testes en local), ignoré par Vercel
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SCALPES API active sur le port ${PORT}`);
});

export default app;
