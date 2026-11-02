/**
 * Gambit — les parties : création, coups, fin de partie.
 *
 * Une partie vit dans un flag de sa tuile (flags.gambit.game). Les joueurs n'ont pas
 * le droit de modifier une tuile : ils envoient leur demande au MJ actif par socket,
 * et c'est lui qui vérifie le coup avec le moteur de règles puis l'enregistre.
 */

import { MODULE_ID, SOCKET, FLAG_GAME, BOARD_IMAGE, t, esc, warn } from "./constants.js";
import { START_FEN, parseFen, toFen, findMove, applyMove, toSan, gameStatus, positionKey } from "./chess.js";

/* -------------------------------------------- */
/*  Lecture                                     */
/* -------------------------------------------- */

/** Partie portée par une tuile (document ou placeable), ou null. */
export function gameOf(tile) {
  const doc = tile?.document ?? tile;
  return doc?.getFlag?.(MODULE_ID, FLAG_GAME) ?? null;
}

/** Retrouve la tuile d'une partie. */
export function findTile(sceneId, tileId) {
  return game.scenes.get(sceneId)?.tiles.get(tileId) ?? null;
}

/** Tuiles de parties d'une scène (la scène affichée par défaut). */
export function sceneGames(scene = canvas?.scene) {
  return scene ? scene.tiles.filter((tile) => gameOf(tile)) : [];
}

/** Position courante d'une partie. */
export function stateOf(gameData) {
  return parseFen(gameData?.fen ?? START_FEN);
}

/** Couleur ("w" / "b") qu'un utilisateur peut jouer dans cette partie, ou null. */
export function seatsOf(gameData, user = game.user) {
  const seats = [];
  for (const color of ["w", "b"]) {
    const seat = gameData?.players?.[color];
    // Le MJ tient les places laissées au « MJ / PNJ » (vides)
    if (seat === user.id || (!seat && user.isGM)) seats.push(color);
  }
  return seats;
}

/** L'utilisateur peut-il jouer le coup suivant ? */
export function canMove(gameData, user = game.user) {
  if (!gameData || gameData.status !== "playing") return false;
  return seatsOf(gameData, user).includes(stateOf(gameData).turn);
}

/** Nom affiché d'un camp : nom saisi par le MJ, sinon l'utilisateur, sinon « MJ / PNJ ». */
export function sideName(gameData, color) {
  const custom = gameData?.names?.[color];
  if (custom) return custom;
  const user = game.users.get(gameData?.players?.[color]);
  return user?.name ?? t("Seat.GM");
}

/** Texte de résultat d'une partie terminée. */
export function resultText(gameData) {
  if (gameData?.status !== "over") return "";
  const reason = t(`Reason.${gameData.reason}`);
  if (gameData.result === "1/2-1/2") return t("Result.Draw", { reason });
  const winner = gameData.result === "1-0" ? "w" : "b";
  return t("Result.Win", { name: sideName(gameData, winner), reason });
}

/* -------------------------------------------- */
/*  Création                                    */
/* -------------------------------------------- */

/** Données d'une nouvelle partie. */
export function newGameData({ white = null, black = null, whiteName = "", blackName = "" } = {}) {
  return {
    kind: "chess",
    id: foundry.utils.randomID(),
    fen: START_FEN,
    moves: [],
    keys: [positionKey(START_FEN)],
    players: { w: white || null, b: black || null },
    names: { w: whiteName || "", b: blackName || "" },
    status: "playing",
    result: null,
    reason: null,
    drawOffer: null,
    startedAt: Date.now()
  };
}

/**
 * Crée une partie sur la scène (MJ uniquement) : une tuile au centre de la vue.
 * @param {object} options  white, black (id d'utilisateur ou null pour MJ / PNJ), whiteName, blackName,
 *                          size (en cases de grille), x, y, scene
 */
export async function createGame(options = {}) {
  if (!game.user.isGM) return ui.notifications.warn(t("Notice.GMOnly"));
  const scene = options.scene ?? canvas.scene;
  if (!scene) return ui.notifications.warn(t("Notice.NoScene"));

  const grid = scene.grid?.size ?? 100;
  const size = Math.max(1, Number(options.size) || 3) * grid;
  const center = canvas.ready && scene === canvas.scene
    ? { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y }
    : { x: (scene.width ?? 4000) / 2, y: (scene.height ?? 3000) / 2 };
  const x = options.x ?? Math.round(center.x - size / 2);
  const y = options.y ?? Math.round(center.y - size / 2);

  const data = newGameData(options);
  const [tile] = await scene.createEmbeddedDocuments("Tile", [{
    texture: { src: BOARD_IMAGE },
    x, y, width: size, height: size,
    flags: { [MODULE_ID]: { [FLAG_GAME]: data } }
  }]);
  if (tile) await announce(tile, "start");
  return tile;
}

/* -------------------------------------------- */
/*  Demandes (joueurs → MJ actif)               */
/* -------------------------------------------- */

/**
 * Envoie une action sur une partie. Le MJ actif l'exécute lui-même ;
 * les autres la lui transmettent par socket.
 * op : move | resign | offerDraw | acceptDraw | declineDraw | rematch | undo
 */
export async function request(tile, op, payload = {}) {
  const doc = tile?.document ?? tile;
  if (!doc) return;
  const message = { op, sceneId: doc.parent.id, tileId: doc.id, ...payload };
  if (game.users.activeGM?.isSelf) return execute(message, game.user.id);
  if (!game.users.activeGM) return ui.notifications.warn(t("Notice.NoGM"));
  game.socket.emit(SOCKET, message);
}

/** Réception d'une demande par socket (seul le MJ actif répond). */
export function onSocket(message, senderId) {
  if (!game.users.activeGM?.isSelf) return;
  execute(message, senderId ?? message.userId).catch((err) => warn("Demande refusée", err));
}

/** Exécute une demande après vérification des droits. Appelé chez le MJ actif. */
async function execute(message, userId) {
  const tile = findTile(message.sceneId, message.tileId);
  const current = gameOf(tile);
  const user = game.users.get(userId);
  if (!tile || !current || !user) return;

  const seats = seatsOf(current, user);
  const isPlayer = seats.length > 0 || user.isGM;
  let next = null;

  switch (message.op) {
    case "move": {
      if (!canMove(current, user)) return;
      next = playMove(current, message, user.id);
      break;
    }
    case "resign": {
      if (current.status !== "playing") return;
      const color = seats.includes(message.color) ? message.color : seats[0];
      if (!color) return;
      next = finish(current, color === "w" ? "0-1" : "1-0", "resign");
      break;
    }
    case "offerDraw": {
      if (current.status !== "playing" || !seats.includes(message.color)) return;
      next = { ...current, drawOffer: message.color };
      break;
    }
    case "acceptDraw": {
      const offer = current.drawOffer;
      if (current.status !== "playing" || !offer || !seats.some((c) => c !== offer)) return;
      next = finish(current, "1/2-1/2", "agreement");
      break;
    }
    case "declineDraw": {
      const offer = current.drawOffer;
      if (!offer || !seats.some((c) => c !== offer)) return;
      next = { ...current, drawOffer: null };
      break;
    }
    case "rematch": {
      if (current.status !== "over" || !isPlayer) return;
      // Les couleurs s'inversent
      next = newGameData({
        white: current.players.b, black: current.players.w,
        whiteName: current.names?.b, blackName: current.names?.w
      });
      break;
    }
    case "undo": {
      if (!user.isGM || !current.moves.length) return;
      next = undoMove(current);
      break;
    }
    default:
      return;
  }
  if (!next) return;

  await tile.update({ [`flags.${MODULE_ID}.${FLAG_GAME}`]: next });
  if (next.status === "over" && current.status !== "over") await announce(tile, "end");
  if (message.op === "rematch") await announce(tile, "start");
}

/** Joue un coup s'il est légal ; renvoie la partie mise à jour, ou null. */
export function playMove(current, { from, to, promotion }, userId = null) {
  const state = stateOf(current);
  const move = findMove(state, { from, to, promotion });
  if (!move) return null;
  const san = toSan(state, move);
  const after = applyMove(state, move);
  const fen = toFen(after);
  const keys = [...(current.keys ?? []), positionKey(fen)];
  const next = {
    ...current,
    fen,
    keys,
    drawOffer: null,
    moves: [...current.moves, { from: move.from, to: move.to, promotion: move.promotion, san, by: userId }]
  };
  const status = gameStatus(after, keys);
  return status.over ? finish(next, status.result, status.reason) : next;
}

/** Reprend le dernier coup : on rejoue la partie depuis le début sans lui. */
export function undoMove(current) {
  let state = parseFen(START_FEN);
  const keys = [positionKey(START_FEN)];
  const moves = current.moves.slice(0, -1);
  for (const m of moves) {
    state = applyMove(state, findMove(state, m));
    keys.push(positionKey(toFen(state)));
  }
  return { ...current, fen: toFen(state), keys, moves, status: "playing", result: null, reason: null, drawOffer: null };
}

function finish(current, result, reason) {
  return { ...current, status: "over", result, reason, drawOffer: null, endedAt: Date.now() };
}

/* -------------------------------------------- */
/*  Messages dans le chat                       */
/* -------------------------------------------- */

/** Annonce le début ou la fin d'une partie, avec un bouton pour l'ouvrir. */
async function announce(tile, kind) {
  if (!game.settings.get(MODULE_ID, "announce")) return;
  const data = gameOf(tile);
  if (!data) return;
  const white = esc(sideName(data, "w"));
  const black = esc(sideName(data, "b"));
  const line = kind === "start"
    ? t("Chat.Start", { white, black })
    : esc(resultText(data));
  const content = `
    <div class="gambit-chat">
      <h3><i class="fa-solid fa-chess-knight"></i> ${esc(t("Chat.Title"))}</h3>
      <p>${line}</p>
      ${kind === "end" ? `<p class="gambit-chat-moves">${esc(t("Chat.Moves", { n: Math.ceil(data.moves.length / 2) }))}</p>` : ""}
      <button type="button" data-gambit-open data-scene-id="${tile.parent.id}" data-tile-id="${tile.id}">
        <i class="fa-solid fa-chess-board"></i> ${esc(t(kind === "start" ? "Chat.Open" : "Chat.Review"))}
      </button>
    </div>`;
  await ChatMessage.create({ content, speaker: { alias: "Gambit" } });
}
