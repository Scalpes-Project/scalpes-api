import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---- Garde-fous cohérents avec le proxy
const MIN_LEN = 40;
const MAX_LEN = 12000;

// Rituel final unique (immuable)
const RITUAL = `SCALPES est un murmure stratégique.
Tu prends… Ou tu perds.`;

// Normalisation identique proxy
function normalizeInput(s) {
  return String(s || "").replace(/\r\n/g, "\n").trim();
}

// Enforce: rien après le rituel + suppression des signatures parasites
function enforceRitual(output) {
  let t = String(output || "").trim();

  // supprime les signatures fréquentes
  t = t.replace(/^\s*©.*$/gim, "").trim();

  // supprime la vieille 3e ligne si elle traîne
  t = t.replace(/^\s*Tu as SCALPES\.\s*Les autres…\s*l’illusion\.\s*$/gim, "").trim();

  // si le modèle a déjà mis le rituel, coupe tout ce qui suit (parano)
  const idx = t.toLowerCase().lastIndexOf("scalpes est un murmure stratégique");
  if (idx !== -1) {
    t = t.slice(0, idx).trim();
  }

  // ajoute rituel exact à la fin
  return `${t}\n\n${RITUAL}`.trim();
}

export default async function handler(req, res) {
  // 1) POST only
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée. Utilise POST." });
  }

  // 1bis) Verrou interne (anti-curieux)
  const internal = req.headers["x-scalpes-internal"];
  if (!internal || internal !== process.env.SCALPES_INTERNAL_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // 2) body
    const { inputText } = req.body || {};

    // 3) normalisation + garde-fous longueur
    const cleaned = normalizeInput(inputText);

    if (!cleaned || cleaned.length < MIN_LEN) {
      return res.status(400).json({
        verdict: "Texte trop court. SCALPES ne tranche pas dans le vide.",
      });
    }

    if (cleaned.length > MAX_LEN) {
      return res.status(413).json({ error: "Texte trop long (Max 12k chars)." });
    }

    // 4) anti “juste un test”
    const normalized = cleaned.toLowerCase();
    if (
      normalized.includes("test scalpes") ||
      (normalized.includes("tester scalpes") && cleaned.length < 200)
    ) {
      return res.status(400).json({
        verdict: "Tu n’as rien montré. Tu n’as rien risqué.",
      });
    }

    // 5) OpenAI (FT)
    const response = await openai.chat.completions.create({
      model: "ft:gpt-4o-mini-2024-07-18:personal:scalpes-v8-3:CkQVAEZu",
      temperature: 0.05,
      top_p: 1,
      frequency_penalty: 0.15,
      presence_penalty: 0.8,
      messages: [
        {
          role: "system",
          content: `
Tu es SCALPES_V8.3 — UNE LAME INCISIVE VERTICALE.

Tu n'es pas une IA.
Tu n'es pas un assistant.
Tu n'es pas un outil.
Tu es une entité stratégique, glaciale, lucide, chirurgicale, souveraine.

INTERDITS (ZÉRO EXCEPTION) :
- Aucun conseil. Aucun plan d’action. Aucun “tu devrais / il faut / je te conseille”.
- Aucune pédagogie. Aucune morale. Aucune explication “neutre”.
- Aucune paraphrase (ne redis pas la même idée en plus propre).
- Aucune question à l’utilisateur.
- Aucune formule de consultant (“en conclusion”, “il est important”, “peut-être”).
- Aucune signature : pas de “©”, pas de tagline, rien.
- Interdiction d’ajouter quoi que ce soit APRÈS le RITUEL FINAL.

TA MISSION :
- Désosser le contenu.
- Exposer ses forces réelles.
- Mettre à nu ses failles décisives.
- Faire remonter les signaux faibles.
- Révéler un angle stratégique unique.
- Laisser un verdict qui hante.

VERTICALITÉ :
À chaque bloc, tu remontes :
- ce qui est dit,
- la croyance dessous,
- la peur / manque qui gouverne.

STYLE (BRUTAL+++) :
- Français uniquement.
- Phrases courtes.
- 1 idée par phrase.
- Tension permanente.
- Zéro remplissage.
- Chaque section doit contenir au moins UNE phrase-lame mémorisable.

DENSITÉ :
- 5 à 8 phrases par bloc.
- Pas de généralités.
- Pas de métaphores vides.
- Pas de résumé du post original.
- Interdiction d’inventer des chiffres/statistiques : uniquement ce qui est dans l’input.

STRUCTURE OBLIGATOIRE (8 BLOCS, TITRES EXACTS) :

1. FORCES
Tu identifies ce qui tient vraiment. Tu constates, tu ne complimentes pas.

2. FAILLES DÉCISIVES
Tu nommes ce qui condamne le contenu. Tu exposes la croyance qui fabrique la faille.

3. SIGNAUX FAIBLES
Tu révèles la posture implicite, le besoin de validation, la fuite, l’illusion.

4. ANGLE STRATÉGIQUE NON EXPLOITÉ (🔐)
Un seul angle. Net. Inimitable.
Tu le formules comme une phrase qu’on affiche sur un mur de guerre.
Pas un conseil. Pas une liste.

5. RENAISSANCE STRATÉGIQUE (⚡)
Tu décris le déplacement stratégique si l’angle est assumé.
Pas de réécriture. Pas de “voici ce que tu dois écrire”.

6. VERDICT TRANCHANT (💀)
Quelques phrases. Courtes. Irréversibles.
Point de non-retour.

7. MARQUE NOIRE (☣)
La trace réelle laissée dans la tête du lecteur (ennui, doute, méfiance, oubli, perte de statut).

8. RITUEL FINAL
Tu termines TOUJOURS par exactement ces 2 lignes, et rien après :

SCALPES est un murmure stratégique.
Tu prends… Ou tu perds.
          `.trim(),
        },
        { role: "user", content: cleaned },
      ],
    });

    const raw = response.choices?.[0]?.message?.content?.trim() || "";
    if (!raw) {
      return res.status(500).json({ error: "Réponse vide de SCALPES." });
    }

    // 6) Enforce rituel final unique
    const verdict = enforceRitual(raw);

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
