# Équilibrage chiffré — v0.1

Traduction des tables du [GDD](GDD.md) en valeurs de jeu exploitables par la
simulation. Les chiffres vivent dans `src/data/` : **ce document explique les
choix, il ne fait pas autorité sur les valeurs** — le code est la source de
vérité, et il est vérifié par `npm test`.

```bash
npm test        # 74 vérifications d'intégrité et d'équilibrage
npm run balance # rapport complet : duels, rendements, rythme de partie
npm run typecheck
```

---

## 1. Le modèle de combat

Le GDD ne donne que quatre statistiques par unité. On s'y tient :

```
dégâts = max(1, attaque + bonus_de_classe + bonus_de_charge - armure_de_la_cible)
```

Trois décisions se cachent là-dedans.

**Une seule valeur d'armure**, pas de types de dégâts séparés (perforant /
contondant) comme dans Age of Empires 2. Un joueur qui lit « armure 5 » sait
immédiatement ce que ça vaut contre n'importe quoi. Le prix à payer : les
contres ne peuvent plus passer par les types de dégâts, ils passent donc par
`bonusDamage`, qui vise une **classe** d'unité (`infantry`, `archer`,
`cavalry`, `villager`, `building`).

**Un plancher de 1 dégât.** Sans lui, un chevalier en armure (armure 5) serait
littéralement invulnérable aux paysans (attaque 3). Une unité indestructible
par une catégorie entière casse plus de choses qu'elle n'en équilibre.

**Des cadences lentes** — 2 secondes et plus entre deux coups. C'est le levier
principal du rythme « lent et stratégique » du GDD §4 : les batailles durent
assez longtemps pour qu'un repositionnement ou un renfort change leur issue.

### Comparer des coûts hétérogènes

Un archer coûte du bois et de l'or, un soldat de la nourriture et du bois. Pour
les comparer, chaque ressource reçoit un poids :

| Ressource | Poids | Pourquoi |
|---|---|---|
| Nourriture | 1,0 | Référence, abondante et renouvelable via les fermes |
| Bois | 1,0 | Abondant en début de partie |
| Or | 1,75 | Récolte lente, gisements finis et disputés sur la carte |
| Pierre | 1,5 | Récolte lente, mais moins demandée que l'or |

La colonne « Val. » du rapport est ce coût pondéré. C'est ce qui permet de dire
qu'un archer (84) est une unité *bon marché* malgré son or.

---

## 2. Unités

### Économie

| Unité | Âge | Coût | Prod. | Nourr. | Bois | Or | Pierre |
|---|---|---|---|---|---|---|---|
| Paysan | 1 | 50 N | 20 s | **0,40** | **0,35** | **0,30** | **0,30** |
| Fermier | 2 | 60 N 40 B | 30 s | **0,70** | 0,10 | 0,10 | 0,10 |
| Bûcheron | 2 | 60 N 40 B | 30 s | 0,10 | **0,65** | 0,10 | 0,10 |
| Mineur | 2 | 70 N 40 B | 35 s | 0,10 | 0,10 | **0,60** | **0,55** |

*(ressources par seconde)*

Le choix économique central du GDD §6 — se spécialiser ou rester flexible —
n'existe que si la spécialisation met un temps *sensible* à se rembourser :

| Investissement | Amortissement |
|---|---|
| Fermier plutôt qu'un paysan sur la nourriture | 167 s |
| Bûcheron plutôt qu'un paysan sur le bois | 167 s |
| Mineur plutôt qu'un paysan sur l'or | 114 s |
| Mineur plutôt qu'un paysan sur la pierre | 160 s |

Deux à trois minutes : assez long pour que spécialiser au mauvais moment coûte
cher, assez court pour que ce soit rentable sur une partie de 30 minutes. Un
test verrouille cette fourchette entre 1 et 5 minutes. En dessous, spécialiser
deviendrait un réflexe automatique et le choix disparaîtrait ; au-dessus,
personne ne le ferait jamais.

Le mineur couvre **deux** ressources, ce qui justifie ses 10 nourriture de plus
et ses 5 secondes de production supplémentaires.

### Militaire

| Unité | Âge | Coût | Val. | Prod. | PV | Att | Arm | Vit | Portée |
|---|---|---|---|---|---|---|---|---|---|
| Apprenti soldat | 1 | 60 N 20 B | 80 | 20 s | 55 | 6 | 1 | 1,00 | 0,6 |
| Soldat | 2 | 65 N 25 B | 90 | 24 s | 75 | 9 | 1 | 1,00 | 0,6 |
| Archer | 2 | 40 B 25 O | 84 | 26 s | 45 | 8 | 0 | 1,00 | **5,0** |
| Cavalier à lance | 2 | 80 N 30 O | 133 | 30 s | 90 | 7 | 1 | **1,80** | 0,6 |
| Chevalier *(cavalerie)* | 3 | 80 N 50 O | 168 | 32 s | 100 | **15** | 2 | 1,00 | 0,6 |
| Chevalier en armure | 3 | 75 N 50 O | 163 | 38 s | 130 | 7 | **5** | 0,85 | 0,6 |
| Chevalier à la lance | 3 | 45 N 40 B 20 O | 120 | 28 s | 80 | 7 | 2 | 1,00 | **1,4** |
| Chevalier porte-étendard | 3 | 250 N 300 O | 775 | 90 s | 180 | 18 | 5 | 1,50 | 0,6 |

Capacités particulières :

- **Cavalier à lance** — charge : +8 dégâts au premier coup après 4 tuiles
  parcourues sans s'arrêter, rechargeable toutes les 12 s.
- **Chevalier** — classé `cavalry` : c'est un chevalier monté, et c'est ce qui
  le rend vulnérable au chevalier à la lance (voir §3). Sa vitesse reste celle
  d'un fantassin, conformément à sa note du GDD : cavalerie lourde de ligne,
  pas cavalier de raid.
- **Chevalier à la lance** — +16 dégâts contre la classe `cavalry`, et une
  allonge de 1,4 tuile là où la mêlée standard frappe à 0,6. Soit
  **22 dégâts sur un cavalier contre 6 sur un soldat** : le contre est assez
  net pour être lisible sans lire une infobulle.
- **Chevalier porte-étendard** — charge +10, aura de +2 attaque et +1 armure
  sur 6 tuiles, **1 seul exemplaire par joueur**, 3 de population.

### Vitesses

Les vitesses ont été relevées d'un facteur 1,7 après le premier essai manette
en main : les unités étaient jugées trop lentes, et à raison. Le « rythme lent
et stratégique » du GDD §4 tient à la durée des batailles et à la longueur de
la phase économique — marcher lentement n'est pas stratégique, c'est
simplement ennuyeux.

Les rapports entre unités n'ont pas bougé et tous les contres tiennent. Un seul
effet secondaire mesurable : la cavalerie franchissant plus vite la zone de tir,
l'archer place un projectile de moins pendant l'approche, ce qui fait passer la
marge du cavalier de 46 à 53 % de PV restants. C'est encore dans la fourchette
visée, mais c'est à surveiller si les archers déçoivent au playtest.

### Fidélité aux notes du GDD

Les notes 1-10 du GDD §6 sont conservées dans le champ `gddRank` de chaque
unité, et un test vérifie que les valeurs de jeu respectent leur ordre : si le
document classe A au-dessus de B sur une statistique, la valeur réelle doit
suivre. C'est ce qui empêche le code et le document de raconter deux histoires
différentes au bout de quelques mois d'itération.

Ce test a d'ailleurs attrapé une incohérence dès la première exécution : le
chevalier en armure (noté 3 en dégâts) frappait aussi fort que l'archer (noté
4). Son attaque est passée de 8 à 7.

---

## 3. Les contres, vérifiés et non postulés

`src/balance/combat.ts` contient un simulateur de duel au pas fixe. Les deux
unités partent à 8 tuiles et avancent l'une vers l'autre : la portée et la
vitesse comptent réellement, au lieu d'être ignorées par une simple comparaison
de DPS.

| Contre annoncé au GDD §6 | Durée | PV restants au vainqueur |
|---|---|---|
| Cavalier à lance > Archer | 15 s | 46 % |
| Chevalier à la lance > Cavalier à lance | 10 s | 65 % |
| Chevalier à la lance > Chevalier | 11 s | 35 % |
| Chevalier en armure > Archer | 19 s | 82 % |
| Chevalier en armure > Soldat | 28 s | 60 % |
| Chevalier > Chevalier en armure | 28 s | 35 % |
| Soldat > Apprenti soldat | 16 s | 53 % |
| Porte-étendard > Chevalier | 13 s | 67 % |

La marge compte autant que la victoire. Un contre qui laisse 90 % de PV au
vainqueur ne rend pas l'unité contrée mauvaise, il la rend **injouable** :
personne ne la produit plus, et elle disparaît du jeu. La fourchette visée est
30-70 %, et un test la fait respecter.

Une seule exception assumée, marquée `hardCounter` dans les tests : le
chevalier en armure contre l'archer (82 %). C'est précisément sa raison d'être
— absorber les flèches — et l'archer garde son rôle contre tout le reste.

### Ce que l'allonge apporte réellement

Le chevalier à la lance frappe à 1,4 tuile ; son adversaire de mêlée doit donc
franchir 0,8 tuile de plus avant de riposter. Le simulateur mesure cette avance :
**0,75 seconde**, soit un coup gratuit par engagement. Contre le chevalier, le
soldat ou le chevalier en armure, la lance frappe toujours la première.

C'est agréable, et c'est tout. Une unité de mêlée ne recule pas pour maintenir
sa distance : l'allonge donne l'ouverture, pas un avantage continu. La mesure
est sans appel — en portant la portée de la lance jusqu'à 2,5 tuiles sans rien
changer d'autre, **le chevalier gagnait encore le duel avec 65 % de ses PV**.

Ce qui bat le chevalier, c'est le bonus anti-cavalerie, qui ne s'applique que
parce que le chevalier est désormais classé `cavalry`. Un test dédié verrouille
cette distinction : privée de son bonus, la lance conserve le premier coup et
perd quand même. Si ce test venait à échouer, c'est que le modèle s'est mis à
donner beaucoup trop de poids à la portée en mêlée.

**Ce que ces duels ne disent pas.** Aucune micro-gestion n'est simulée : les
archers ne reculent pas en tirant. Leurs résultats sont donc un *plancher*,
pas leur potentiel réel entre les mains d'un joueur. Et un duel 1v1 ne dit
rien du combat en groupe, où la portée et les auras prennent une tout autre
importance. C'est le playtest qui tranchera.

---

## 4. Bâtiments

| Bâtiment | Âge | Coût | Constr. | PV | Arm | Particularité |
|---|---|---|---|---|---|---|
| Centre-ville | 1 | 300 B 150 P | 120 s | 2000 | 3 | +10 pop, dépôt universel, avance d'âge |
| Maison | 1 | 40 B | 25 s | 400 | 0 | +5 pop |
| Camp de bûcheron | 1 | 80 B | 30 s | 500 | 0 | Dépôt de bois |
| Ferme | 1 | 70 B | 25 s | 400 | 0 | Dépôt + 400 de nourriture, épuisable |
| Mine | 1 | 100 B | 35 s | 500 | 0 | Dépôt d'or et de pierre |
| Caserne | 2 | 175 B | 60 s | 1200 | 2 | Infanterie |
| Archerie | 2 | 175 B | 60 s | 1100 | 2 | Archers |
| Écurie | 2 | 200 B | 65 s | 1200 | 2 | Cavalerie |
| Muraille | 2 | 5 P /segment | 8 s | 800 | 6 | Défense passive |
| Forge | 3 | 150 B 50 O | 70 s | 1200 | 2 | Améliorations (à concevoir) |
| Tour de garde | 3 | 50 B 125 P | 50 s | 1000 | 5 | Attaque 12, portée 7 |

Les temps sont donnés pour **un seul bâtisseur**.

Deux points de conception méritent d'être signalés :

**La ferme est épuisable** (400 de nourriture) et doit être reconstruite. Ça
maintient une dépense de bois récurrente en fin de partie, empêche l'économie
de se figer et donne une raison de continuer à produire des paysans.

**La muraille se paie en pierre**, la ressource la plus lente à récolter.
Fortifier devient un vrai arbitrage contre l'avance d'âge, au lieu d'être un
réflexe systématique.

---

## 5. Rythme de partie

| Palier | Coût | Recherche | Délai estimé |
|---|---|---|---|
| Âge 2 — Féodal | 600 N | 100 s | ~6,7 min (8 paysans) |
| Âge 3 — Châteaux | 1000 N 600 O | 160 s | ~6,0 min de plus (24 collecteurs) |

Ces coûts ont été relevés après un essai jugé trop expéditif. Avec la carte de
120 × 120, les trajets s'allongent aussi : l'âge 2 tombe autour de 11-13 minutes
en conditions réelles et l'âge 3 vers 25 minutes.

Ce modèle est **optimiste** : il suppose un revenu constant et aucune dépense
concurrente. En partie réelle — maisons, bâtiments militaires, premières unités
— compter 1,5 à 2 fois plus. Soit l'âge 2 vers 8-10 minutes et l'âge 3 vers
20 minutes, ce qui place le premier affrontement sérieux bien après une vraie
phase économique, comme le veut le GDD §4.

Autre garde-fou du même ordre : **dix soldats mettent 67 secondes à détruire un
centre-ville** (2000 PV, armure 3). C'est délibérément long. Le défenseur a le
temps de voir venir et de réagir, et le rush éclair est structurellement exclu.

**Population maximale : 100.** Bas pour un RTS, pour deux raisons qui vont dans
le même sens : le GDD §4 refuse le spam d'unités jetables, et huit joueurs
simultanés dans un navigateur imposent de tenir le nombre d'entités.

**Ressources de départ** : 200 nourriture, 200 bois, 100 or, 100 pierre, avec
3 paysans et un centre-ville.

---

## 6. Points ouverts

Ce qui reste à trancher, par ordre d'impact :

1. **Le GDD décrit le chevalier comme de l'infanterie et sa lance comme ayant
   une portée réduite.** Les deux ont été inversés pour que le chevalier à la
   lance puisse le contrer : le chevalier est monté (`cavalry`), et la lance a
   l'allonge (1,4 tuile). Sans ce changement de classe, aucune unité du roster
   n'avait de quoi menacer le chevalier, qui gagnait tous ses duels. **Le GDD
   §6 mérite d'être mis à jour en conséquence**, ou la décision inversée si le
   chevalier doit rester un fantassin — auquel cas il faudra lui trouver un
   autre contre.

2. **L'archer est l'unité la moins rentable par ressource investie** (1,95
   contre 4,17 pour le soldat). C'est attendu — l'indicateur ne mesure ni la
   portée, ni la sécurité, ni le fait qu'un groupe d'archers concentre ses tirs
   là où une mêlée s'étale — mais c'est à surveiller au premier playtest de
   masse. S'il est décevant en nombre, la cadence est le premier levier.

3. **La forge n'a pas encore d'améliorations.** L'arbre technologique reste
   entièrement à concevoir (GDD §13). Les tables de données sont prêtes à
   l'accueillir.

4. **Aucune unité de siège.** Le GDD n'en prévoit pas, mais avec un centre-ville
   à 2000 PV et des murailles à 800, une armée sans siège finira par buter sur
   une base bien fortifiée. À reconsidérer si les parties se figent.

5. **Les deux royaumes sont identiques** (GDD §3), ce qui est assumé pour la
   v1. Rien dans les données n'empêche d'ajouter des variantes par faction plus
   tard : il suffira d'un champ `faction` sur les unités concernées.

---

## 7. Structure du code

```
src/
  data/          Tables de données pures, sans logique
    types.ts       Définitions de types
    constants.ts   Tick de simulation, plancher de dégâts, pop max, départ
    resources.ts   Les 4 ressources
    ages.ts        Coûts et durées des 3 âges
    units.ts       Roster complet
    buildings.ts   Bâtiments
    data.test.ts   Intégrité des tables et fidélité au GDD
  balance/
    combat.ts      Formule de dégâts, simulateur de duel
    economy.ts     Rendements, amortissement, rythme des âges
    report.ts      Rapport console (npm run balance)
    balance.test.ts  Verrous d'équilibrage
```

Deux règles à tenir dans la suite du développement :

**Les données ne contiennent aucune logique.** Elles seront lues telles quelles
par la simulation, par l'IA d'escarmouche et par le serveur multijoueur.

**Tout est déterministe.** Aucun `Math.random`, aucune dépendance à l'horloge
système, un pas de simulation fixe à 20 Hz. Le multijoueur 4v4 du GDD §9 passe
nécessairement par du lockstep — seuls les ordres transitent sur le réseau,
chaque client simule le reste à l'identique — et un seul écart de calcul entre
deux clients fait diverger la partie. Cette contrainte se respecte dès la
première ligne ou se paie par une réécriture.
