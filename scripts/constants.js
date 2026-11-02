/** Identifiant du module, utilisé pour les flags, les réglages, le socket et l'API. */
export const MODULE_ID = "gambit";

/** Canal de socket du module (le MJ y écrit ce que les joueurs n'ont pas le droit d'écrire). */
export const SOCKET = `module.${MODULE_ID}`;

/** Flag de tuile : la partie affichée par cette tuile. */
export const FLAG_GAME = "game";

/** Image de repli de la tuile (plateau vide) ; Gambit la remplace par le plateau dessiné. */
export const BOARD_IMAGE = `modules/${MODULE_ID}/assets/board.svg`;

/** Taille en pixels du plateau dessiné sur la scène (même taille que l'image de repli). */
export const BOARD_PX = 800;

/** Langues du module. */
export const LANGUAGES = ["fr", "en"];

/** Pièces en Unicode (forme pleine, la couleur est donnée par le style). */
export const GLYPHS = Object.freeze({ k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" });

/** Couleurs du plateau, partagées par la fenêtre et la scène. */
export const COLORS = Object.freeze({
  light: "#ecd9b4",
  dark: "#a9794e",
  frame: "#4a3222",
  lastMove: "rgba(222, 186, 64, 0.55)",
  check: "rgba(200, 40, 40, 0.75)"
});

export const log = (...args) => console.log("Gambit |", ...args);
export const warn = (...args) => console.warn("Gambit |", ...args);

/* -------------------------------------------- */
/*  Langue propre au module (bouton FR / EN)    */
/* -------------------------------------------- */

const dictionaries = {};

/** Charge les deux langues dès le départ, pour basculer sans recharger. */
export async function loadDictionaries() {
  await Promise.all(
    LANGUAGES.filter((lang) => !dictionaries[lang]).map(async (lang) => {
      try {
        const response = await fetch(`modules/${MODULE_ID}/lang/${lang}.json`);
        if (response.ok) dictionaries[lang] = await response.json();
      } catch (err) {
        warn(`Langue ${lang} indisponible`, err);
      }
    })
  );
}

/** Langue choisie pour Gambit (réglage client), sinon celle de Foundry. */
export function gambitLang() {
  let chosen = "auto";
  try {
    chosen = game.settings.get(MODULE_ID, "language");
  } catch {
    /* réglage pas encore enregistré */
  }
  if (LANGUAGES.includes(chosen)) return chosen;
  return String(game.i18n?.lang ?? "en").startsWith("fr") ? "fr" : "en";
}

function lookup(dict, path) {
  return path.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), dict);
}

/** Traduction raccourcie, dans la langue choisie pour Gambit. */
export function t(key, data) {
  const own = lookup(dictionaries[gambitLang()], `GAMBIT.${key}`);
  if (typeof own === "string") return data ? own.replace(/\{(\w+)\}/g, (m, k) => (k in data ? data[k] : m)) : own;
  const full = `GAMBIT.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

/** Échappe une valeur pour l'insérer dans du HTML. */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
