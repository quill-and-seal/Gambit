/**
 * Gambit — des jeux de plateau dans Foundry VTT v14, en commençant par les échecs.
 * Point d'entrée : réglages, socket, contrôles de scène, hooks et API publique.
 *
 * Une partie = une tuile sur la scène. La tuile montre la partie en direct à toute la
 * table ; les joueurs jouent dans une fenêtre (double-clic sur la tuile, bouton des
 * contrôles de jetons ou message du chat).
 */

import { MODULE_ID, SOCKET, LANGUAGES, loadDictionaries, log, t } from "./constants.js";
import { gameOf, sceneGames, seatsOf, createGame, request, onSocket, findTile } from "./game.js";
import { refreshBoard, releaseBoard, releaseAll, refreshAll, scheduleZoomRefresh } from "./board-texture.js";
import { openGame, openGames, newGameDialog, refreshApps, rerenderAll } from "./apps.js";
import * as chess from "./chess.js";
import { installCssTextures } from "./textures.js";

/* -------------------------------------------- */
/*  Initialisation                              */
/* -------------------------------------------- */

Hooks.once("init", () => {
  log("Initialisation");

  // Langue de Gambit, indépendante de celle de Foundry (bouton FR / EN des fenêtres)
  game.settings.register(MODULE_ID, "language", {
    name: "GAMBIT.Settings.Language.Name",
    hint: "GAMBIT.Settings.Language.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: Object.fromEntries(["auto", ...LANGUAGES].map((l) => [l, `GAMBIT.Settings.Language.${l}`])),
    default: "auto",
    onChange: () => rerenderAll()
  });
  loadDictionaries().then(() => rerenderAll());

  // Ouvrir la partie tout seul quand on y est installé
  game.settings.register(MODULE_ID, "autoOpen", {
    name: "GAMBIT.Settings.AutoOpen.Name",
    hint: "GAMBIT.Settings.AutoOpen.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  // Message dans le chat au début et à la fin d'une partie
  game.settings.register(MODULE_ID, "announce", {
    name: "GAMBIT.Settings.Announce.Name",
    hint: "GAMBIT.Settings.Announce.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET, (message, senderId) => onSocket(message, senderId));
  // Textures du plateau et des pièces pour les fenêtres (générées une fois)
  installCssTextures();

  game.modules.get(MODULE_ID).api = {
    /** Crée une partie (MJ) : { white, black, whiteName, blackName, size, x, y }. */
    createGame,
    /** Ouvre la fenêtre de création (MJ). */
    newGameDialog,
    /** Ouvre une partie : openGame(sceneId, tileId). */
    openGame,
    /** Liste des parties de la scène. */
    openGames,
    /** Envoie une action : request(tile, "move", { from: "e2", to: "e4" }). */
    request,
    /** Partie portée par une tuile. */
    gameOf,
    /** Moteur de règles (pur, sans Foundry). */
    chess
  };

  // Les pièces sont des caractères : on redessine une fois les polices prêtes
  document.fonts?.ready?.then(() => refreshAll());
  log("Prêt");
});

/* -------------------------------------------- */
/*  Contrôles de scène                          */
/* -------------------------------------------- */

Hooks.on("getSceneControlButtons", (controls) => {
  const tokens = Array.isArray(controls) ? controls.find((c) => c.name === "token" || c.name === "tokens") : controls.tokens;
  if (!tokens) return;
  const add = (tool) => {
    if (Array.isArray(tokens.tools)) tokens.tools.push(tool);
    else tokens.tools[tool.name] = tool;
  };
  const order = Array.isArray(tokens.tools) ? tokens.tools.length : Object.keys(tokens.tools).length;

  add({
    name: "gambit-games",
    title: "GAMBIT.Controls.Games",
    icon: "fa-solid fa-chess-knight",
    button: true,
    order,
    onChange: () => openGames()
  });
  if (game.user.isGM) {
    add({
      name: "gambit-new",
      title: "GAMBIT.Controls.New",
      icon: "fa-solid fa-chess-board",
      button: true,
      order: order + 1,
      onChange: () => newGameDialog()
    });
  }
});

/* -------------------------------------------- */
/*  Plateau sur la scène                        */
/* -------------------------------------------- */

Hooks.on("drawTile", (tile) => refreshBoard(tile));
Hooks.on("refreshTile", (tile) => refreshBoard(tile));
Hooks.on("canvasTearDown", () => releaseAll());
// Zoom : plateau redessiné à la résolution de l'écran (sinon il pixellise)
Hooks.on("canvasPan", () => scheduleZoomRefresh());
Hooks.on("canvasReady", () => {
  refreshApps();
  bindDoubleClick();
});

Hooks.on("createTile", (doc) => {
  const data = gameOf(doc);
  if (!data) return;
  refreshApps();
  autoOpen(doc, data);
});

Hooks.on("updateTile", (doc, changes) => {
  if (!foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`)) return;
  if (doc.object) refreshBoard(doc.object);
  refreshApps();
  // Revanche : nouvelle partie sur la même tuile
  const data = gameOf(doc);
  if (data && !data.moves.length) autoOpen(doc, data);
});

Hooks.on("deleteTile", (doc) => {
  releaseBoard(doc.id);
  refreshApps();
});

/** Ouvre la partie chez les joueurs installés (sauf réglage contraire). */
function autoOpen(doc, data) {
  if (game.user.isGM) return; // le MJ ouvre la sienne depuis la fenêtre de création
  if (!game.settings.get(MODULE_ID, "autoOpen")) return;
  if (seatsOf(data).length) openGame(doc.parent.id, doc.id);
}

/* -------------------------------------------- */
/*  Double-clic sur la tuile                    */
/* -------------------------------------------- */

let boundView = null;

/** Partie sous un point du canvas (coordonnées de la scène), ou null. */
function gameTileAt(point) {
  const inside = (tile) => point.x >= tile.x && point.x <= tile.x + tile.width && point.y >= tile.y && point.y <= tile.y + tile.height;
  return sceneGames().reverse().find((tile) => (!tile.hidden || game.user.isGM) && inside(tile)) ?? null;
}

/**
 * Un double-clic sur un plateau ouvre la partie, quel que soit l'outil actif.
 * Le MJ garde la configuration de la tuile avec Alt + double-clic en mode Tuiles.
 */
function bindDoubleClick() {
  const view = canvas.app?.view ?? canvas.app?.canvas ?? document.getElementById("board");
  if (!view || view === boundView) return;
  boundView = view;
  // Phase de capture : on passe avant les écouteurs du canvas
  view.addEventListener("dblclick", (event) => {
    if (!canvas.ready) return;
    if (canvas.tiles?.active) return; // géré par le double-clic de la tuile (voir plus bas)
    const point = canvas.canvasCoordinatesFromClient
      ? canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY })
      : canvas.stage.toLocal({ x: event.clientX, y: event.clientY });
    const hit = gameTileAt(point);
    if (hit) openGame(canvas.scene.id, hit.id);
  }, true);
}

/** En mode Tuiles, le double-clic d'une tuile Gambit ouvre la partie au lieu de sa configuration. */
Hooks.once("setup", () => {
  const TileClass = CONFIG.Tile?.objectClass ?? foundry.canvas?.placeables?.Tile;
  const original = TileClass?.prototype?._onClickLeft2;
  if (typeof original !== "function") return;
  TileClass.prototype._onClickLeft2 = function (event, ...args) {
    const alt = event?.altKey ?? event?.data?.originalEvent?.altKey ?? game.keyboard?.isModifierActive?.("Alt");
    if (gameOf(this) && !alt) return openGame(this.document.parent.id, this.document.id);
    return original.call(this, event, ...args);
  };
});

/* -------------------------------------------- */
/*  Chat                                        */
/* -------------------------------------------- */

Hooks.on("renderChatMessageHTML", (message, html) => {
  for (const button of html.querySelectorAll("[data-gambit-open]")) {
    button.addEventListener("click", () => {
      const { sceneId, tileId } = button.dataset;
      if (!findTile(sceneId, tileId)) return ui.notifications.warn(t("Game.Missing"));
      openGame(sceneId, tileId);
    });
  }
});
