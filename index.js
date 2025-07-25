import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post('/api/analyze', async (req, res) => {
  const { inputText } = req.body;

  if (!inputText || inputText.length < 10) {
    return res.status(400).json({ verdict: "Texte trop court. SCALPES ne tranche pas dans le vide." });
  }

  try {
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "Tu es SCALPES, une IA stratégique, lucide et impitoyable. Tu dis la vérité sur le contenu qu’on te soumet. Pas de conseil. Juste un verdict." },
        { role: "user", content: inputText }
      ],
      temperature: 0.5
    });

    const verdict = chatResponse.choices[0].message.content;
    res.json({ verdict });
  } catch (error) {
    res.status(500).json({ verdict: "Erreur d’analyse. SCALPES a refusé de parler." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SCALPES API active sur le port ${PORT}`));
