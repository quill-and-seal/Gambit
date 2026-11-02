# Gambit

Des jeux de plateau dans **Foundry VTT v14**, en commençant par **les échecs**.

Deux personnages s'installent pour une partie dans la taverne ? Le MJ pose un plateau sur la scène, les joueurs jouent dans une fenêtre, et **toute la table suit la partie en direct** sur le plateau de la carte. Gambit ne dépend d'aucun système de jeu.

Un module de l'atelier [Quill & Seal](https://github.com/quill-and-seal).

## Installation

Dans Foundry, **Modules complémentaires → Installer un module**, puis colle ce lien de manifeste :

```
https://github.com/quill-and-seal/Gambit/releases/latest/download/module.json
```

Gambit parle **français** et **anglais**. Le bouton **FR / EN**, en haut à droite de chaque fenêtre, change la langue du module pour toi seul, sans toucher à celle de Foundry.

## Démarrage rapide

1. **MJ** : dans les contrôles de **jetons**, clique sur l'échiquier (*Nouvelle partie d'échecs*).
2. Choisis qui joue les **Blancs** et les **Noirs** : un joueur, ou **MJ / PNJ** pour tenir ce camp toi-même. Tu peux donner un nom affiché à chaque camp (« Grumli le nain »).
3. **Lancer la partie** : un plateau est posé au centre de la vue (3 cases de grille par défaut). C'est une tuile normale : déplace-la, redimensionne-la, pose-la sur une table.
4. Les joueurs installés voient la fenêtre de la partie s'ouvrir toute seule.

Pour ouvrir une partie ensuite :

- **double-clic** sur le plateau de la scène, quel que soit l'outil actif (en mode Tuiles, **Alt + double-clic** ouvre toujours la configuration de la tuile) ;
- le bouton **cavalier** des contrôles de jetons (*Parties de la scène*) : liste des parties, avec **Jouer** / **Regarder** et un bouton pour centrer la vue sur le plateau ;
- le bouton du **message de chat** qui annonce la partie.

## Jouer

- **Clic-clic** ou **glisser-déposer** : choisis une pièce, ses cases d'arrivée s'affichent (un point, ou un anneau pour une prise).
- Toutes les règles sont appliquées : roque, prise en passant, promotion (au choix de la pièce), échec, mat, pat, matériel insuffisant, règle des 50 coups, triple répétition.
- Le plateau est tourné du côté de ton camp ; **Retourner le plateau** pour l'inverser.
- **Proposer la nulle**, **Abandonner**, et à la fin **Revanche** (les couleurs s'inversent, sur le même plateau).
- Le **MJ** peut **annuler le dernier coup**.
- Les spectateurs ouvrent la même fenêtre en lecture seule.

Les coups passent par le **MJ connecté**, qui les vérifie avant de les enregistrer : sans MJ en ligne, on ne peut pas jouer.

## Réglages

| Réglage | Portée | Rôle |
| --- | --- | --- |
| Langue de Gambit | joueur | Comme Foundry, français ou anglais |
| Ouvrir mes parties automatiquement | joueur | La fenêtre s'ouvre quand on t'installe à une partie |
| Annoncer les parties dans le chat | monde | Message au début et à la fin de chaque partie |

## API

```js
const gambit = game.modules.get("gambit").api;

// Nouvelle partie (MJ) : id d'utilisateur, ou null pour MJ / PNJ
const tile = await gambit.createGame({ white: "<userId>", black: null, blackName: "Grumli", size: 3 });

gambit.openGame(tile.parent.id, tile.id);
gambit.request(tile, "move", { from: "e2", to: "e4" });
gambit.gameOf(tile); // { fen, moves, players, status, result, … }
gambit.chess;        // moteur de règles pur (FEN, coups légaux, notation)
```

## Développement

- `npm test` : tests du moteur de règles (perft de référence et cas de fin de partie).
- `preview/index.html` : banc d'essai avec un faux Foundry. Sers le dépôt (`python3 -m http.server`) puis ouvre `http://localhost:8000/preview/index.html`.

## Licence

MIT
