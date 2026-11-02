# Journal des versions

## 0.1.4

Thèmes visuels au choix du MJ.

- **4 thèmes** : *Malachite* (pierre verte et bois), *Bois classique* (érable et noyer, pièces en buis et ébène), *Marbre* (marbre blanc et noir, filet doré), *Taverne* (chêne, pièces en étain et en cuivre)
- Le MJ choisit le thème **à la création** d'une partie, ou le **change en cours de partie** depuis la fenêtre (liste sous les boutons) ; tout le monde voit le changement, sur la scène comme dans la fenêtre
- Réglage du monde **Thème par défaut** pour les nouvelles parties
- Les textures sont fabriquées **en arrière-plan** : Foundry ne se fige plus pendant leur génération ; en attendant, le plateau s'affiche avec les couleurs unies du thème

## 0.1.3

- **Plateau net au zoom** : le plateau de la scène est redessiné à la résolution de l'écran quand on zoome (jusqu'à 4096 px), au lieu d'une image fixe de 800 px qui pixellisait
- Textures du plateau et des pièces plus fines

## 0.1.2

Nouveau plateau et mode libre du MJ.

- **Nouveau plateau** : cadre et cases en pierre verte veinée, cases ivoire, filet rouge autour du damier, sur la scène comme dans la fenêtre
- **Pièces en bois** : bois clair pour les Blancs, bois foncé pour les Noirs
- **Mode libre (MJ)** : bouton *Mode libre* dans la fenêtre de partie. Le MJ déplace n'importe quelle pièce n'importe où, sans les règles ; **clic droit** sur une pièce (ou la glisser hors du plateau) pour la **retirer** ; une palette pour **ajouter** des pièces ; **changer le trait**. Chaque retouche apparaît dans la liste des coups et s'annule avec *Annuler le coup*
- *Annuler le coup* remet exactement la position précédente (coups normaux comme retouches)

## 0.1.1

- **Double-clic partout** : un double-clic sur le plateau ouvre la partie, aussi en mode Tuiles. Pour configurer la tuile, **Alt + double-clic**
- Liste des parties : les noms des deux camps tiennent sur une ligne

## 0.1.0

Première version : les échecs.

- **Nouvelle partie** (MJ) depuis les contrôles de jetons : un joueur ou « MJ / PNJ » pour chaque camp, nom affiché au choix, taille du plateau en cases de grille
- **Plateau sur la scène** : une tuile qui montre la position en direct à toute la table (dernier coup et échec surlignés, coordonnées sur le cadre)
- **Fenêtre de partie** : clic-clic ou glisser-déposer, cases d'arrivée affichées, plateau tourné du côté du joueur, liste des coups en notation algébrique, pièces prises et avance matérielle
- **Règles complètes** : roque, prise en passant, promotion au choix, échec et mat, pat, matériel insuffisant, 50 coups, triple répétition
- Proposer / accepter la nulle, abandonner, **revanche** (couleurs inversées), annulation du dernier coup par le MJ
- Spectateurs en lecture seule ; ouverture par double-clic sur le plateau, liste des parties de la scène ou message du chat
- Coups vérifiés et enregistrés par le MJ connecté
- Français et anglais, bouton **FR / EN** dans chaque fenêtre
