# Direction artistique

Charte graphique du jeu, et mode d'emploi de la chaîne de production des
sprites. C'est la traduction du GDD §10 en règles applicables.

```bash
npm run sprites                    # régénère docs/sprites.png
npm run sprites planche.png 4      # la même, agrandie 4 fois pour le détail
```

![Planche de référence](sprites.png)

---

## 1. Le parti pris

**Pixel art aux tons chauds et pastel, ambiance estivale, avec une exigence de
vraisemblance.** L'inverse de l'austérité grise habituelle du médiéval : on doit
avoir envie d'y passer une après-midi, pas d'y survivre.

> **Écart assumé avec le GDD §10.** Le document parlait de « 8-bit
> minimaliste ». Après un premier essai, la direction a été infléchie vers plus
> de matière : maçonnerie appareillée, colombages, rangs de tuiles, anatomie
> réelle des chevaux et des figures. Le nombre de pixels n'a pas beaucoup bougé
> — c'est la densité d'information dans chacun qui a augmenté. Le GDD mérite
> d'être mis à jour sur ce point.

Trois conséquences pratiques :

- **Peu de pixels par entité.** Un fantassin tient dans 30 × 34, un cavalier
  dans 46 × 48 — un corps d'une vingtaine de pixels de large, le reste étant la
  marge que réclame son geste d'attaque. C'est ce qui rend la production tenable
  en solo.
- **Aucun dégradé, aucun anticrénelage.** Chaque pixel est posé franchement. À
  cette taille, une transition douce se lit comme une tache sale. Le volume
  vient des valeurs et des arêtes, jamais du flou.
- **La lisibilité prime sur le détail.** Un joueur doit reconnaître une unité
  sans lire son nom, et distinguer un allié d'un ennemi au premier coup d'œil.
  Le détail vient **après** ce contrat, jamais contre lui.

---

## 2. La palette

Elle vit dans `src/art/palette.ts` — c'est elle, la source de vérité, pas ce
document.

**Rien ne se dessine hors de la palette.** Une couleur inventée au fil d'un
sprite est exactement ce qui fait dériver une direction artistique. Si une
teinte manque, elle s'ajoute au fichier, nommée, et devient disponible partout.

**Trois valeurs par matériau** — claire, moyenne, sombre. Deux ne suffisent pas
à donner du volume ; quatre brouillent la lecture à cette taille.

| Famille | Usage |
|---|---|
| `grass*` | Sol, en quatre valeurs très proches |
| `wood*` | Charpentes, troncs, manches d'outils |
| `stone*` | Maçonnerie, rochers, murailles |
| `thatch*` | Toits de chaume, chapeaux de paille |
| `leaf*` | Feuillages, buissons, cultures |
| `gold*`, `berry*` | Ressources, où la couleur **est** l'information |
| `skin*`, `cloth*`, `steel*` | Personnages |
| `outline` | Contour unique de toutes les entités |

### Les couleurs de royaume ne servent qu'à l'appartenance

Saphir `#4a7fd4`, Rubis `#d45a4a`, chacune avec sa version claire et sombre.
Elles se posent sur les toits, les tuniques et les bannières — **jamais sur un
matériau**. Un toit bleu veut dire « à moi », pas « en ardoise ».

---

## 3. Les règles qui font tenir l'ensemble

**La lumière vient du nord-ouest.** Toujours. Face gauche claire, face droite
dans l'ombre, sur chaque entité du jeu sans exception. C'est la règle la plus
importante du lot : dès qu'une seule entité l'enfreint, elle semble flotter.

**Un contour d'un pixel, de la même couleur pour tout.** Il est appliqué en fin
de dessin, automatiquement, par `PixelCanvas.outline()`. C'est ce qui détache
les entités du sol sans qu'aucune n'ait besoin d'être assombrie.

**Une ombre portée elliptique au sol** sous chaque entité, à 18 % d'opacité.
Sans elle, tout paraît suspendu à un centimètre du décor.

**Chaque sprite a un point d'ancrage** : le pixel qui se pose sur le centre de
la tuile. Les pieds pour une unité, le centre du socle pour un bâtiment. C'est
lui qui aligne tout le monde sur la grille.

---

## 4. Le vocabulaire visuel des unités

Les douze unités ne sont pas dessinées une par une : leur silhouette découle de
leurs caractéristiques de jeu. Un joueur doit lire une armée **sans infobulle**.

| Signe | Sens |
|---|---|
| Cheval de profil, cape, chausses colorées | cavalerie |
| Heaume fermé, plastron, spallières | armure lourde |
| Arc bandé, carquois dans le dos | unité à distance |
| Hampe dépassant la tête | arme d'hast, anti-cavalerie |
| Chapeau de paille, tablier de cuir, outil | paysan |
| Bannière à queue d'aronde | porte-étendard |
| Écu triangulaire aux couleurs du royaume | infanterie de mêlée |

La tunique porte toujours la couleur du royaume.

**Aucun de ces signes n'est choisi à la main.** Ils se déduisent tous de
`src/data/units.ts` : l'armure décide du plastron, la portée de l'arc, le bonus
anti-cavalerie de la hampe, le rôle du tablier, l'aura de la bannière.
Rééquilibrer une unité change donc son allure — une unité qui gagne de
l'armure gagne un plastron, sans qu'on ait à rouvrir le fichier de dessin.

### L'anatomie

Toutes les figures sont bâties sur le même squelette, en **proportions
héroïques** — une tête pour quatre, plutôt que pour sept. C'est ce qui rend un
visage lisible à cette taille sans donner un personnage difforme.

Trois repères verticaux suffisent à tout accrocher : le sol, la taille et les
épaules. Le reste — cou, tête, bras, arme, écu — s'en déduit, à pied comme à
cheval. Un cavalier n'est pas dessiné à part : c'est la même figure, dont les
jambes se plient sur le flanc au lieu de porter le poids.

Quatre détails font la différence entre une figure et un mannequin :

1. **Des épaules plus larges que la taille.** Deux pixels d'écart suffisent, et
   c'est ce qui sépare un soldat d'un paysan avant même qu'on voie son
   équipement.
2. **Un appui décalé.** Deux jambes parallèles donnent un pantin ; un pas d'un
   pixel entre les deux, la jambe arrière plus sombre, et la figure a un poids.
   C'est aussi ce décalage qui, amplifié, devient le cycle de marche (§6).
3. **Un cou.** Sans lui, la tête est une bille posée sur les épaules.
4. **Une ceinture.** Elle coupe la figure au bon endroit et lui donne son
   échelle. Sans elle, buste et jambes se lisent comme une seule pièce.

Et la règle qui vaut pour toutes les figures du jeu : **les membres du côté
opposé sont plus sombres et légèrement décalés**. Ce décalage, plus que tout le
reste, empêche une silhouette de se lire comme un bloc.

### Les quatre paysans se distinguent par leur outil

Ils partagent la même tenue ; c'est l'outil qui dit le métier, et il est choisi
d'après la ressource que l'unité récolte le mieux — cognée pour le bûcheron,
pic pour le mineur, faux pour le fermier, houe pour le paysan polyvalent.

Un outil se lit à l'endroit où il travaille : la cognée et le pic se portent à
l'épaule, fer en l'air ; la faux et la houe se tiennent fer vers le sol.
Dressée en tête de manche, la faux se lisait comme un bec d'oiseau au-dessus du
chapeau.

### Le cheval

Dessiné pour l'anatomie et non pour la géométrie : croupe, flanc, poitrail,
encolure qui monte, tête inclinée vers l'avant, quatre membres articulés,
crinière et queue. Le harnachement — selle, sangle, rênes — achève de le
distinguer d'un animal sauvage.

Le détail qui fait tout : **les deux membres du côté opposé sont plus sombres et
légèrement décalés**. C'est ce décalage, plus que tout le reste, qui donne la
profondeur et empêche la monture de se lire comme un bloc.

Une **liste blanche** court sur le chanfrein. Sans ce repère clair, la tête se
perdait dans l'encolure : un sprite entièrement brun n'a aucune arête où
accrocher un regard.

Le cavalier reçoit une cape qui tombe derrière son buste jusqu'à la croupe.
Elle prolonge sa ligne et l'assied visuellement sur sa monture, au lieu de le
poser dessus. Elle est **entièrement dans la valeur sombre du royaume** : dans
la valeur moyenne, elle formait avec l'écu et la tunique un seul aplat de
couleur. Une cape est un fond, pas un motif.

### Ce qu'un sprite composite oblige à surveiller

Une figure posée sur une monture, c'est deux dessins qui se recouvrent — et
c'est là que tout se joue. Trois pièges, tous rencontrés :

- **L'occlusion.** Le bras armé du cavalier tombait pile sur l'encolure et la
  tête du cheval disparaissait derrière une épée. Cheval et cavalier sont donc
  reculés de deux pixels sur la selle. Une monture dont on ne voit plus la tête
  ne se lit plus comme une monture.
- **Les alignements accidentels.** La ceinture du cavalier, l'arçon de la selle
  et l'encolure du cheval étaient à la même hauteur et dans la même valeur :
  ensemble ils formaient une barre d'un bout à l'autre du sprite. La ceinture
  est passée au cuir sombre, la selle aussi, les rênes s'arrêtent au garrot.
- **Deux bruns voisins.** Une lance en bois nu passant devant une robe baie
  devenait une bûche. Sa hampe est peinte, bandée aux couleurs du royaume. De
  même, les chausses du cavalier portent la couleur du royaume et non le drap
  écru des fantassins : sur un flanc brun, une jambe beige disparaît.

---

## 5. L'architecture

Tous les bâtiments partagent le même squelette — socle isométrique, murs, toit
— et ne se distinguent que par leur matériau, leur hauteur et deux ou trois
détails. C'est ce qui donne un village qui se tient plutôt qu'une collection
d'objets sans rapport.

### Ce qui fait qu'un bâtiment ressemble à un bâtiment

Cinq éléments, tous nécessaires. Retirez-en un et le volume redevient une boîte
colorée :

1. **Un soubassement de pierre** sur toutes les façades, quel que soit le
   matériau du mur. C'est ce qui assied la construction sur le sol.
2. **Un parement qui a une trame** : assises de pierre aux joints décalés d'une
   rangée à l'autre, ou colombage avec sablières, poteaux et remplissage clair.
   Un aplat de couleur ne sera jamais un mur.
3. **Des ouvertures.** Fenêtres à encadrement et appui, porte à chambranle,
   vantail à planches et pentures de fer. Ce sont elles qui donnent l'échelle du
   bâtiment.
4. **Une toiture avec ses rangs**, tracés d'une arête à l'autre en suivant la
   pente réelle vers le faîte — plus serrés pour la tuile, plus larges pour le
   chaume — avec ses arêtiers et son faîtage.
5. **Une avancée de toit** et sa ligne d'ombre sur le haut du mur. Sans débord,
   un bâtiment paraît coupé au couteau.

**Seules les deux façades tournées vers le bas de l'écran sont dessinées.** Les
deux faces arrière n'ont aucune raison de l'être — elles l'étaient, et c'est
pour ça que les premiers bâtiments semblaient n'avoir aucun mur : on voyait leur
dos, intégralement masqué par le toit.

Le tableau `STYLES` dans `src/art/buildings.ts` est court à dessein : ce sont
les seules décisions esthétiques à prendre par bâtiment, tout le reste découle
de son emprise au sol.

Deux exceptions assumées :

- **La ferme n'est pas un bâtiment** mais une parcelle labourée. On récolte
  dessus, on n'y entre pas — une énième cabane aurait été à la fois moins juste
  et moins lisible.
- **La tour de garde n'a pas de toit** : c'est une plateforme crénelée, ce qui
  la rend immédiatement reconnaissable malgré sa petite emprise.

### Les murailles se raccordent

Chaque segment tend un bras vers le milieu de chaque côté partagé avec une
voisine : deux segments adjacents se rejoignent exactement et le mur est
continu. Les seize raccordements possibles sont dessinés et mis en cache.

Une tour marque les **extrémités** et les segments isolés, jamais les angles :
en mettre partout transformait une enceinte en chapelet de tours où l'on ne
distinguait plus le tracé.

---

## 6. L'animation

Le pixel art ne s'interpole pas : il se redessine. Une animation, ici, est donc
une **table de poses clés** (`src/art/animation.ts`) que le dessin lit au lieu
de valeurs écrites en dur. Quatre nombres suffisent à couvrir tout le jeu,
parce que toutes les figures partagent le même squelette :

| Champ | Effet |
|---|---|
| `stride` | Écarte les jambes, du pas avant (+1) au pas arrière (−1) |
| `bob` | Monte ou descend le corps — le rebond de la marche |
| `lean` | Penche le buste vers l'avant : le poids d'un coup |
| `reach` | Sort l'arme, du repos (0) à l'extension complète (1) |

Quatre cycles, de deux à quatre images : **repos**, **marche**, **coup
d'arme**, **travail**. Les deux dernières images d'un cycle de marche ne sont
jamais la copie l'une de l'autre — elles gardent un reste de foulée en sens
opposé, sans quoi quatre images se lisent comme deux.

### Ce qui cadence chaque cycle

Aucun cycle ne tourne sur un compteur décoratif. C'est la différence entre une
figure qui s'agite et une figure qui travaille :

- La **marche** avance avec la distance parcourue, si bien que les pieds ne
  patinent pas quand la vitesse change — un cavalier va deux fois plus vite
  qu'un fantassin, sa foulée aussi.
- Le **coup d'arme** suit le rechargement d'attaque, si bien que l'image
  d'impact tombe sur le coup réellement porté et non à côté.
- **Récolte et construction** tournent sur l'horloge de simulation, décalées
  par l'identifiant de l'unité, pour qu'un chantier de six paysans ne
  ressemble pas à un ballet synchronisé.

### Trois pièges

**De face, l'écartement des jambes ne dit pas laquelle mène.** Les deux moitiés
du cycle se ressembleraient trait pour trait. C'est la profondeur qui les
sépare : la jambe qui avance est éclairée et posée à plat, celle qui suit est
dans l'ombre et décolle du sol.

**Le gabarit est fixé par le geste, pas par la silhouette au repos.** Une épée
abattue vers l'avant sort de six pixels de la figure immobile ; sur une toile
juste à la taille du corps, elle était simplement rognée et l'unité frappait
avec un moignon. Les fantassins sont donc dessinés dans 30 × 34 pour un corps
qui en occupe 20.

**L'outil du paysan est la seule pièce qui tourne vraiment.** Un outil se
reconnaît à sa forme, pas à son orientation — le redessiner à la main pour
chaque angle serait trois fois le travail pour le même résultat. Il pivote donc
autour du poing, échantillonné au demi-pixel pour qu'une rotation quelconque ne
laisse pas de trous. Les armes, elles, ont trois positions franches dessinées à
la main : à cette taille, elles se lisent mieux ainsi qu'en tournant.

Les bandes d'animation de `docs/sprites.png` montrent chaque cycle image par
image. C'est le seul moyen de juger une animation sans la jouer : une image
ratée y saute aux yeux, alors qu'elle passe inaperçue à cinq images par seconde
au milieu d'une mêlée.

---

## 7. Le décor

Les gisements forment des zones d'un seul tenant, donc on en voit des dizaines
côte à côte. Deux conséquences :

- **Trois variantes par ressource**, choisies d'après la position sur la carte.
  Un seul motif répété cent fois donne un papier peint, pas une forêt. Le choix
  est déterministe — indispensable en multijoueur, où deux clients doivent
  afficher la même chose.
- **Des silhouettes compactes**, qui débordent peu de leur tuile, sinon une
  masse d'arbres devient une bouillie.

Le sol est un motif de 32 × 16 pixels répété sur toute la carte. C'est le plus
petit pavé qui se répète sans couture dans une grille isométrique : décaler de
32 pixels revient à avancer de deux tuiles en x, décaler de 16 revient à
avancer d'une tuile en x et une en y — deux déplacements qui conservent le
damier. Les losanges qui dépassent du pavé rentrent par le côté opposé.

---

## 8. La chaîne de production

```
src/art/
  palette.ts    La palette — source de vérité des couleurs
  canvas.ts     Toile de pixels et primitives de dessin
  animation.ts  Les poses clés des quatre cycles
  units.ts      Les douze unités
  buildings.ts  Les bâtiments et les murailles
  nature.ts     Sol, arbres, buissons, filons
  index.ts      Catalogue et cache
```

**L'art ne dépend ni de PixiJS ni du navigateur.** Il produit des tampons RGBA.
Le même code sert à fabriquer les textures du jeu (`src/render/textures.ts`) et
à exporter la planche de référence depuis Node (`npm run sprites`). Les deux
voient exactement la même chose, ce qui évite qu'une planche « de production »
finisse par mentir sur le jeu.

`docs/sprites.png` est le document de contrôle : tout s'y regarde d'un coup
d'œil, et une incohérence de style, de palette ou d'échelle y saute aux yeux
bien mieux qu'en jouant.

### Ajouter un sprite

1. Écrire la fonction de dessin dans le fichier de sa famille.
2. L'ajouter au `catalogue()` de `src/art/index.ts`.
3. `npm run sprites` et regarder la planche.

Aucune image n'est stockée dans le dépôt : tout est reconstruit à partir du
code. Un sprite se corrige donc en changeant deux nombres, pas en rouvrant un
éditeur d'images.

---

## 9. Ce qui reste à faire

Cette passe fige le style et couvre tout le jeu. Manquent encore, par ordre
d'importance :

1. **Les directions.** Une unité est vue de face quel que soit son cap, y
   compris quand elle marche vers la gauche. Un RTS isométrique en demande
   normalement huit — soit huit fois le travail, animations comprises. C'est
   désormais le plus gros manque visuel du jeu.
2. **Le décor est figé.** Les unités s'animent, pas les arbres ni les
   bannières. Un balancement de feuillage et un drapeau qui claque coûteraient
   peu et rendraient la carte vivante.
3. **Les états de dégât** des bâtiments : fissures, toit crevé, fumée.
4. **Les transitions de terrain** : lisières de forêt, chemins, berges.
5. **Les effets** : impact de flèche, poussière, effondrement.
