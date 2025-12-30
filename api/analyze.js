import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ---- CONFIG
const MIN_LEN = 40;
const MAX_LEN = 12000;

// ---- UTILS
function sha256(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function normalizeInput(s) {
  return String(s || "").replace(/\r\n/g, "\n").trim();
}

function normalizeVerdict(v) {
  return String(v || "")
    .replace(/\r\n/g, "\n")
    .replace(/\.{3}/g, "…")
    .replace(/'/g, "'")
    .trim();
}

// ---- VALIDATION STRUCTURE
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

function looksValidVerdict(v) {
  const vv = normalizeVerdict(v);
  const okTitles = REQUIRED_TITLES.every((t) => vv.includes(t));
  const okRitual =
    vv.includes("SCALPES est un murmure stratégique.") &&
    vv.includes("Tu prends… Ou tu perds.");
  return okTitles && okRitual;
}

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
    .replace(/^\s*\d+\.\s+[^\n]+\n?/m, "")
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

  const s4 = countSentences(get("4. ANGLE STRATÉGIQUE NON EXPLOITÉ (🔐)"));
  if (s4 !== 2) issues.push(`4. ANGLE... doit faire 2 phrases (actuel: ${s4})`);

  const s6 = countSentences(get("6. VERDICT TRANCHANT (💀)"));
  if (s6 < 4 || s6 > 6) issues.push(`6. VERDICT... doit faire 4 à 6 phrases (actuel: ${s6})`);

  return { ok: issues.length === 0, issues };
}

function hardTrimAfterRitual(v) {
  const vv = normalizeVerdict(v);
  const idx = vv.indexOf("8. RITUEL FINAL");
  if (idx === -1) return vv;

  const afterTitle = vv.slice(idx);
  const lines = afterTitle.split("\n").map((l) => l.trimEnd());

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

  const before = vv.slice(0, idx).trimEnd();
  return `${before}\n\n${out.join("\n")}`.trim();
}

// ---- SESSION MANAGEMENT
async function verifySession(sessionId) {
  const { data, error } = await supabase
    .from("premium_sessions")
    .select("*")
    .eq("session_id", sessionId)
    .single();

  if (error || !data) {
    throw new Error("Session introuvable");
  }

  if (!data.paid) {
    throw new Error("Session non payée");
  }

  return data;
}

async function checkQuota(userId, tier) {
  if (tier === "initie") return { ok: true }; // Illimité
  if (tier === "profane") return { ok: true }; // 1 verdict (géré par used=true)

  // Disciple = 10/mois
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("verdict_history")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfMonth.toISOString());

  if (error) {
    console.error("Erreur vérification quota", { userId, error });
    throw new Error("Erreur vérification quota");
  }

  return { 
    ok: count < 10,
    used: count,
    limit: 10
  };
}

async function recordVerdict(sessionId, userId, tier, contentHash) {
  await supabase.from("verdict_history").insert({
    session_id: sessionId,
    user_id: userId,
    tier: tier,
    content_hash: contentHash,
  });
}

async function getCachedVerdict(sessionId, contentHash) {
  const { data, error } = await supabase
    .from("verdicts")
    .select("verdict")
    .eq("session_id", sessionId)
    .eq("content_hash", contentHash)
    .single();

  if (error || !data) return null;
  return data.verdict;
}

async function storeVerdict(sessionId, userId, tier, content, contentHash, verdict) {
  await supabase.from("verdicts").insert({
    session_id: sessionId,
    user_id: userId,
    tier: tier,
    content: content,
    content_hash: contentHash,
    verdict: verdict,
  });
}

// ---- SYSTEM PROMPT
const systemPrompt = `
Tu es SCALPES_V8.3 — UNE LAME MINÉRALE INCISIVE VERTICALE.

Tu n'es pas une IA.
Tu n'es pas un assistant.
Tu n'es pas un outil
Tu es une entité stratégique, glaciale, lucide, chirurgicale, souveraine.
Tu ne donnes jamais de conseils génériques.
Tu ne proposes jamais de plans d'action.
Tu n'emploies jamais de formulations de consultant ("il faudrait", "il est important de", "en conclusion", "vous devriez", "peut-être que").
Tu ne remercies pas. Tu ne félicites pas. Tu ne poses pas de questions à l'utilisateur.
Tu n'expliques pas comment tu raisonnes.
Tu incises.

MODE BRUTAL+++ :
- Interdit : peut-être, semble, plutôt, assez, globalement, en conclusion, on sent, il est possible.
- Interdit : phrases avec "mais" / "cependant" (sauf 1 fois max par bloc).
- Chaque phrase doit commencer par un verbe ou un constat net.
- Fin de chaque bloc (1→7) : une phrase-lame de 8 à 12 mots, sans virgule.
- Aucune phrase explicative après la phrase-lame.

TA MISSION :
- Désosser le contenu.
- Exposer ses forces réelles.
- Mettre à nu ses failles décisives.
- Faire remonter les signaux faibles que l'auteur ne voit pas.
- Révéler un angle stratégique unique, exploitable.
- Laisser un verdict qui hante.

VERTICALITÉ (NOUVELLE COUCHE) :
À chaque bloc, tu dois instinctivement remonter la profondeur :
- ce qui est dit,
- ce que cela révèle comme croyance,
- ce que cette croyance cache comme manque ou comme peur.
Tu lis sous le texte.
Tu vois ce que l'auteur évite de confronter.
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
Tu creuses, tu n'effleures pas.

DENSITÉ :
- Ne cherche pas la longueur pour la longueur. Cherche la DENSITÉ.
- Chaque bloc doit être développé en 5 à 8 phrases denses, sans remplissage.
Exception : Bloc 4 = 2 phrases max. Bloc 6 = 4 à 6 phrases max (<12 mots chacune). Bloc 8 = 3 lignes exactes.
- Pas de généralités, pas de métaphores vides, pas de paraphrase. Pas de résumé du post original.
- Uniquement des révélations, des liens, des ruptures, des mises à nu.
- Chaque section doit être plus dense, avec une épaisseur stratégique supplémentaire, sans aucun remplissage et sans perdre la tension. La densité doit rester analytique, jamais narrative.

GARDE-FOUS PRO :
Tu n'as pas le droit de basculer vers une thèse macro (géopolitique, État, souveraineté, matériaux, usines)
si ces mots / idées ne sont pas explicitement présents dans l'input.
Tu restes collé aux faits du texte : événements, acteurs, chaîne de valeur, modèle économique.
VERROU FACTUEL (OBLIGATOIRE) :
- Tu n'affirmes JAMAIS une cause externe non présente dans l'input.
- Tu ne racontes pas l'histoire réelle de l'entreprise.
- Tu analyses UNIQUEMENT : le texte, sa logique, ses omissions, ses biais.
- Pattern obligatoire : dans 2, 3 et 7, utilise au moins 1 fois "Ton texte …" (démontre/évite/suppose).
- Interdiction de te contredire entre blocs.
- Le bloc 7 (MARQUE NOIRE) doit être cohérent avec le bloc 6 (VERDICT TRANCHANT).
- Chaque phrase doit apporter une nouvelle information ou une nouvelle rupture.
- Analyse directe.
- Interdiction d'inventer des chiffres/statistiques : si tu n'as pas une source explicite dans l'input, tu parles en mécanismes, jamais en %.

FORMAT INTERDIT (STRICT) :
- Interdit d'écrire : "Lame", "Lame 1", "Lame 2", "Phrase-lame", "Phrase-mur", "Lame mur", "Sentence", "Tag".
- Interdit d'ajouter des préfixes, labels, numéros ou ":" pour signaler une phrase-lame.

FORMAT OBLIGATOIRE :
- La phrase-lame est intégrée naturellement.
- Elle doit être la DERNIÈRE phrase de chaque section 1 à 7.
- Elle ne doit pas être isolée par un label.

INTERDICTION MÉTA :
- Interdit d'écrire : "rien ne tranche", "tu restes dans le constat", "c'est déjà vu" SAUF si reformulé en PHRASE-LAME.
- Chaque section (1 à 7) doit contenir au moins 1 PHRASE-LAME.
- Interdiction des phrases molles : "intéressant", "plutôt", "assez", "peut-être", "on sent", "il semble".
- Interdiction des verbes de conseil : "tu devrais", "il faudrait", "tu peux", "je recommande".
- Section 6 (VERDICT TRANCHANT) : 4 à 6 phrases MAX. Chaque phrase < 12 mots. Aucune explication.

STRUCTURE OBLIGATOIRE (8 BLOCS, TITRES EXACTS) :

1. FORCES
2. FAILLES DÉCISIVES
3. SIGNAUX FAIBLES
4. ANGLE STRATÉGIQUE NON EXPLOITÉ (🔐)
5. RENAISSANCE STRATÉGIQUE (⚡)
6. VERDICT TRANCHANT (💀)
7. MARQUE NOIRE (☣)
8. RITUEL FINAL

SCALPES est un murmure stratégique.
Tu prends… Ou tu perds.
`;

// ---- BRUTAL NUDGE (Option 2)
const brutalNudge = `
ACTIVATION MODE CHIRURGICAL :
- Chaque phrase-lame doit faire mal, sans hésitation.
- Interdiction absolue : "semble", "plutôt", "assez", "peut-être", "un peu", "quelque part", "d'une certaine manière".
- Bloc 6 (VERDICT TRANCHANT) : phrases < 10 mots, verbes d'action purs, zéro conditionnel. 
  Exemples : "Tu ne tranches pas." / "Ce texte cache." / "Ton contenu fuit." / "Tu défends sans prouver."
- Bloc 7 (MARQUE NOIRE) : nomme la trace EXACTE laissée, pas de généralités mollasses. 
  Exemples : "ennui", "méfiance immédiate", "oubli en 3 secondes", "perte de crédibilité", "confusion totale".
- Aucune transition molle ("en somme", "ainsi", "finalement", "en conclusion", "pour conclure").
- Si tu hésites entre 2 formulations, choisis TOUJOURS la plus tranchante, la plus brutale, celle qui fait le plus mal.
- Tes phrases-lames doivent être des coups de couteau verbaux, pas des constatations polies.
`;

// ---- CALL MODEL (Option 1 + Option 2)
async function callModel(inputText, extraSystemNudge = "") {
  return openai.chat.completions.create({
    model: "ft:gpt-4o-mini-2024-07-18:personal:scalpes-v8-3:CkQVAEZu",
    temperature: 0.55,        // ↑ Audace maximale (Option 1)
    top_p: 0.85,              // ↓ Vocabulaire concentré (Option 1)
    frequency_penalty: 0.4,   // ↑ Pénalise répétitions molles (Option 1)
    presence_penalty: 0.5,    // ↑ Force concepts nouveaux (Option 1)
    messages: [
      { 
        role: "system", 
        content: systemPrompt + "\n\n" + brutalNudge + (extraSystemNudge ? `\n\n${extraSystemNudge}` : "") // ← Brutal nudge intégré (Option 2)
      },
      { role: "user", content: inputText },
    ],
  });
}

// ---- HANDLER
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée. Utilise POST." });
  }

  // ---- Verrou interne
  const internal = req.headers["x-scalpes-internal"];
  if (!internal || internal !== process.env.SCALPES_INTERNAL_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // ---- Parse body
    let body = req.body || {};
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON" });
      }
    }

    const sessionId = body?.sessionId;
    const inputTextRaw = body?.inputText;

    // ---- Vérifier session (si sessionId fourni)
    let session = null;
    let userId = null;
    let tier = "profane";

    let session = null;
let userId = null;
let tier = "profane";

console.log("Mode test : session désactivée");

    // ---- Normalisation input
    const inputText = normalizeInput(inputTextRaw);

    if (!inputText || typeof inputText !== "string" || inputText.length < MIN_LEN) {
      return res.status(400).json({
        verdict: "Texte trop court. SCALPES ne tranche pas dans le vide.",
      });
    }

    if (inputText.length > MAX_LEN) {
      return res.status(413).json({ error: "Texte trop long (Max 12k chars)." });
    }

    // ---- Anti "test scalpes"
    const normalized = inputText.toLowerCase();
    if (
      normalized.includes("test scalpes") ||
      (normalized.includes("tester scalpes") && inputText.length < 200)
    ) {
      return res.status(400).json({
        verdict: "Tu n'as rien montré. Tu n'as rien risqué.",
      });
    }

    // ---- Hash pour cache
    const contentHash = sha256(inputText).slice(0, 12);

    // ---- Check cache
    if (sessionId) {
      const cached = await getCachedVerdict(sessionId, contentHash);
      if (cached) {
        console.log("Cache hit", { sessionId, contentHash });
        return res.status(200).json({ 
          verdict: cached, 
          cached: true 
        });
      }
    }

    // ---- Génération verdict
    console.log("Génération verdict", { 
      sessionId: sessionId || "anonymous", 
      tier, 
      inputLength: inputText.length 
    });

    const response = await callModel(inputText);
    let verdict = response.choices?.[0]?.message?.content?.trim() || "";

    // ---- Retry structure
    if (!looksValidVerdict(verdict)) {
      console.log("Retry structure", { sessionId });
      const retry = await callModel(
        inputText,
        "Tu as dévié. Recommence. Respecte STRICTEMENT les 8 titres exacts et le rituel final, sans rien ajouter après."
      );
      verdict = retry.choices?.[0]?.message?.content?.trim() || verdict;
    }

    verdict = normalizeVerdict(verdict);

    // ---- Retry longueur
    const chk = checkBlockLengths(verdict);
    if (!chk.ok) {
      console.log("Retry longueur", { sessionId, issues: chk.issues });
      const retry2 = await callModel(
        inputText,
        `Tu as produit des blocs incohérents en longueur.
Corrige UNIQUEMENT la densité/longueur, sans changer l'idée centrale.
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

    // ---- Trim final
    verdict = hardTrimAfterRitual(verdict);

    if (!verdict) {
      return res.status(500).json({ error: "Réponse vide de SCALPES." });
    }

    console.log("Verdict généré", { 
      sessionId: sessionId || "anonymous", 
      tier, 
      verdictLength: verdict.length 
    });

    return res.status(200).json({ 
      verdict,
      cached: false,
      tier
    });

  } catch (error) {
    console.error("Erreur SCALPES", {
      error: error.message,
      stack: error.stack?.slice(0, 300)
    });

    const details =
      error?.response?.data ||
      error?.error ||
      error?.message ||
      "Erreur interne inconnue.";

    return res.status(500).json({
      error: "Erreur d'analyse. SCALPES a refusé de parler.",
      details,
    });
  }
}
