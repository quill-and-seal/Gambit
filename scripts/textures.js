/**
 * Gambit — thèmes visuels et leurs textures.
 *
 * Les textures sont générées dans le navigateur (aucune image à télécharger), une fois
 * par thème et seulement quand il sert. Graines fixes : même rendu chez tout le monde.
 * Les mêmes textures servent au plateau de la scène (motifs de canvas) et à la fenêtre
 * de partie (variables CSS posées sur la fenêtre).
 */

/* -------------------------------------------- */
/*  Thèmes                                      */
/* -------------------------------------------- */

/**
 * Chaque thème : cadre, cases claires et foncées, pièces blanches et noires
 * ([fabrique, taille, réglages]), plus les couleurs des filets, contours et coordonnées.
 */
export const THEMES = Object.freeze({
  malachite: {
    frame: ["stone", 1024, { deep: [24, 74, 44], mid: [46, 112, 66], vein: [96, 150, 104], seed: 11 }],
    light: ["cloudy", 512, { a: [226, 216, 184], b: [244, 237, 214], seed: 23 }],
    dark: ["stone", 1024, { deep: [24, 74, 44], mid: [46, 112, 66], vein: [96, 150, 104], seed: 11 }],
    white: ["wood", 512, { dark: [196, 146, 82], light: [240, 204, 146], seed: 37 }],
    black: ["wood", 512, { dark: [52, 24, 12], light: [104, 52, 28], seed: 53 }],
    colors: {
      light: "#ece3c6", dark: "#3c7a4f", frame: "#2e6b42", inlay: "#b3262a",
      inkLight: "#2e6b42", inkDark: "#ece3c6", frameInk: "rgba(240, 232, 205, 0.85)",
      white: "#f0cc92", black: "#5a2c18", strokeWhite: "#3b2412", strokeBlack: "#d9b47a"
    }
  },
  wood: {
    frame: ["wood", 1024, { dark: [58, 32, 16], light: [104, 62, 32], seed: 71, rings: 5 }],
    light: ["wood", 512, { dark: [212, 172, 116], light: [238, 210, 160], seed: 73, rings: 6 }],
    dark: ["wood", 512, { dark: [106, 62, 30], light: [150, 96, 52], seed: 79, rings: 6 }],
    white: ["wood", 512, { dark: [214, 176, 116], light: [246, 224, 180], seed: 83 }],
    black: ["wood", 512, { dark: [24, 16, 12], light: [62, 44, 32], seed: 89 }],
    colors: {
      light: "#e6c896", dark: "#86542c", frame: "#4a2a14", inlay: "#d8b06a",
      inkLight: "#6e4422", inkDark: "#f0d8ae", frameInk: "rgba(245, 225, 190, 0.85)",
      white: "#ecd2a4", black: "#30221a", strokeWhite: "#3b2412", strokeBlack: "#d9b47a"
    }
  },
  marble: {
    frame: ["stone", 1024, { deep: [62, 62, 68], mid: [104, 104, 112], vein: [190, 190, 196], seed: 101, veins: 9, warp: 3.2 }],
    light: ["stone", 1024, { deep: [222, 220, 214], mid: [246, 245, 241], vein: [150, 150, 158], seed: 103, veins: 7, warp: 3.5, strength: 0.45 }],
    dark: ["stone", 1024, { deep: [22, 22, 26], mid: [52, 52, 58], vein: [150, 150, 160], seed: 107, veins: 7, warp: 3.5, strength: 0.5 }],
    white: ["cloudy", 512, { a: [232, 224, 204], b: [252, 248, 238], seed: 109 }],
    black: ["stone", 512, { deep: [16, 16, 20], mid: [44, 44, 52], vein: [120, 120, 132], seed: 113, veins: 8, warp: 3 }],
    colors: {
      light: "#efeeea", dark: "#2a2a30", frame: "#5a5a62", inlay: "#c9a54a",
      inkLight: "#55555c", inkDark: "#e4e4e8", frameInk: "rgba(240, 240, 244, 0.85)",
      white: "#f2ecdc", black: "#26262c", strokeWhite: "#2a2a30", strokeBlack: "#d6c08a"
    }
  },
  tavern: {
    frame: ["wood", 1024, { dark: [52, 34, 20], light: [92, 62, 38], seed: 131, rings: 4 }],
    light: ["wood", 512, { dark: [176, 140, 94], light: [204, 170, 122], seed: 137, rings: 5 }],
    dark: ["wood", 512, { dark: [76, 50, 30], light: [108, 74, 46], seed: 139, rings: 5 }],
    white: ["metal", 512, { dark: [118, 122, 128], light: [204, 208, 212], seed: 149 }],
    black: ["metal", 512, { dark: [112, 58, 24], light: [218, 146, 78], seed: 151 }],
    colors: {
      light: "#c4a274", dark: "#5e4028", frame: "#40291a", inlay: "#b8893a",
      inkLight: "#5e4028", inkDark: "#e2c79a", frameInk: "rgba(232, 208, 166, 0.85)",
      white: "#b8bcc2", black: "#b8703a", strokeWhite: "#24262a", strokeBlack: "#2e1406"
    }
  }
});

export const THEME_IDS = Object.keys(THEMES);
export const DEFAULT_THEME = "malachite";

/** Thème existant (repli sur le thème par défaut). */
export function themeId(id) {
  return THEMES[id] ? id : DEFAULT_THEME;
}

const canvasCache = new Map(); // thème → { frame, light, dark, white, black }
const pending = new Map(); // thème → Promise
const cssCache = new Map();
const PARTS = ["frame", "light", "dark", "white", "black"];

/* -------------------------------------------- */
/*  Génération (worker)                         */
/* -------------------------------------------- */

let worker = null;
let workerBroken = false;
let jobId = 0;
const jobs = new Map();

function getWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new Worker(new URL("./texture-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      const job = jobs.get(data.id);
      if (!job) return;
      jobs.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve(data);
    };
    worker.onerror = (err) => {
      console.warn("Gambit | Worker de textures indisponible, génération directe", err);
      workerBroken = true;
      worker = null;
      for (const job of jobs.values()) job.fallback();
      jobs.clear();
    };
  } catch (err) {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

/** Pixels d'une recette, par le worker si possible. */
async function pixels(recipe) {
  const direct = async () => ({ size: recipe[1], data: (await import("./texture-gen.js")).generate(recipe) });
  const w = getWorker();
  if (!w) return direct();
  return new Promise((resolve, reject) => {
    const id = ++jobId;
    jobs.set(id, { resolve, reject, fallback: () => direct().then(resolve, reject) });
    w.postMessage({ id, recipe });
  });
}

function toCanvas({ size, data }) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d").putImageData(new ImageData(data, size, size), 0, 0);
  return canvas;
}

/**
 * Prépare les textures d'un thème (une fois). Résout quand elles sont prêtes ;
 * en attendant, plateau et fenêtres utilisent les couleurs unies du thème.
 */
export function ensureTheme(id) {
  id = themeId(id);
  if (canvasCache.has(id)) return Promise.resolve(canvasCache.get(id));
  if (pending.has(id)) return pending.get(id);
  const theme = THEMES[id];
  const promise = (async () => {
    const byRecipe = new Map(); // même recette (cadre = cases foncées) : fabriquée une fois
    for (const part of PARTS) {
      const key = JSON.stringify(theme[part]);
      if (!byRecipe.has(key)) byRecipe.set(key, pixels(theme[part]).then(toCanvas));
    }
    const tex = {};
    for (const part of PARTS) tex[part] = await byRecipe.get(JSON.stringify(theme[part]));
    canvasCache.set(id, tex);
    pending.delete(id);
    for (const fn of readyListeners) fn(id);
    return tex;
  })();
  promise.catch((err) => {
    pending.delete(id);
    console.warn(`Gambit | Thème ${id} : textures indisponibles`, err);
  });
  pending.set(id, promise);
  return promise;
}

const readyListeners = new Set();

/** Appelé à chaque thème prêt (pour redessiner plateaux et fenêtres). */
export function onThemeReady(fn) {
  readyListeners.add(fn);
}

/** Textures d'un thème si elles sont prêtes, sinon null (et la génération est lancée). */
export function themeTextures(id) {
  id = themeId(id);
  const tex = canvasCache.get(id);
  if (!tex) ensureTheme(id);
  return tex ?? null;
}

/** Couleurs d'un thème. */
export function themeColors(id) {
  return THEMES[themeId(id)].colors;
}

/** Variables CSS d'un thème : couleurs tout de suite, textures quand elles sont prêtes. */
function themeCss(id) {
  id = themeId(id);
  if (cssCache.has(id)) return cssCache.get(id);
  const c = themeColors(id);
  const vars = {
    "--gambit-light": c.light,
    "--gambit-dark": c.dark,
    "--gambit-frame": c.frame,
    "--gambit-inlay": c.inlay,
    "--gambit-ink-light": c.inkLight,
    "--gambit-ink-dark": c.inkDark,
    "--gambit-white": c.white,
    "--gambit-black": c.black,
    "--gambit-stroke-white": c.strokeWhite,
    "--gambit-stroke-black": c.strokeBlack
  };
  const tex = themeTextures(id);
  if (!tex) return vars; // pas encore prêtes : on ne met pas en cache
  try {
    for (const [part, canvas] of Object.entries(tex)) {
      vars[`--gambit-tex-${part}`] = `url(${canvas.toDataURL("image/jpeg", 0.88)})`;
    }
  } catch (err) {
    console.warn("Gambit | Textures indisponibles", err);
  }
  cssCache.set(id, vars);
  return vars;
}

/** Pose les variables CSS d'un thème sur un élément (fenêtre de partie, pièce glissée…). */
export function applyTheme(el, id) {
  if (!el) return;
  for (const [name, value] of Object.entries(themeCss(id))) el.style.setProperty(name, value);
  el.dataset.gambitTheme = themeId(id);
}
