/**
 * Gambit — le plateau sur la scène.
 *
 * La tuile d'une partie garde une image de plateau vide (assets/board.svg). Gambit dessine
 * la position dans un canvas 2D de même taille et remplace la texture de la tuile par
 * celle de ce canvas : tout le monde voit la partie en direct, à l'échelle de la tuile.
 */

import { BOARD_PX, COLORS, GLYPHS, warn } from "./constants.js";
import { gameOf, stateOf } from "./game.js";
import { fileOf, rowOf, inCheck, kingSquare } from "./chess.js";
import { themeTextures, themeColors } from "./textures.js";
import { themeOfGame } from "./game.js";

/** Plateaux dessinés : id de tuile → { canvas, texture, signature }. */
const boards = new Map();

/** Pile de polices qui ont les pièces d'échecs sur la plupart des systèmes. */
export const PIECE_FONT = '"Segoe UI Symbol", "Noto Sans Symbols 2", "Noto Sans Symbols", "DejaVu Sans", "Arial Unicode MS", serif';

/** Variation « texte » : empêche le pion ♟ de s'afficher en émoji. */
const TEXT_VS = "︎";

/**
 * Dessine une position dans un contexte 2D carré de `size` px.
 * Cadre en pierre verte avec un filet rouge, cases ivoire et vertes, pièces en bois.
 * Les Blancs sont toujours en bas sur la scène.
 */
export function drawBoard(ctx, gameData, size = BOARD_PX) {
  const state = stateOf(gameData);
  const frame = Math.round(size * 0.05);
  const cell = (size - 2 * frame) / 8;
  const tex = themeTextures(themeOfGame(gameData)) ?? {};
  const colors = themeColors(themeOfGame(gameData));
  // Les textures gardent la même taille apparente quelle que soit la résolution du plateau
  const texScale = size / 1600;
  // Textures pas encore prêtes (générées en arrière-plan) : couleurs unies du thème
  const pattern = (canvas, fallback) => {
    if (!canvas) return fallback;
    const p = ctx.createPattern(canvas, "repeat");
    if (p && typeof DOMMatrix === "function") p.setTransform(new DOMMatrix().scale(texScale));
    return p;
  };
  ctx.imageSmoothingQuality = "high";

  ctx.clearRect(0, 0, size, size);

  // Cadre : pierre verte, bord assombri
  ctx.save();
  roundRect(ctx, 0, 0, size, size, frame * 0.5);
  ctx.clip();
  ctx.fillStyle = pattern(tex.frame, colors.frame);
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.lineWidth = frame * 0.25;
  roundRect(ctx, 0, 0, size, size, frame * 0.5);
  ctx.stroke();
  ctx.restore();

  // Cases
  const light = pattern(tex.light, colors.light);
  const dark = pattern(tex.dark, colors.dark);
  const last = gameData.moves?.at(-1);
  const checked = inCheck(state) ? kingSquare(state.board, state.turn) : -1;
  for (let sq = 0; sq < 64; sq++) {
    const x = frame + fileOf(sq) * cell;
    const y = frame + rowOf(sq) * cell;
    ctx.fillStyle = (fileOf(sq) + rowOf(sq)) % 2 ? dark : light;
    ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
    if (last && (sq === last.from || sq === last.to)) {
      ctx.fillStyle = COLORS.lastMove;
      ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
    }
    if (sq === checked) {
      const g = ctx.createRadialGradient(x + cell / 2, y + cell / 2, cell * 0.1, x + cell / 2, y + cell / 2, cell * 0.7);
      g.addColorStop(0, COLORS.check);
      g.addColorStop(1, "rgba(200, 40, 40, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, cell, cell);
    }
  }

  // Filet rouge autour des cases
  ctx.strokeStyle = colors.inlay;
  ctx.lineWidth = Math.max(2, size * 0.006);
  const inset = ctx.lineWidth * 1.6;
  ctx.strokeRect(frame - inset, frame - inset, cell * 8 + 2 * inset, cell * 8 + 2 * inset);

  // Coordonnées dans le cadre
  ctx.fillStyle = colors.frameInk;
  ctx.font = `600 ${Math.round(frame * 0.5)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 8; i++) {
    const c = frame + (i + 0.5) * cell;
    ctx.fillText("abcdefgh"[i], c, size - frame * 0.42);
    ctx.fillText(String(8 - i), frame * 0.42, c);
  }

  // Pièces : bois clair et bois foncé, contour et ombre portée
  const woodLight = pattern(tex.white, colors.white);
  const woodDark = pattern(tex.black, colors.black);
  ctx.font = `${Math.round(cell * 0.8)}px ${PIECE_FONT}`;
  ctx.lineJoin = "round";
  for (let sq = 0; sq < 64; sq++) {
    const piece = state.board[sq];
    if (!piece) continue;
    const white = piece === piece.toUpperCase();
    const glyph = GLYPHS[piece.toLowerCase()] + TEXT_VS;
    const cx = frame + (fileOf(sq) + 0.5) * cell;
    const metrics = ctx.measureText(glyph);
    // Centre visuel du glyphe (les polices ne le placent pas toutes au même endroit)
    const top = metrics.actualBoundingBoxAscent ?? cell * 0.4;
    const bottom = metrics.actualBoundingBoxDescent ?? cell * 0.05;
    const cy = frame + (rowOf(sq) + 0.5) * cell + (top - bottom) / 2;
    ctx.textBaseline = "alphabetic";

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = cell * 0.08;
    ctx.shadowOffsetY = cell * 0.04;
    ctx.lineWidth = Math.max(2, cell * 0.06);
    ctx.strokeStyle = white ? colors.strokeWhite : colors.strokeBlack;
    ctx.strokeText(glyph, cx, cy);
    ctx.restore();

    ctx.fillStyle = white ? woodLight : woodDark;
    ctx.fillText(glyph, cx, cy);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* -------------------------------------------- */
/*  Texture de la tuile                         */
/* -------------------------------------------- */

/** Résolutions extrêmes du plateau dessiné (px). */
const MIN_PX = 512;
const MAX_PX = 4096;

/**
 * Résolution utile : la taille du plateau à l'écran au zoom actuel (et au zoom
 * maximal un peu plus tard), arrondie par paliers pour ne pas redessiner sans arrêt.
 */
function wantedSize(tile) {
  const doc = tile.document;
  const side = Math.max(doc.width, doc.height);
  const zoom = canvas?.stage?.scale?.x ?? 1;
  const dpr = window.devicePixelRatio || 1;
  const gpuMax = canvas?.app?.renderer?.gl?.getParameter?.(canvas.app.renderer.gl.MAX_TEXTURE_SIZE) ?? MAX_PX;
  const px = side * zoom * dpr;
  const step = 256;
  return Math.max(MIN_PX, Math.min(MAX_PX, gpuMax, Math.ceil(px / step) * step));
}

/** Redessine la tuile d'une partie (placeable Tile) si besoin et pose la texture. */
export function refreshBoard(tile) {
  try {
    const data = gameOf(tile);
    const mesh = tile?.mesh;
    if (!data || !mesh || mesh.destroyed) return;

    const want = wantedSize(tile);
    let entry = boards.get(tile.id);
    // Plus net quand on zoome ; on ne redescend qu'en cas de gros écart (mémoire)
    const resize = entry && (want > entry.size || want < entry.size / 2);
    if (!entry || entry.texture.destroyed || resize) {
      const canvasEl = document.createElement("canvas");
      canvasEl.width = canvasEl.height = want;
      const texture = PIXI.Texture.from(canvasEl);
      const old = entry;
      entry = { canvas: canvasEl, texture, signature: null, size: want };
      boards.set(tile.id, entry);
      if (old && !old.texture.destroyed) {
        // La nouvelle texture est posée avant de libérer l'ancienne
        drawBoard(canvasEl.getContext("2d"), data, want);
        texture.baseTexture.update();
        entry.signature = signature(data);
        swapTexture(mesh, texture);
        try {
          old.texture.destroy(true);
        } catch {
          /* déjà libérée */
        }
      }
    }

    if (signature(data) !== entry.signature) {
      drawBoard(entry.canvas.getContext("2d"), data, entry.size);
      entry.texture.baseTexture.update();
      entry.signature = signature(data);
    }

    if (mesh.texture !== entry.texture) swapTexture(mesh, entry.texture);
  } catch (err) {
    warn("Plateau non dessiné", err);
  }
}

const signature = (data) => `${data.id}|${data.fen}|${data.moves?.length ?? 0}|${themeOfGame(data)}|${themeTextures(themeOfGame(data)) ? 1 : 0}`;

let zoomTimer = null;

/** Après un zoom : redessine les plateaux à la nouvelle résolution, une fois le geste fini. */
export function scheduleZoomRefresh() {
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => {
    for (const tile of canvas?.tiles?.placeables ?? []) {
      if (boards.has(tile.id) || gameOf(tile)) refreshBoard(tile);
    }
  }, 200);
}

/** Change la texture d'un mesh sans changer sa taille à l'écran. */
function swapTexture(mesh, texture) {
  const width = mesh.width;
  const height = mesh.height;
  mesh.texture = texture;
  mesh.width = width;
  mesh.height = height;
}

/** Oublie le plateau d'une tuile supprimée. */
export function releaseBoard(tileId) {
  const entry = boards.get(tileId);
  if (!entry) return;
  boards.delete(tileId);
  try {
    entry.texture.destroy(true);
  } catch {
    /* déjà libérée */
  }
}

/** Oublie tous les plateaux (changement de scène). */
export function releaseAll() {
  for (const id of [...boards.keys()]) releaseBoard(id);
}

/** Redessine les plateaux de la scène affichée (polices chargées, langue…). */
export function refreshAll() {
  for (const entry of boards.values()) entry.signature = null;
  for (const tile of canvas?.tiles?.placeables ?? []) refreshBoard(tile);
}
