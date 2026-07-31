# Projet RTS — Saphir contre Rubis

RTS médiéval en pixel art 8-bit, vue isométrique, jouable dans le navigateur.
Deux royaumes humains, quatre ressources, trois âges, et un rythme lent et
réfléchi façon *Age of Empires 1*.

*Titre de travail — le nom définitif reste à trouver.*

```bash
npm install
npm run dev     # http://localhost:5173
```

## État du projet

Prototype jouable : la boucle complète tourne, du premier paysan à la
destruction de la base adverse, contre une IA d'escarmouche.

- ✅ [Game Design Document](docs/GDD.md)
- ✅ [Équilibrage chiffré](docs/BALANCE.md) — unités, bâtiments, économie, âges
- ✅ [Prototype jouable](docs/PROTOTYPE.md) — carte, récolte, construction, combat, IA
- ⬜ Brouillard de guerre
- ⬜ Arbre technologique
- ⬜ Direction artistique : palette et sprites
- ⬜ Multijoueur

Tout est encore en formes géométriques : la production graphique attend le
moodboard (GDD §10).

## Stack

TypeScript + PixiJS, sans moteur de jeu. Le jeu *est* une page web, ce qui
correspond directement à la contrainte « jouable dans le navigateur » du GDD,
et le serveur multijoueur en Node partagera le même code de simulation que le
client — un vrai avantage pour tenir le déterminisme qu'impose le lockstep.

Node 22.18 ou plus récent (les fichiers `.ts` s'exécutent nativement, sans
étape de compilation pour les tests et les outils).

## Commandes

```bash
npm run dev        # serveur de développement
npm run build      # page statique dans dist/, hébergeable telle quelle
npm test           # 50 vérifications : données, équilibrage, simulation
npm run balance    # rapport d'équilibrage : duels, rendements, rythme
npm run typecheck

node scripts/smoke.mjs   # parcours joueur complet dans un navigateur
```

`npm run balance` est l'outil à relancer après chaque retouche d'un chiffre :
il montre immédiatement ce que le changement casse ailleurs.

## Organisation

```
docs/         GDD, équilibrage, prototype
src/data/     Tables de données pures — la source de vérité des chiffres
src/balance/  Modèle de combat, analyse économique, rapport
src/sim/      Simulation déterministe : monde, grille, ordres, IA
src/render/   Rendu isométrique PixiJS
src/ui/       Interface HTML
scripts/      Test de bout en bout
```

Les chiffres du jeu vivent tous dans `src/data`. Modifier une valeur y change
le jeu immédiatement, sans toucher à une ligne de logique — et `npm test` dit
aussitôt ce que ça déséquilibre.
