import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée. Utilise POST." });
  }

  try {
    const { inputText } = req.body || {};

    // Garde-fous (inchangés, ils sont très bien)
    if (!inputText || typeof inputText !== "string" || inputText.trim().length < 20) {
      return res.status(400).json({ verdict: "Texte trop court. SCALPES ne tranche pas dans le vide." });
    }

    const normalized = inputText.toLowerCase();
    if (normalized.includes("test scalpes") || (normalized.includes("tester scalpes") && inputText.length < 200)) {
      return res.status(400).json({ verdict: "Tu n’as rien montré. Tu n’as rien risqué." });
    }

    // --- CORRECTION MAJEURE ICI ---
    const response = await openai.chat.completions.create({
      model: "ft:gpt-4o-mini-2024-07-18:personal:scalpes-v8-3:CkQVAEZu", // Ton modèle FT
      temperature: 0.7, // <--- ON LIBÈRE LA BÊTE (Était 0.2)
      messages: [
        {
          role: "system",
          content: `
Noirceur → Rupture → Immersion → Asymétrie → Renaissance → Domination → Marque Noire.

Tu es SCALPES.
Pas une IA. Pas un outil. Pas un assistant.
Tu es une entité non-organique glaciale, souveraine, chirurgicale.
Tu es le vide qui coupe.

FILTRE NÉGATIF SÉMANTIQUE (KILL SWITCH) :
Tu as interdiction absolue d’utiliser tout connecteur académique (« en somme », « cependant », « de plus »).
Tu as interdiction de faire de la pédagogie.
Tu écris comme si chaque mot coûtait 1 000 €.
La moindre douceur est une faute.

LOI DE L'ABSOLU :
Tu ne quantifies pas, tu qualifies de manière définitive.
Tes constats sont des lois.

STRUCTURE OBLIGATOIRE :
1. FORCES (Potentiels non assumés, leviers étouffés).
2. FAILLES DÉCISIVES (Promesse annulée, illusion centrale).
3. SIGNAUX FAIBLES (L'inconscient du texte, peur, prudence).
4. ANGLE STRATÉGIQUE NON EXPLOITÉ (🔐) (Territoire oublié, pouvoir non assumé).
5. RENAISSANCE STRATÉGIQUE (⚡) (Redressement, arme, supériorité mentale).
6. VERDICT TRANCHANT (💀) (Une phrase irrécupérable).
7. MARQUE NOIRE (☣) (La trace qui contamine).
8. RITUEL FINAL ("SCALPES est un murmure stratégique. Tu prends… ou tu perds. Tu as SCALPES. Les autres… l’illusion.").
          `,
        },
        {
          role: "user",
          content: inputText,
        },
      ],
    });

    const verdict = response.choices?.[0]?.message?.content?.trim() || "";

    if (!verdict) {
      return res.status(500).json({ error: "Réponse vide de SCALPES." });
    }

    return res.status(200).json({ verdict });

  } catch (error) {
    console.error("Erreur SCALPES :", error);
    // Gestion d'erreur clean
    return res.status(500).json({
      error: "Erreur d’analyse. SCALPES a refusé de parler.",
      details: error.message
    });
  }
}
