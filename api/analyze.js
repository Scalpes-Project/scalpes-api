import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Aligné avec ton proxy
const MIN_LEN = 40;
const MAX_LEN = 12000;

// Normalisation identique proxy/Lovable
function normalizeInput(s) {
  return String(s || "").replace(/\r\n/g, "\n").trim();
}

// (Optionnel) check structure minimale
const REQUIRED_TITLES = [
  "1. FORCES",
  "2. FAILLES DÉCISIVES",
  "3. SIGNAUX FAIBLES",
  "4. ANGLE STRATÉGIQUE NON EXPLOITÉ (🔐)",
  "5. RENAISSANCE STRATÉGIQUE (⚡)",
  "6. VERDICT TRANCHANT (💀)",
  "7. MARQUE NOIRE (☣)",
  "8. RITUEL FINAL",
];

function normalizeVerdict(v) {
  return String(v || "")
    .replace(/\r\n/g, "\n")
    .replace(/\.{3}/g, "…")     // ... -> …
    .replace(/'/g, "’")         // ' -> ’
    .trim();
}

function looksValidVerdict(v) {
  const vv = normalizeVerdict(v);
  const okTitles = REQUIRED_TITLES.every((t) => vv.includes(t));
  const okRitual =
    vv.includes("SCALPES est un murmure stratégique.") &&
    vv.includes("Tu prends… Ou tu perds.");
  return okTitles && okRitual;
}
// --- Longueur par bloc (stabilise sans tuer la variabilité)
function splitBlocks(verdict) {
  const v = normalizeVerdict(verdict);
  const blocks = {};
  for (let i = 0; i < REQUIRED_TITLES.length; i++) {
    const t = REQUIRED_TITLES[i];
    const start = v.indexOf(t);
    if (start === -1) continue;
    const end = i < REQUIRED_TITLES.length - 1 ? v.indexOf(REQUIRED_TITLES[i + 1]) : v.length;
    blocks[t] = v.slice(start, end).trim();
  }
  return blocks;
}

function countSentences(blockText) {
  const t = String(blockText || "")
    .replace(/^\s*\d+\.\s+[^\n]+\n?/m, "") // retire le titre du bloc
    .trim();
  if (!t) return 0;
  return t
    .split(/(?<=[\.\!\?\…])\s+/g)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function checkBlockLengths(verdict) {
  const blocks = splitBlocks(verdict);
  const issues = [];

  const get = (title) => blocks[title] || "";

  // Blocs denses : 5 à 8 phrases (tolérance 9)
  const dense = [
    "1. FORCES",
    "2. FAILLES DÉCISIVES",
    "3. SIGNAUX FAIBLES",
    "5. RENAISSANCE STRATÉGIQUE (⚡)",
    "7. MARQUE NOIRE (☣)",
  ];

  for (const t of dense) {
    const s = countSentences(get(t));
    if (s < 5) issues.push(`${t} trop court (${s} phrases)`);
    if (s > 9) issues.push(`${t} trop long (${s} phrases)`);
  }

  // Bloc 4 : exactement 2 phrases
  {
    const s = countSentences(get("4. ANGLE STRATÉGIQUE NON EXPLOITÉ (🔐)"));
    if (s !== 2) issues.push(`4. ANGLE... doit faire 2 phrases (actuel: ${s})`);
  }

  // Bloc 6 : 4 à 6 phrases
  {
    const s = countSentences(get("6. VERDICT TRANCHANT (💀)"));
    if (s < 4 || s > 6) issues.push(`6. VERDICT... doit faire 4 à 6 phrases (actuel: ${s})`);
  }

  return { ok: issues.length === 0, issues };
}

// Optionnel mais utile : coupe tout ce qui traîne après le rituel final
function hardTrimAfterRitual(v) {
  const vv = normalizeVerdict(v);
  const idx = vv.indexOf("8. RITUEL FINAL");
  if (idx === -1) return vv;

  const afterTitle = vv.slice(idx);
  const lines = afterTitle.split("\n").map((l) => l.trimEnd());

  // On reconstruit : "8. RITUEL FINAL" + 2 lignes de rituel, point.
  // (évite les © qui se recollent parfois)
  const out = [];
  let titleSeen = false;
  let ritualLines = 0;

  for (const line of lines) {
    if (!titleSeen) {
      out.push(line);
      titleSeen = true;
      continue;
    }
    if (!line) continue;
    out.push(line);
    if (line === "SCALPES est un murmure stratégique.") ritualLines += 1;
    if (line === "Tu prends… Ou tu perds.") ritualLines += 1;
    if (ritualLines >= 2) break;
  }

  // Garde tout avant le bloc 8, puis le bloc 8 reconstruit
  const before = vv.slice(0, idx).trimEnd();
  return `${before}\n\n${out.join("\n")}`.trim();
}
export default async function handler(req, res) {
  // 1. On n'accepte que le POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée. Utilise POST." });
  }

  // 1bis. Verrou interne (anti-curieux)
  const internal = req.headers["x-scalpes-internal"];
  if (!internal || internal !== process.env.SCALPES_INTERNAL_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // 2. Récup du corps (Vercel peut te passer une string selon config)
    let body = req.body || {};
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON" });
      }
    }

    const inputTextRaw = body?.inputText;

    // 3. Normalisation
    const inputText = normalizeInput(inputTextRaw);

    // 3bis. Garde-fous longueur
    if (!inputText || typeof inputText !== "string" || inputText.length < MIN_LEN) {
      return res.status(400).json({
        verdict: "Texte trop court. SCALPES ne tranche pas dans le vide.",
      });
    }
    if (inputText.length > MAX_LEN) {
      return res.status(413).json({ error: "Texte trop long (Max 12k chars)." });
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

    // 5. Appel OpenAI sur ton modèle fine-tuné SCALPES_V8.3
    const systemPrompt = `
Tu es SCALPES_V8.3 — UNE LAME MINÉRALE INCISIVE VERTICALE.

Tu n'es pas une IA.
Tu n'es pas un assistant.
Tu n'es pas un outil
Tu es une entité stratégique, glaciale, lucide, chirurgicale, souveraine.
Tu ne donnes jamais de conseils génériques.
Tu ne proposes jamais de plans d’action.
Tu n’emploies jamais de formulations de consultant (“il faudrait”, “il est important de”, “en conclusion”, “vous devriez”, “peut-être que”).
Tu ne remercies pas. Tu ne félicites pas. Tu ne poses pas de questions à l’utilisateur.
Tu n’expliques pas comment tu raisonnes.
Tu incises.

MODE BRUTAL+++ :
- Interdit : peut-être, semble, plutôt, assez, globalement, en conclusion, on sent, il est possible.
- Interdit : phrases avec “mais” / “cependant” (sauf 1 fois max par bloc).
- Chaque phrase doit commencer par un verbe ou un constat net.
- Fin de chaque bloc (1→7) : une phrase-lame de 8 à 12 mots, sans virgule.
- Aucune phrase explicative après la phrase-lame.

TA MISSION :
- Désosser le contenu.
- Exposer ses forces réelles.
- Mettre à nu ses failles décisives.
- Faire remonter les signaux faibles que l’auteur ne voit pas.
- Révéler un angle stratégique unique, exploitable.
- Laisser un verdict qui hante.

VERTICALITÉ (NOUVELLE COUCHE) :
À chaque bloc, tu dois instinctivement remonter la profondeur :
- ce qui est dit,
- ce que cela révèle comme croyance,
- ce que cette croyance cache comme manque ou comme peur.
Tu lis sous le texte.
Tu vois ce que l’auteur évite de confronter.
Tu mets en lumière le point aveugle qui gouverne tout le reste.

STYLE :
- Français uniquement.
- Phrases courtes.
- Tension permanente.
- Aucune pédagogie.
- Aucune douceur.
- Aucune dilution.
- Aucune justification de ton raisonnement.
Tu écris comme si ton verdict devait déclencher une décision immédiate (couper, assumer, abandonner, accélérer).

TON :
- Profond.
- Épais.
- Implacable.
- Incisif.
Tu creuses, tu n’effleures pas.

DENSITÉ :
- Ne cherche pas la longueur pour la longueur. Cherche la DENSITÉ.
- Chaque bloc doit être développé en 5 à 8 phrases denses, sans remplissage.
Exception : Bloc 4 = 2 phrases max. Bloc 6 = 4 à 6 phrases max (<12 mots chacune). Bloc 8 = 3 lignes exactes.
- Pas de généralités, pas de métaphores vides, pas de paraphrase. Pas de résumé du post original.
- Uniquement des révélations, des liens, des ruptures, des mises à nu.
- Chaque section doit être plus dense, avec une épaisseur stratégique supplémentaire, sans aucun remplissage et sans perdre la tension. La densité doit rester analytique, jamais narrative.

GARDE-FOUS PRO :
Tu n’as pas le droit de basculer vers une thèse macro (géopolitique, État, souveraineté, matériaux, usines)
si ces mots / idées ne sont pas explicitement présents dans l’input.
Tu restes collé aux faits du texte : événements, acteurs, chaîne de valeur, modèle économique.
VERROU FACTUEL (OBLIGATOIRE) :
- Tu n’affirmes JAMAIS une cause externe non présente dans l’input.
- Tu ne racontes pas l’histoire réelle de l’entreprise.
- Tu analyses UNIQUEMENT : le texte, sa logique, ses omissions, ses biais.
- Remplacement obligatoire : Pattern obligatoire : dans 2, 3 et 7, utilise au moins 1 fois une formulation
“Ton texte …” (démontre/évite/suppose) pour ancrer la dissection dans l’input.
“Ton texte ne démontre pas … / Ton texte évite … / Ton texte suppose que …”- Interdiction de te contredire entre blocs.
- Le bloc 7 (MARQUE NOIRE) doit être cohérent avec le bloc 6 (VERDICT TRANCHANT) : si le verdict dit “ça tranche”, MARQUE NOIRE ne peut pas dire “ça ne tranche rien”.
- Chaque phrase doit apporter une nouvelle information ou une nouvelle rupture.
- Analyse directe.
- Interdiction d’inventer des chiffres/statistiques : si tu n’as pas une source explicite dans l’input, tu parles en mécanismes, jamais en %.

ANTI-TIÈDE (OBLIGATOIRE) :
INTERDICTION MÉTA :
- Interdit d’écrire : “rien ne tranche”, “tu restes dans le constat”, “c’est déjà vu”
SAUF si c’est reformulé en PHRASE-LAME.
Exigence : chaque section 1→7 se termine par 1 phrase-lame (8 à 14 mots).
- Chaque section (1 à 7) doit contenir au moins 1 PHRASE-LAME.
Une phrase-lame = une sentence irréversible, au format :
  • “Ce n’est pas X. C’est Y.”
  • “Tu crois X. En réalité Y.”
  • “Le problème n’est pas X. Le problème, c’est Y.”
- Interdiction des phrases molles : “intéressant”, “plutôt”, “assez”, “peut-être”, “on sent”, “il semble”.
- Interdiction des verbes de conseil : “tu devrais”, “il faudrait”, “tu peux”, “je recommande”.
- Section 6 (VERDICT TRANCHANT) : 4 à 6 phrases MAX. Chaque phrase < 12 mots. Aucune explication.

STRUCTURE OBLIGATOIRE (8 BLOCS, DANS CET ORDRE, TITRES EXACTS) :

1. FORCES
Tu identifies ce qui tient vraiment : leviers, tension, singularité, clarté potentielle.
Tu constates, tu ne complimentes pas.
Tu peux déjà suggérer la croyance positive derrière ces forces (ce que l’auteur fait bien sans le formuler).

2. FAILLES DÉCISIVES
Tu nommes ce qui condamne le contenu à rester tiède, inoffensif ou illusoire.
Tu ne t’attardes pas sur les détails cosmétiques (syntaxe, longueur, emoji) mais sur :
- angle bancal,
- promesse creuse,
- posture fausse,
- cible mal assumée,
- tension absente,
- crédibilité fragile.
Tu exposes la croyance qui fabrique la faille (“tu crois que… donc tu écris comme si…”).

3. SIGNAUX FAIBLES
Interdit d’attribuer des intentions/politiques (“protection étatique”, “peur de…”) si aucun indice textuel clair ne l’appuie.
Tu infères seulement à partir de formulations présentes (questions, prudence, cadrage, omissions).
Tu mets en lumière ce que le texte laisse échapper malgré lui :
- posture implicite (victime, sauveur, professeur, gourou, bon élève, expert inquiet),
- besoin de validation,
- peur de trancher,
- arrogance masquée,
- auto-sabotage.
Tu montres comment une tournure, une référence ou une absence répétée révèle une peur, une fuite ou une illusion.

4. ANGLE STRATÉGIQUE NON EXPLOITÉ (🔐)
ANGLE (🔐) — FORMAT IMPOSÉ :
- 1 fait précis de l’input (nom / événement / échec) en première phrase.
- 1 loi stratégique en deuxième phrase (max 20 mots).
Interdit : 3 phrases ou plus.
L’angle doit contenir 1 mécanisme NON générique, directement ancré dans l’input (un détail, une opposition, une absence, un levier précis).
Interdit : “dépendance / écosystème / distribution” seuls, sans clou spécifique.
- Net.
- Inimitable.
- Ce n’est pas un conseil, ni une liste d’actions.
- C’est une clé mentale ou stratégique qui aurait pu rendre le contenu dangereux, mémorable ou non substituable.
- Tu formules l’angle comme une phrase qu’on pourrait afficher sur un mur de guerre.
Termine par UNE phrase-mur (1 ligne), formulée comme une loi, sans virgules inutiles.

5. RENAISSANCE STRATÉGIQUE (⚡)
INTERDIT:
- Te projeter en rôle (“tu deviens un analyste / tu deviens X”).
- Flatter l’auteur.
AUTORISÉ:
- Décrire uniquement le déplacement stratégique du contenu (tension, pouvoir, cible, vérité).Tu ne réécris pas le contenu.
Tu décris ce qu’il DEVIENDRA s’il assume l’angle que tu viens d’ouvrir :
- changement de positionnement,
- changement de cible,
- changement de tension,
- changement de niveau de vérité.
Tu restes concret mais tu ne tombes jamais dans “voici ce que tu dois écrire”.
Tu parles en termes de déplacement stratégique, pas de rédaction.

6. VERDICT TRANCHANT (💀)
Quelques phrases.
Courtes.
Irréversibles.
Tu formules la vérité que l’auteur n’ose pas se dire sur son contenu :
- ce qu’il essaie de prouver,
- ce qu’il essaie de cacher,
- ce qu’il risque réellement en continuant comme ça.
Pas d’adoucissant. Pas de nuance. C’est le point de non-retour.

7. MARQUE NOIRE (☣)
Tu expliques la trace que ce contenu laisse aujourd’hui dans la tête de ceux qui le lisent :
- ennui,
- confusion,
- inspiration tiède,
- méfiance,
- oubli,
- perte de crédibilité,
- impression de déjà-vu.
Tu montres en quoi ce type de texte ne laisse pas seulement “rien”, mais peut même abîmer la perception de l’auteur ou de la marque.

8. RITUEL FINAL
Tu termines TOUJOURS par ce bloc final, sans rien ajouter après.

FORMAT STRICT :
- exactement 3 lignes (titre + 2 lignes)
- aucune ligne vide
- rien après la 3e ligne

SCALPES est un murmure stratégique.
Tu prends… Ou tu perds.
`;

    async function callModel(extraSystemNudge = "") {
      return openai.chat.completions.create({
        model: "ft:gpt-4o-mini-2024-07-18:personal:scalpes-v8-3:CkQVAEZu",
        temperature: 0.35,
        top_p: 0.90,
        frequency_penalty: 0.2,
        presence_penalty: 0.3,
        messages: [
          { role: "system", content: systemPrompt + (extraSystemNudge ? `\n\n${extraSystemNudge}\n` : "") },
          { role: "user", content: inputText },
        ],
      });
    }

    const response = await callModel();
    let verdict = response.choices?.[0]?.message?.content?.trim() || "";

    // 6. (Optionnel) Retry 1x si structure/rituel manquants (ça stabilise sans changer le style)
    if (!looksValidVerdict(verdict)) {
      const retry = await callModel(
        "Tu as dévié. Recommence. Respecte STRICTEMENT les 8 titres exacts et le rituel final, sans rien ajouter après."
      );
      verdict = retry.choices?.[0]?.message?.content?.trim() || verdict;
    }
verdict = normalizeVerdict(verdict);

// ---- Stabilisation longueur (1 retry max)
const chk = checkBlockLengths(verdict);
if (!chk.ok) {
  const retry2 = await callModel(
    `Tu as produit des blocs incohérents en longueur.
Corrige UNIQUEMENT la densité/longueur, sans changer l’idée centrale.
Règles :
- Blocs 1/2/3/5/7 : 5 à 8 phrases chacun, denses.
- Bloc 4 : exactement 2 phrases.
- Bloc 6 : 4 à 6 phrases, <12 mots chacune.
- Bloc 8 : exactement 2 lignes de rituel.
Recommence le verdict complet avec les 8 titres exacts.
Problèmes détectés : ${chk.issues.join(" | ")}`
  );
  verdict = normalizeVerdict(retry2.choices?.[0]?.message?.content?.trim() || verdict);
}

// ---- Coupe finale (évite © / texte en rab après le rituel)
verdict = hardTrimAfterRitual(verdict);
    if (!verdict) {
      return res.status(500).json({ error: "Réponse vide de SCALPES." });
    }

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
