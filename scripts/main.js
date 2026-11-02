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
import { refreshBoard, releaseBoard, releaseAll, refreshAll } from "./board-texture.js";
import { openGame, openGames, newGameDialog, refreshApps, rerenderAll } from "./apps.js";
import * as chess from "./chess.js";

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

/** Un double-clic sur un plateau ouvre la partie (sauf pour le MJ en mode Tuiles, qui l'édite). */
function bindDoubleClick() {
  const view = canvas.app?.view ?? canvas.app?.canvas;
  if (!view || view === boundView) return;
  boundView = view;
  view.addEventListener("dblclick", (event) => {
    if (!canvas.ready || canvas.tiles?.active) return;
    const point = canvas.canvasCoordinatesFromClient
      ? canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY })
      : canvas.stage.toLocal({ x: event.clientX, y: event.clientY });
    const inside = (tile) => point.x >= tile.x && point.x <= tile.x + tile.width && point.y >= tile.y && point.y <= tile.y + tile.height;
    const hit = sceneGames().reverse().find((tile) => (!tile.hidden || game.user.isGM) && inside(tile));
    if (hit) openGame(canvas.scene.id, hit.id);
  });
}

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
