# Projet RTS — Saphir contre Rubis

RTS médiéval en pixel art 8-bit, vue isométrique, jouable dans le navigateur.
Deux royaumes humains, quatre ressources, trois âges, et un rythme lent et
réfléchi façon *Age of Empires 1*.

*Titre de travail — le nom définitif reste à trouver.*

## État du projet

Phase de conception. Pas encore de jeu jouable.

- ✅ [Game Design Document](docs/GDD.md)
- ✅ [Équilibrage chiffré](docs/BALANCE.md) — unités, bâtiments, économie, âges
- ⬜ Prototype technique : carte isométrique, sélection, déplacement, récolte
- ⬜ Arbre technologique
- ⬜ Direction artistique : palette et specs des sprites
- ⬜ Multijoueur

## Stack

TypeScript + PixiJS, sans moteur de jeu. Le jeu *est* une page web, ce qui
correspond directement à la contrainte « jouable dans le navigateur » du GDD, et
le serveur multijoueur en Node partagera le même code de simulation que le
client — un vrai avantage pour tenir le déterminisme qu'impose le lockstep.

Aucune dépendance de production pour l'instant : les données d'équilibrage et
leurs outils d'analyse sont du TypeScript exécuté nativement par Node 22
(qui supprime les annotations de type à la volée, sans étape de compilation).

## Commandes

```bash
npm install
npm test         # intégrité des données et verrous d'équilibrage
npm run balance  # rapport d'équilibrage : duels, rendements, rythme de partie
npm run typecheck
```

`npm run balance` est l'outil à relancer après chaque retouche d'un chiffre :
il montre immédiatement ce que le changement casse ailleurs.

## Organisation

```
docs/     GDD et documentation d'équilibrage
src/data/ Tables de données pures (unités, bâtiments, âges, ressources)
src/balance/ Modèle de combat, analyse économique, rapport
```

Prérequis : Node 22.18 ou plus récent.
