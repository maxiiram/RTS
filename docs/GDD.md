# Game Design Document — RTS Pixel Art Médiéval
*(Titre de travail — "Projet RTS", nom définitif à trouver)*
### Royaume de Saphir (bleu) vs Royaume de Rubis (rouge)

---

## 1. Pitch

Un RTS classique et exigeant, en pixel art minimaliste 8-bit, vu en isométrique. Deux royaumes humains rivaux s'affrontent pour la suprématie totale, dans un gameplay économique et militaire au rythme lent et réfléchi, façon *Age of Empires 1* ou *Stronghold*. Pas de héros, pas de magie : juste de la gestion, de la logistique et de la tactique pure.

**Ambition** : ne pas réinventer le genre, mais l'exécuter avec soin — un RTS "classique bien fait", identité visuelle rétro assumée.

---

## 2. Informations clés

| Aspect | Choix |
|---|---|
| Genre | RTS (Real-Time Strategy) |
| Univers | Fantasy médiéval |
| Style visuel | Pixel art très minimaliste (8-bit) |
| Caméra | Isométrique (type Age of Empires) |
| Échelle de jeu | Classique (type AoE / Warcraft 3) |
| Rythme | Lent et stratégique (type AoE1 / Stronghold) |
| Modes de jeu | Solo (escarmouche, pas de campagne narrative) + Multijoueur |
| Plateforme | PC uniquement, **jouable dans le navigateur** (web) |
| Contexte de dev | Solo / petite équipe indie |
| Moteur | Non choisi (à discuter) |

---

## 3. Univers et factions

### Contexte narratif
Pas de campagne narrative scénarisée pour le lancement — le jeu se concentre sur le gameplay pur (escarmouche/skirmish et multijoueur). L'univers reste un fantasy médiéval, sans magie ni héros.

### Les deux factions
Deux **royaumes humains rivaux**, volontairement proches en termes de gameplay, différenciés **uniquement par la couleur** pour l'instant :

- **Royaume de Saphir** — bleu
- **Royaume de Rubis** — rouge

Pas de différence d'architecture, de blason ou de gameplay entre les deux royaumes pour cette première version — c'est une distinction purement visuelle (couleur des unités/bannières/bâtiments). Des différenciations plus poussées (unités uniques, bonus passifs) pourront être ajoutées dans une phase ultérieure si le besoin s'en fait sentir.

---

## 4. Boucle de gameplay (Core Loop)

Cycle économique → militaire, typique d'un RTS classique :

1. **Collecte de ressources** (villageois/paysans sur Or, Bois, Nourriture, Pierre)
2. **Construction de bâtiments** (production, défense, amélioration)
3. **Recherche et avancement d'âge** (débloque unités/bâtiments/technologies)
4. **Production militaire**
5. **Expansion territoriale** (nouvelles bases, contrôle de ressources)
6. **Confrontation militaire** jusqu'à destruction totale de l'adversaire

Le rythme voulu étant **lent et stratégique**, l'accent est mis sur :
- Une phase économique plus longue avant les premiers affrontements
- Une gestion de base importante (défense, agencement, stockage)
- Des combats qui comptent (pas de spam d'unités jetables à la StarCraft)

---

## 5. Système économique

### Ressources (4 types)
- **Or** — commerce, unités d'élite, technologies avancées
- **Bois** — bâtiments, unités de base, structures défensives
- **Nourriture** — entretien de population, production d'unités
- **Pierre** — fortifications, bâtiments défensifs, murs

### Méthode de collecte (v1 simple)
Approche volontairement simple pour commencer : on sélectionne un paysan, on lui ordonne d'aller sur la ressource (clic sur la ressource, comme dans AoE), et il commence automatiquement à la récolter puis à la rapporter au bâtiment de dépôt le plus proche.

*À définir plus tard :*
- Capacité de stockage / entrepôts
- Équilibre entre les 4 ressources (laquelle est la plus rare/stratégique)
- Éventuels raffinements futurs (routes commerciales, améliorations de rendement, etc.) — non prioritaires pour la v1

### Progression par âges
Système de **3 âges/époques pour l'instant** (type Age of Empires) :
- Chaque âge débloque de nouvelles unités, bâtiments et technologies
- Coût croissant de progression (ressources + temps), pour renforcer le rythme lent

### Répartition proposée par âge

| Âge | Unités débloquées | Bâtiments débloqués |
|---|---|---|
| **Âge 1 — Âge des Villages** | Paysan, Apprenti soldat | Centre-ville, Maison, Camp de bûcheron, Ferme, Mine (versions basiques) |
| **Âge 2 — Âge Féodal** | Mineur, Bûcheron, Fermier (variantes spécialisées), Soldat, Archer, Cavalier à lance | Caserne, Archerie, Écurie, Muraille |
| **Âge 3 — Âge des Châteaux** | Chevalier, Chevalier en armure, Chevalier à la lance, Chevalier porte-étendard | Forge (améliorations), Tour de garde |

*À affiner plus tard si besoin :*
- Ajustement fin de cette répartition une fois les premiers tests de jeu réalisés (l'équilibrage réel dictera souvent des ajustements)

---

## 6. Unités

- **Terrestres uniquement** (pas de naval, pas d'aérien)
- Pas de héros, pas de magie/sorts
- Chaque faction doit avoir au moins une unité unique ou une variante distincte (à définir)

### Système de statistiques
Chaque unité possède **4 statistiques de base** :
- **Vie** (points de vie)
- **Dégât d'attaque**
- **Vitesse de déplacement**
- **Armure**

Les paysans ont en plus une statistique de **vitesse de récolte**, propre à chaque ressource.

### Unités économiques

| Unité | Rôle |
|---|---|
| **Paysan** | Coût faible, récolte les ressources de base (polyvalent mais peu efficace) |
| **Mineur** | Variante spécialisée, coûte plus cher, excellent sur la pierre/l'or, inutile sur les autres ressources |
| **Bûcheron** | Variante spécialisée, coûte plus cher, excellent sur le bois, inutile sur les autres ressources |
| **Fermier** | Variante spécialisée, coûte plus cher, excellent sur la nourriture, inutile sur les autres ressources |

> Logique de design : le paysan de base reste flexible mais médiocre partout ; investir dans une variante spécialisée optimise une ressource précise au prix de la polyvalence. Ça crée un vrai choix économique (spécialiser tôt vs rester flexible).

### Unités militaires

| Unité | Description |
|---|---|
| **Apprenti soldat** | Unité de combat de base, point d'entrée du roster militaire |
| **Soldat** | Version améliorée de l'apprenti soldat |
| **Archer** | Version à distance du soldat |
| **Cavalier à lance** | Plus rapide, dégâts de base légèrement inférieurs mais plus de PV. Bonus de dégâts sur le premier coup si l'unité a chargé sur une certaine distance avant l'impact (mécanique de charge) |
| **Chevalier** | Meilleure version du soldat |
| **Chevalier en armure** | Moins de dégâts, mais plus d'armure et de vie (rôle de "tank") |
| **Chevalier à la lance** | Moins de dégâts et portée d'attaque réduite — probable rôle anti-cavalerie à confirmer (le classique "porteur de lance contre cavalerie" des RTS) |
| **Chevalier porte-étendard** | Unité rare et coûteuse à obtenir. Montée à cheval, meilleure unité du roster toutes stats confondues. Buff les unités alliées à proximité — pensée comme un "leader" qui part au combat avec ses troupes |

*Points encore ouverts, à ajuster lors des premiers tests :*
- Valeurs exactes des stats une fois en jeu (les valeurs ci-dessous sont une première proposition, pas des chiffres finaux)
- Coûts en ressources et temps de production de chaque unité (à définir avec l'équilibrage économique)
- Unités uniques propres à chaque royaume (aucune pour l'instant, voir section 3)

### Proposition de valeurs relatives (échelle 1-10, à ajuster en playtest)

| Unité | Vie | Dégât | Vitesse | Armure |
|---|---|---|---|---|
| Paysan | 3 | 1 | 4 | 1 |
| Apprenti soldat | 4 | 3 | 4 | 2 |
| Soldat | 5 | 4 | 4 | 2 |
| Archer | 3 | 4 | 4 | 1 |
| Cavalier à lance | 6 | 3 | 8 | 2 |
| Chevalier | 6 | 5 | 4 | 3 |
| Chevalier en armure | 7 | 3 | 3 | 6 |
| Chevalier à la lance | 5 | 3 | 4 | 3 |
| Chevalier porte-étendard | 9 | 7 | 6 | 6 |

### Contre-systèmes proposés (première passe)

- **Archer** > unités de mêlée à distance (dégâts avant contact), mais fragile au corps-à-corps une fois engagé
- **Cavalier à lance** > Archer (rapide, atteint l'archer avant qu'il inflige trop de dégâts, bonus de charge)
- **Chevalier à la lance** > Cavalier à lance (rôle anti-cavalerie classique : portée courte mais pensé pour stopper les charges)
- **Chevalier en armure** > unités légères (infanterie/archers) grâce à son armure élevée, mais perd du terrain face à des unités à fort dégât brut
- **Chevalier porte-étendard** : unité rare et chère, forte sur le papier, mais son vrai intérêt est son buff aux unités alliées proches — à ne jamais envoyer seul

*Ce triangle (archer > cavalier léger, lance > cavalier, cavalerie > archer) reprend la logique classique du genre RTS ; à retester et ajuster une fois en jeu.*

---

## 7. Bâtiments

Liste simple pour une v1, cohérente avec la répartition par âge (section 5) :

| Bâtiment | Fonction | Débloqué à |
|---|---|---|
| **Centre-ville** | Cœur de la base, production de paysans, dépôt de ressources, changement d'âge | Âge 1 |
| **Maison** | Augmente la population maximale | Âge 1 |
| **Camp de bûcheron** | Dépôt de bois à proximité des forêts | Âge 1 |
| **Ferme** | Production/dépôt de nourriture | Âge 1 |
| **Mine (dépôt)** | Dépôt d'or/pierre à proximité des gisements | Âge 1 |
| **Caserne** | Production d'infanterie (apprenti soldat, soldat) | Âge 2 |
| **Archerie** | Production d'archers | Âge 2 |
| **Écurie** | Production de cavalerie (cavalier à lance) | Âge 2 |
| **Muraille** | Défense passive, ralentit/bloque l'ennemi | Âge 2 |
| **Forge** | Améliorations d'armes/armures pour les unités existantes | Âge 3 |
| **Tour de garde** | Défense active à distance | Âge 3 |

*À affiner plus tard si besoin : coûts de construction, temps de construction, capacités de stockage précises des dépôts.*

---

## 8. Combat et victoire

- **Condition de victoire** : destruction totale de l'adversaire (élimination de toutes ses unités et bâtiments, ou a minima de son centre de pouvoir)
- Pas de conditions de victoire alternatives prévues pour l'instant (contrôle de territoire, victoire économique, etc. — à réévaluer si besoin)
- Rythme de combat cohérent avec l'approche "lente et stratégique" : les batailles doivent être préparées, pas improvisées

---

## 9. Modes de jeu

- **Solo** : escarmouche contre IA (pas de campagne narrative scénarisée)
- **Multijoueur** : jusqu'à **4v4 maximum**, la taille exacte de la partie (1v1, 2v2, 3v3, 4v4) étant définie par les joueurs au lancement de la partie
- Possibilité d'affronter des **bots (IA)**, seul ou en complément de joueurs humains

---

## 10. Direction artistique

- **Style** : pixel art **8-bit minimaliste** (confirmé, c'est bien le choix retenu)
- **Caméra** : isométrique (type Age of Empires)
- **Palette de couleurs** : inspiration **Stardew Valley**, mais uniquement pour la palette — tons chauds, ambiance "été/vacances", pas une palette 8-bit terne ou grisâtre. Contraste **doux/pastel**, avec une dominante **chaude** (orangés, pêche, jaunes doux, verts tendres, etc.) — une palette variée plutôt que limitée à une ou deux teintes, mais toujours dans cet esprit pastel chaleureux (à l'opposé de pastels froids type bleu/violet clair).
- **Palette et détails précis** : moodboard à constituer avant toute production graphique (voir référence ci-dessous)

*Recommandation* : ce mariage "sprites 8-bit très simples + palette chaude et estivale" est un bon compromis — ça garde une production graphique rapide et gérable en solo/petite équipe (peu de détail par sprite), tout en donnant au jeu une identité chaleureuse et accueillante plutôt qu'une ambiance froide ou austère souvent associée au RTS 8-bit classique.

---

## 11. Contraintes de production

- **Équipe** : solo ou petite équipe indie
- **Moteur de jeu** : recommandation **Godot**, puisque tu n'as pas de préférence ni d'expérience préalable avec un moteur — et bonne nouvelle, ce choix reste valable même avec la contrainte "jouable en navigateur".

**Pourquoi Godot pour ce projet précis :**
- Gratuit et open-source, aucune contrainte de licence ou de royalties, important pour un projet solo/indie
- Excellent support natif du 2D et du pixel art (pas de mise à l'échelle floue, contrôle précis des pixels)
- Poids et complexité raisonnables pour apprendre en solo, contrairement à Unreal qui est pensé pour de grosses équipes en 3D
- Communauté active avec des tutoriels et ressources existants spécifiquement pour des RTS en 2D/isométrique (pathfinding, sélection de groupe, brouillard de guerre)
- **Export HTML5/Web natif** : Godot peut compiler le jeu directement en WebAssembly, jouable dans un navigateur sans plugin, hébergeable sur une simple page web
- Le multijoueur (nécessaire ici, jusqu'à 4v4) reste supporté en export web via WebSocket, bien que ça demande un peu plus de configuration réseau qu'en export PC classique (à garder en tête pour la phase technique)

**Point d'attention pour la suite** : pour un jeu 100% navigateur avec multijoueur, il faudra aussi prévoir un petit serveur (hébergement) qui fait le lien entre les joueurs — ce sera à voir en détail au moment du développement, mais ce n'est pas bloquant, juste une brique technique en plus à prévoir.

Unity reste une alternative solide (export web aussi disponible, WebGL), mais Godot est généralement considéré comme plus simple à prendre en main pour un débutant sur un projet 2D, avec moins de complexité inutile.

*Ce choix sera à confirmer/reconsidérer au moment de démarrer le développement.*

---

## 12. Questions ouvertes à trancher avant le développement

La plupart des points sont maintenant tranchés dans ce document. Il reste surtout de l'**équilibrage fin**, qui se fera naturellement une fois le prototype jouable :

1. Ajustement des valeurs de stats et des coûts de production une fois testées en jeu
2. Ajustement de la répartition unités/bâtiments par âge si le rythme de partie l'exige
3. Nom définitif du jeu ("Projet RTS" reste le titre de travail pour l'instant)
4. Éventuelles différenciations entre royaumes (unités uniques, bonus) — non prioritaire, les deux royaumes utilisent le même roster pour l'instant

Tout le reste (direction artistique, palette, moteur, unités, bâtiments, âges, contre-systèmes, modes de jeu) est acté dans ce document.

---

## 13. Prochaines étapes

Une fois ce document validé et complété (notamment section 12), la prochaine discussion pourra se concentrer sur :
- Le choix du moteur de jeu
- La mise en place du prototype technique (mouvement d'unités, sélection, collecte de ressources)
- La conception de l'arbre technologique complet
