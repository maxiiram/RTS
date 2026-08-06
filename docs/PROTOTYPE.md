# Prototype jouable — v0.1

Première version jouable, destinée à éprouver l'équilibrage en conditions
réelles plutôt qu'à ressembler au jeu final.

```bash
npm install
npm run dev     # http://localhost:5173
```

---

## Ce qui marche

**La boucle complète du GDD §4.** Récolter, construire, produire, passer d'âge,
combattre. Une partie se joue du début à la fin, victoire comprise (destruction
totale de l'adversaire, GDD §8).

- **Pixel art complet** : douze unités, onze bâtiments, décor et sol, peints
  pixel par pixel dans `src/art` et regroupés sur une planche de référence
  (`npm run sprites`). Palette chaude verrouillée, lumière au nord-ouest,
  contour unique — voir la [charte graphique](ART.md).
- **Carte isométrique** de 120 × 120 tuiles, **tirée au sort à chaque partie**
  à partir d'une graine : l'orientation des zones autour de chaque base, la
  position du royaume adverse et tout le terrain neutre changent d'une partie à
  l'autre. La reconnaissance redevient un vrai enjeu — on ne sait plus d'avance
  où frapper.

  Ce que le hasard ne décide jamais, c'est si la partie est jouable. Chaque
  base est **entourée** de ses six zones de départ, réparties dans six secteurs
  angulaires distincts, et non servie d'un seul côté. Les quantités sont tirées
  une seule fois et servies aux deux royaumes, si bien que l'orientation varie
  mais pas la dotation. Une vérification finale complète ce que le tirage n'a
  pas donné : aucune graine ne peut produire un départ sans or. Les zones
  neutres se tiennent à l'écart des deux camps — un filon tombé à dix tuiles
  d'une base n'est pas un enjeu territorial, c'est un cadeau. Et les bases ne
  sont jamais collées : au moins 55 tuiles d'écart, 14 du bord.

  La graine s'affiche dans le journal au lancement, et `?seed=1234` la force —
  de quoi rejouer une carte ou reproduire un bug. C'est aussi la valeur que
  l'hôte diffusera aux autres joueurs en multijoueur : `Math.random` reste banni
  de la simulation, la graine est une entrée tirée une fois, jamais un tirage en
  cours de partie.
- **Bord de carte net** : le losange jouable découpe le sol, et sa tranche —
  deux valeurs de terre décalées vers le bas — donne au plateau une épaisseur.
  Le motif de prairie ne continue plus dans le vide au-delà des limites.
- **Zones de ressources d'un seul tenant**, à la manière d'Age of Empires : une
  forêt est une masse compacte que l'on exploite par sa lisière, un filon d'or
  un tas de quelques tuiles. C'est ce qui donne un sens au camp de bûcheron et à
  la mine — on pose un dépôt au bord d'une zone — et ce qui fait des zones du
  centre un enjeu territorial plutôt qu'un semis d'arbres isolés.
- **Unités animées sur un squelette** : quatre cycles — repos, marche à huit
  images, coup d'arme, travail — décrits en angles d'articulation (cuisse,
  genou, épaule, coude, arme) et non en décalages de pixels. La jambe se
  raccourcit quand elle se plie, le corps monte et descend tout seul parce que
  le pied le plus bas est posé au sol, et l'arme, accrochée au poing, tourne
  avec lui.

  Chaque cycle est cadencé par ce que fait réellement l'unité et non par un
  compteur décoratif : la foulée avance avec la distance parcourue, si bien que
  les pieds ne patinent pas quand la vitesse change ; le coup d'arme suit le
  rechargement d'attaque, si bien que l'image d'impact tombe sur le coup
  réellement porté.
- **Quatre caps** : une unité regarde où elle va. Deux vues sont dessinées — de
  face et de dos, la seconde sans visage — et les deux autres s'obtiennent en
  retournant le sprite à l'affichage. À l'arrêt, l'unité garde le cap de son
  dernier pas.
- **Brouillard de guerre** : noir sur ce qui n'a jamais été exploré, voilé sur
  ce qui l'a été mais n'est plus observé. Sa lisière est floutée : à une
  opacité par tuile, la limite de l'exploré était un escalier de losanges
  noirs, et c'est ce qu'on voyait en premier sur une capture. Le terrain et les bâtiments découverts
  restent mémorisés, les unités adverses disparaissent dès qu'on cesse de les
  voir — la règle d'Age of Empires. Cliquer dans le brouillard ne révèle rien.
- **Sélection** au clic ou au rectangle, **ordres contextuels** au clic droit —
  la cible détermine l'action (marcher, récolter, bâtir, attaquer).
- **Ordres de groupe** : un groupe sélectionné se commande comme une seule
  unité. Cliquer un arbre répartit les paysans sur tout le bosquet, viser un
  ennemi engage la troupe qui l'entoure, et un déplacement déploie le groupe en
  formation au lieu de l'entasser sur une case.
- **Carré d'action** au-dessus de chaque unité sélectionnée, avec sa couleur :
  au repos, en marche, récolte, retour au dépôt, construction, attaque. Le
  panneau de sélection résume l'activité d'un groupe entier (« 8 récoltent,
  3 au repos »).
- **Récolte** des quatre ressources, avec dépôt automatique au bâtiment le plus
  proche et retour sur le gisement.
- **Construction** des dix bâtiments, avec aperçu de l'emplacement et chantier
  destructible pendant qu'il se bâtit. Les **murailles se posent au glisser** :
  un trait de souris pose toute la file, les cases occupées sont sautées, et le
  bâtisseur enchaîne seul d'un segment au suivant. Chaque segment **se raccorde
  à ses voisines** : il tend un bras vers le milieu de chaque côté partagé, si
  bien que le mur est continu, avec une tour aux angles et aux extrémités.
- **Production** d'unités en file d'attente, avec point de ralliement.
- **Progression d'âge**, y compris ses prérequis en bâtiments. Le bandeau
  indique en clair ce qui manque encore — « Il manque 300 nourriture et
  2 bâtiments (0/2) » — plutôt que de se contenter de griser le bouton. Même
  principe sur les boutons de production et de construction, dont l'infobulle
  chiffre le manque au lieu d'annoncer « ressources insuffisantes ».
- **Combat** complet : bonus de classe, charge de la cavalerie, aura du
  porte-étendard, tours de garde, riposte automatique des unités au repos.
- **IA d'escarmouche** pour le Royaume de Rubis. Elle ne triche pas : mêmes
  coûts, mêmes délais, mêmes ressources de départ. Elle récolte, construit,
  monte d'âge et lance un assaut toutes les trois minutes.

**Le bac à sable**, à droite de l'écran, est l'outil qui justifie ce prototype :
faire apparaître n'importe quelle unité dans n'importe quel camp, sans coût ni
population, et regarder ce qui se passe. Avec le réglage de vitesse (jusqu'à
×8) et les ressources gratuites, une hypothèse d'équilibrage se teste en
quelques secondes au lieu d'une partie entière.

Les chiffres viennent tous de `src/data` : **modifier une valeur dans les
tables change immédiatement le jeu**, sans toucher à une ligne de code.

---

## Ce qui manque

Par ordre d'importance pour la suite :

1. **Quatre caps, pas huit.** Les unités regardent où elles vont (voir la
   [direction artistique](ART.md) §6), mais une unité qui part vers l'est et
   une autre vers le sud partagent la même vue de face. La grille isométrique
   en demande huit ; les quatre manquantes seraient des trois-quarts, à
   dessiner entièrement.
2. **L'IA n'est pas soumise au brouillard.** Le joueur l'est, elle non : elle
   raisonne encore sur l'état complet de la carte. C'est le comportement
   d'Age of Empires 1, mais ça reste une inégalité à corriger.
3. **Pas de multijoueur.** La simulation est déterministe et prête pour du
   lockstep (voir plus bas), mais il n'y a ni réseau ni serveur.
4. **Pas d'arbre technologique.** La forge se construit mais ne propose aucune
   amélioration.
5. **Projectiles instantanés.** Les flèches touchent au moment du tir, sans
   temps de vol. Ça avantage légèrement les archers par rapport au modèle.
6. **Pas de son.**

Limites connues du prototype, moins graves mais réelles :

- Les unités se poussent doucement sans vraie gestion de collisions : dans un
  passage d'une seule tuile, elles se traversent en partie au lieu de faire la
  queue proprement. C'est le compromis assumé qui garantit qu'un groupe ne se
  bloque jamais (voir la règle d'écartement plus bas). Une vraie file d'attente
  demanderait de réserver les cases du passage, ce qui n'est pas au programme
  de cette version.
- Chaque unité calcule son chemin dans son coin. À une centaine d'unités ça
  tient sans peine ; à plusieurs centaines, il faudra un champ de flux.
- Pas de file d'ordres (pas de « va ici *puis* là »).
- Le groupe se déplace en formation mais chacun à sa vitesse : mêler de la
  cavalerie à de l'infanterie étire la colonne. Caler tout le monde sur le plus
  lent serait plus propre visuellement, mais rendrait la cavalerie inutilisable
  en escorte.
- Pas de groupes de contrôle (Ctrl+1 pour mémoriser une sélection).
- **Pas de mini-carte**, ce qui se sent nettement sur 120 × 120.
- La lisière du brouillard est franche, tuile par tuile. Un dégradé serait plus
  doux à l'œil.
- La ferme s'épuise et disparaît, mais rien ne prévient le joueur avant.

---

## Passages étroits et écartement des unités

Un groupe lancé vers un passage d'une seule tuile s'immobilisait en bloc, sans
même l'atteindre. La cause n'était pas le passage mais la règle qui empêche les
unités de se superposer : elle corrigeait les positions plus vite que les
unités n'avançaient, transformant tout paquet dense en bloc auto-verrouillé.

Trois règles gouvernent désormais cet écartement :

1. **La poussée ne dépasse jamais la marche.** Elle est plafonnée à une
   fraction du pas de déplacement, si bien qu'avancer l'emporte toujours sur
   s'écarter. C'est la correction qui débloque tout le reste.
2. **Qui marche a la priorité.** Une unité à l'arrêt encaisse l'essentiel de la
   correction et s'écarte du passage, au lieu de faire barrage à celles qui
   veulent l'emprunter.
3. **Personne n'est poussé dans un mur.** Une correction qui ferait entrer une
   unité dans une case infranchissable est annulée sur cet axe seulement :
   l'unité glisse le long de l'obstacle plutôt que de s'y encastrer.

Quatre tests jouent la situation exacte — un mur percé d'un seul passage — et
vérifient qu'un groupe le franchit, que deux colonnes en sens inverse se
croisent, qu'une unité à l'arrêt finit par céder le passage, et qu'aucune unité
ne termine encastrée dans un obstacle.

---

## Le sol et le brouillard sont des images, pas des losanges

Sur 120 × 120, dessiner le damier du sol tuile par tuile revient à redessiner
14 400 losanges à chaque image — et autant pour le brouillard. C'est la première
chose qui s'écroule quand la carte grandit.

Les deux calques sont donc des **textures d'un pixel par tuile**, affichées avec
la matrice de la projection isométrique. Cette projection étant une
transformation linéaire, le carré du pixel (x, y) devient exactement le losange
de la tuile (x, y) : rendu identique, filtrage au plus proche voisin donc
parfaitement net, et un seul objet à afficher au lieu de 14 400. Le brouillard
n'est réécrit que lorsque la vision change, deux fois par seconde. Les entités
hors écran, ou que le joueur ne voit pas, n'ont aucun objet d'affichage.

**Le brouillard est peint sur le sol, sous les entités.** Au-dessus, il
recouvrait tout ce qui dépasse du sol : le haut des bâtiments, et surtout les
barres de vie et de construction, tracées plusieurs dizaines de pixels plus haut
que la tuile à laquelle elles appartiennent — on ne voyait plus avancer ses
propres chantiers. Les entités dont on ne fait que se souvenir sont assombries à
la place, ce qui donne le rendu d'Age of Empires : un bâtiment découvert reste
visible, en plus terne.

*Mesure honnête* : le conteneur qui a servi au développement n'a pas de carte
graphique — un simple remplissage plein écran y plafonne à 13 images par
seconde. **Les images par seconde n'y sont donc pas mesurables.** Ce qui l'est,
et qui a été vérifié : un tick de simulation coûte 0,10 ms et un appel de rendu
0,08 ms avec 1 127 entités, soit moins de 1 % d'un budget d'image à 60 Hz.

---

## Architecture

```
src/
  data/     Tables d'équilibrage — aucune logique
  balance/  Modèle de combat, analyse, rapport
  sim/      Simulation : monde, grille, ordres, IA, boucle
  render/   Rendu PixiJS — lit le monde, ne le modifie jamais
  ui/       HUD en HTML
  main.ts   Assemblage et boucle principale
```

Deux règles structurent tout le reste.

**La simulation ne connaît pas l'affichage.** Elle ne référence ni PixiJS ni le
DOM, ce qui permet aux tests de jouer des parties entières en quelques
secondes — dont une de quinze minutes contre l'IA, à chaque exécution de
`npm test`. C'est aussi ce qui permettra à un serveur de simuler sans rien
afficher.

**Tout est déterministe.** Aucun `Math.random` dans la simulation (un
générateur à graine le remplace partout) — la seule horloge consultée l'est
*avant* la partie, pour tirer la graine de la carte, et cette valeur devient
une entrée comme une autre. Aucune dépendance à l'horloge système, un pas de simulation
fixe à 20 Hz que la vitesse de jeu ne modifie jamais — accélérer exécute plus
de pas, jamais des pas plus grands. Un test rejoue dix minutes de partie deux
fois et compare l'état entité par entité.

C'est le prérequis du multijoueur 4v4 du GDD §9 : en lockstep, seuls les ordres
transitent sur le réseau et chaque client simule le reste à l'identique. Le
moindre écart de calcul entre deux machines fait diverger la partie.

---

## Tests

```bash
npm test                  # 77 vérifications, dont 39 de simulation
npm run balance           # rapport d'équilibrage
npm run typecheck
node scripts/smoke.mjs    # parcours complet dans un vrai navigateur
```

Le test de bout en bout pilote la souris comme un joueur et vérifie ce
qu'aucun test headless ne peut voir : rendu, entrées et HUD. Il a besoin de
`npm run dev` en parallèle, et accepte un dossier de captures en second
argument.

Quatre bugs ont été trouvés par ces tests plutôt qu'en jouant :

- Les unités s'immobilisaient **juste** hors de portée de leur cible sans
  jamais rien faire — le test d'arrivée portait sur un point d'approche mobile
  au lieu de la distance réelle à la cible.
- Un paysan envoyé sur un arbre au cœur d'une forêt restait bloqué
  indéfiniment : aucune case libre autour, donc aucune position d'où le
  couper. Les unités abandonnent maintenant une cible inatteignable au bout de
  trois secondes et en choisissent une autre.
- Un ordre donné à un groupe était en réalité donné à chaque unité
  séparément, ce qui entassait tout le monde sur la même cible. Un test vérifie
  désormais que dix paysans se partagent au moins trois arbres, et que la
  répartition ne dépend pas de l'ordre de la sélection — condition nécessaire
  au multijoueur.
- Un groupe lancé vers un passage étroit se verrouillait lui-même : la
  correction d'écartement était plus forte que le pas de déplacement, si bien
  qu'un paquet d'unités s'immobilisait **avant même** d'atteindre le goulet.
  Quatre tests couvrent maintenant ce cas de figure (voir plus bas).

---

## Commandes en jeu

| Action | Commande |
|---|---|
| Sélectionner | Clic gauche, ou glisser pour un groupe |
| Ajouter à la sélection | Maj + clic |
| Ordre contextuel | Clic droit |
| Point de ralliement | Bâtiment sélectionné + clic droit |
| Déplacer la vue | ZQSD, flèches, ou glisser au clic molette |
| Zoom | Molette |
| Poser une file de murailles | Sélectionner un paysan, choisir Muraille, puis glisser |
| Annuler | Échap |

Le carré coloré au-dessus d'une unité sélectionnée indique son action :

| Couleur | Action |
|---|---|
| Gris | Au repos — l'unité ne fait rien |
| Bleu clair | Se déplace |
| Vert | Récolte |
| Crème | Rapporte sa charge au dépôt |
| Orange | Construit |
| Rouge | Attaque |
