/**
 * Tests de la simulation.
 *
 * Ils jouent de vraies parties sans affichage : c'est le seul moyen de
 * vérifier qu'une boucle de jeu de plusieurs dizaines de minutes ne se bloque
 * pas, et ça tourne en quelques secondes.
 */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SIM_TICK_SECONDS, STARTING_RESOURCES } from '../data/constants.ts';
import { AGES } from '../data/ages.ts';
import { UNITS } from '../data/units.ts';
import { createAi, stepAi } from './ai.ts';
import { ageProgress, orderGather, orderGroup, orderMove, sandboxSpawn, train } from './commands.ts';
import { findPath, rebuildBlocked } from './grid.ts';
import { stepWorld } from './sim.ts';
import type { Entity, World } from './types.ts';
import {
  createWorld,
  findNearest,
  isEntityVisible,
  isHarvestable,
  spawnBuilding,
  spawnResource,
  spawnUnit,
  visibilityAt,
} from './world.ts';

/** Fait tourner la simulation pendant N secondes de temps de jeu. */
function run(world: World, seconds: number, onTick?: (dt: number) => void): void {
  const ticks = Math.round(seconds / SIM_TICK_SECONDS);
  for (let i = 0; i < ticks; i++) {
    stepWorld(world);
    onTick?.(SIM_TICK_SECONDS);
  }
}

function unitsOf(world: World, owner: number): Entity[] {
  return [...world.entities.values()].filter((e) => e.kind === 'unit' && e.owner === owner);
}

describe('génération du monde', () => {
  it('place deux bases complètes et des ressources des quatre types', () => {
    const world = createWorld();

    for (const owner of [0, 1]) {
      const owned = [...world.entities.values()].filter((e) => e.owner === owner);
      strictEqual(owned.filter((e) => e.defId === 'centre_ville').length, 1);
      strictEqual(owned.filter((e) => e.defId === 'paysan').length, 3);
    }

    const resources = new Set(
      [...world.entities.values()].filter((e) => e.kind === 'resource').map((e) => e.resource),
    );
    for (const expected of ['food', 'wood', 'gold', 'stone']) {
      ok(resources.has(expected as never), `aucun gisement de ${expected} sur la carte`);
    }
  });

  it('est reproductible à graine égale', () => {
    // Deux clients doivent générer exactement la même carte (GDD §9).
    const a = createWorld(1234);
    const b = createWorld(1234);
    const signature = (w: World) =>
      [...w.entities.values()].map((e) => `${e.defId}:${e.x.toFixed(3)}:${e.y.toFixed(3)}`).join('|');
    strictEqual(signature(a), signature(b));
  });
});

describe('zones de ressources', () => {
  it('les gisements forment des zones d\'un seul tenant, pas un semis', () => {
    // Le GDD veut des forêts et des filons à la manière d'Age of Empires :
    // on exploite la lisière d'une masse, on ne court pas d'un arbre isolé au
    // suivant. On mesure donc le voisinage de chaque gisement.
    const world = createWorld();
    const nodes = [...world.entities.values()].filter((e) => e.kind === 'resource');
    const byTile = new Map<string, Entity>();
    for (const node of nodes) byTile.set(`${Math.floor(node.x)},${Math.floor(node.y)}`, node);

    let isolated = 0;
    for (const node of nodes) {
      const x = Math.floor(node.x);
      const y = Math.floor(node.y);
      const neighbours = [
        byTile.get(`${x + 1},${y}`),
        byTile.get(`${x - 1},${y}`),
        byTile.get(`${x},${y + 1}`),
        byTile.get(`${x},${y - 1}`),
      ].filter((n) => n?.resource === node.resource);

      if (neighbours.length === 0) isolated++;
    }

    const ratio = isolated / nodes.length;
    ok(ratio < 0.05, `${Math.round(ratio * 100)} % des gisements sont isolés de leur zone`);
  });

  it('les deux royaumes reçoivent exactement la même dotation de départ', () => {
    const world = createWorld();

    const nearBase = (owner: number) => {
      const tc = [...world.entities.values()].find(
        (e) => e.owner === owner && e.defId === 'centre_ville',
      ) as Entity;

      const counts: Record<string, number> = { food: 0, wood: 0, gold: 0, stone: 0 };
      for (const e of world.entities.values()) {
        if (e.kind !== 'resource' || e.resource === null) continue;
        if (Math.hypot(e.x - tc.x, e.y - tc.y) > 22) continue;
        counts[e.resource] = (counts[e.resource] ?? 0) + 1;
      }
      return counts;
    };

    // Miroir strict : aucun camp ne doit démarrer avantagé.
    deepStrictEqual(nearBase(0), nearBase(1));
  });
});

describe('brouillard de guerre', () => {
  it('la base est visible, le reste de la carte est inexploré', () => {
    const world = createWorld();
    const tc = [...world.entities.values()].find(
      (e) => e.owner === 0 && e.defId === 'centre_ville',
    ) as Entity;

    strictEqual(visibilityAt(world, 0, tc.x, tc.y), 2);

    const enemyTc = [...world.entities.values()].find(
      (e) => e.owner === 1 && e.defId === 'centre_ville',
    ) as Entity;
    strictEqual(visibilityAt(world, 0, enemyTc.x, enemyTc.y), 0);
  });

  it('une unité adverse hors de vue reste invisible', () => {
    const world = createWorld();
    const enemy = spawnUnit(world, 'soldat', 1, 60, 60);
    run(world, 1);

    strictEqual(isEntityVisible(world, 0, enemy), false);
  });

  it('un éclaireur dévoile le terrain, qui reste ensuite mémorisé', () => {
    const world = createWorld();
    const scout = unitsOf(world, 0)[0] as Entity;
    const target = { x: scout.x + 25, y: scout.y };

    strictEqual(visibilityAt(world, 0, target.x, target.y), 0);

    orderMove(scout, target.x, target.y);
    run(world, 60);

    strictEqual(visibilityAt(world, 0, target.x, target.y), 2);

    // L'éclaireur repart : le terrain reste connu, mais n'est plus observé.
    orderMove(scout, scout.x - 30, scout.y);
    run(world, 60);

    strictEqual(
      visibilityAt(world, 0, target.x, target.y),
      1,
      'le terrain exploré devrait rester mémorisé sans rester visible',
    );
  });

  it('on se souvient des bâtiments découverts, jamais des unités', () => {
    // Règle d'Age of Empires : le relief et les constructions sont mémorisés,
    // ce qui bouge ne l'est pas.
    const world = createWorld();
    const scout = unitsOf(world, 0)[0] as Entity;

    // Deux paysans face à face : ni l'un ni l'autre n'engage le combat, ce qui
    // isole la question de la visibilité de celle des dégâts.
    const enemyBuilding = spawnBuilding(world, 'maison', 1, 30, 30);
    const enemyUnit = spawnUnit(world, 'paysan', 1, 33.5, 31.5);

    orderMove(scout, 33, 31);
    run(world, 90);

    ok(isEntityVisible(world, 0, enemyBuilding), 'le bâtiment devrait être visible sur place');
    ok(isEntityVisible(world, 0, enemyUnit), "l'unité devrait être visible sur place");

    orderMove(scout, scout.x - 40, scout.y);
    run(world, 90);

    ok(isEntityVisible(world, 0, enemyBuilding), 'le bâtiment découvert devrait rester affiché');
    strictEqual(isEntityVisible(world, 0, enemyUnit), false, "l'unité ne devrait plus être visible");
  });
});

describe('déplacement', () => {
  it('contourne les obstacles pour atteindre sa destination', () => {
    const world = createWorld();
    const villager = unitsOf(world, 0)[0] as Entity;

    orderMove(villager, 30, 30);
    run(world, 90);

    const distance = Math.hypot(villager.x - 30, villager.y - 30);
    ok(distance < 1.5, `l'unité s'est arrêtée à ${distance.toFixed(1)} tuiles de sa destination`);
  });

  it('ne renvoie pas de chemin vers une case hors carte', () => {
    const world = createWorld();
    strictEqual(findPath(world, { x: 5, y: 5 }, { x: -3, y: 200 }).length, 0);
  });
});

describe('passages étroits', () => {
  /**
   * Mur infranchissable percé d'un seul passage d'une tuile — la situation qui
   * bloquait des groupes entiers en jeu.
   */
  function corridor(gapY = 30): World {
    const world = createWorld();
    for (let y = 20; y <= 40; y++) {
      if (y === gapY) continue;
      spawnResource(world, 'wood', 30, y);
    }
    rebuildBlocked(world);
    return world;
  }

  it('un groupe franchit un goulet au lieu de se verrouiller lui-même', () => {
    // Régression : une correction d'écartement plus forte que le pas de
    // déplacement transformait un paquet d'unités en bloc immobile, et le
    // groupe n'atteignait même pas le passage.
    const world = corridor();
    const units: Entity[] = [];
    for (let i = 0; i < 6; i++) {
      units.push(spawnUnit(world, 'soldat', 0, 26 + (i % 2) * 0.6, 29 + Math.floor(i / 2) * 0.6));
    }
    for (const unit of units) orderMove(unit, 35, 30);

    run(world, 60);

    const through = units.filter((u) => u.x > 32).length;
    strictEqual(through, units.length, `seules ${through} unités sur 6 ont franchi le passage`);
  });

  it('deux colonnes en sens inverse se croisent dans le passage', () => {
    const world = corridor();
    const left: Entity[] = [];
    const right: Entity[] = [];
    for (let i = 0; i < 3; i++) left.push(spawnUnit(world, 'soldat', 0, 27 + i * 0.5, 30));
    for (let i = 0; i < 3; i++) right.push(spawnUnit(world, 'soldat', 0, 33 + i * 0.5, 30));

    for (const unit of left) orderMove(unit, 35, 30);
    for (const unit of right) orderMove(unit, 25, 30);

    run(world, 60);

    const through = left.filter((u) => u.x > 32).length + right.filter((u) => u.x < 28).length;
    strictEqual(through, 6, `${through} unités sur 6 ont traversé`);
  });

  it('une unité à l\'arrêt finit par céder le passage', () => {
    const world = corridor();
    spawnUnit(world, 'soldat', 0, 30.5, 30.5);

    const units: Entity[] = [];
    for (let i = 0; i < 4; i++) units.push(spawnUnit(world, 'soldat', 0, 27 + i * 0.5, 30));
    for (const unit of units) orderMove(unit, 35, 30);

    run(world, 60);

    strictEqual(units.filter((u) => u.x > 32).length, 4);
  });

  it('aucune unité ne se retrouve encastrée dans un obstacle', () => {
    const world = corridor();
    const units: Entity[] = [];
    for (let i = 0; i < 8; i++) units.push(spawnUnit(world, 'soldat', 0, 29.5, 29 + i * 0.3));
    for (const unit of units) orderMove(unit, 35, 30);

    run(world, 30);

    for (const unit of units) {
      const tx = Math.floor(unit.x);
      const ty = Math.floor(unit.y);
      strictEqual(
        world.blocked[ty * world.width + tx],
        0,
        `une unité a été poussée dans un obstacle en ${tx},${ty}`,
      );
    }
  });
});

describe('économie', () => {
  it('un paysan récolte et rapporte au centre-ville', () => {
    const world = createWorld();
    const villager = unitsOf(world, 0)[0] as Entity;
    const before = world.players[0].resources.wood;

    const tree = findNearest(world, villager, (e) => isHarvestable(e, 0) && e.resource === 'wood');
    ok(tree, 'aucun arbre à proximité de la base');
    orderGather(villager, tree);

    run(world, 120);

    ok(
      world.players[0].resources.wood > before,
      'le paysan n\'a rien rapporté en deux minutes de récolte',
    );
  });

  it('le rendement observé correspond à la table de données', () => {
    // Vérifie que la simulation applique bien les taux de src/data, aux
    // allers-retours près (le paysan passe une partie de son temps à marcher).
    const world = createWorld();
    const villager = unitsOf(world, 0)[0] as Entity;
    const tree = findNearest(world, villager, (e) => isHarvestable(e, 0) && e.resource === 'wood');
    ok(tree);

    // On colle le paysan à l'arbre pour mesurer la récolte seule.
    villager.x = tree.x + 1;
    villager.y = tree.y;
    orderGather(villager, tree);

    const seconds = 20;
    run(world, seconds);

    const carried = villager.carrying?.amount ?? 0;
    const deposited = world.players[0].resources.wood - 200;
    const total = carried + deposited;
    const expected = (UNITS['paysan']?.gather?.wood ?? 0) * seconds;

    ok(
      total > expected * 0.5,
      `récolte observée ${total.toFixed(1)} contre ${expected.toFixed(1)} attendu au maximum`,
    );
    ok(
      total <= expected + 0.5,
      `récolte observée ${total.toFixed(1)} supérieure au taux théorique ${expected.toFixed(1)}`,
    );
  });
});

describe('ordres de groupe', () => {
  it('répartit les récolteurs sur le bosquet et pas sur le seul arbre cliqué', () => {
    const world = createWorld();
    const villagers = unitsOf(world, 0);
    for (let i = 0; i < 6; i++) villagers.push(spawnUnit(world, 'paysan', 0, 12 + i * 0.5, 16));

    const tree = findNearest(world, villagers[0] as Entity, (e) =>
      isHarvestable(e, 0) && e.resource === 'wood',
    );
    ok(tree);

    orderGroup(world, villagers, tree, tree.x, tree.y);

    const targets = new Set(villagers.map((v) => v.order.targetId));
    ok(
      targets.size >= 3,
      `les ${villagers.length} paysans se partagent seulement ${targets.size} arbre(s)`,
    );
    for (const villager of villagers) {
      const node = world.entities.get(villager.order.targetId ?? -1);
      strictEqual(node?.resource, 'wood', 'un paysan a été envoyé sur autre chose que du bois');
    }
  });

  it('envoie les soldats sur la troupe ennemie, pas sur le seul défenseur visé', () => {
    const world = createWorld();
    const soldiers = sandboxSpawn(world, 'soldat', 0, 40, 40, 5);
    const enemies = sandboxSpawn(world, 'paysan', 1, 43, 40, 4);
    const aimedAt = enemies[0] as Entity;

    orderGroup(world, soldiers, aimedAt, aimedAt.x, aimedAt.y);

    const targets = new Set(soldiers.map((s) => s.order.targetId));
    ok(
      targets.size >= 2,
      `les 5 soldats font tous la queue derrière la même cible (${targets.size} cible)`,
    );
    for (const soldier of soldiers) {
      const target = world.entities.get(soldier.order.targetId ?? -1);
      strictEqual(target?.owner, 1, 'un soldat vise autre chose qu\'un ennemi');
    }
  });

  it('déploie le groupe en formation au lieu de l\'entasser sur un point', () => {
    const world = createWorld();
    const soldiers = sandboxSpawn(world, 'soldat', 0, 20, 20, 9);

    orderGroup(world, soldiers, null, 32, 32);

    const destinations = new Set(soldiers.map((s) => `${s.order.x.toFixed(2)},${s.order.y.toFixed(2)}`));
    strictEqual(destinations.size, 9, 'plusieurs unités visent exactement la même case');

    for (const soldier of soldiers) {
      const spread = Math.hypot(soldier.order.x - 32, soldier.order.y - 32);
      ok(spread < 4, `un emplacement de formation est à ${spread.toFixed(1)} tuiles du point visé`);
    }
  });

  it('reste déterministe : même sélection, même répartition', () => {
    const signature = (): string => {
      const world = createWorld(99);
      const villagers = unitsOf(world, 0);
      const tree = findNearest(world, villagers[0] as Entity, (e) =>
        isHarvestable(e, 0) && e.resource === 'wood',
      );
      ok(tree);
      // Sélection donnée dans le désordre : la répartition ne doit pas en dépendre.
      orderGroup(world, [...villagers].reverse(), tree, tree.x, tree.y);
      return villagers.map((v) => `${v.id}:${v.order.targetId}`).join('|');
    };

    strictEqual(signature(), signature());
  });
});

describe('confort de jeu', () => {
  it('un paysan traverse une longue distance sans lasser le joueur', () => {
    // Garde-fou de rythme : le « lent et stratégique » du GDD porte sur la
    // durée des batailles et de la phase économique, pas sur des unités qui
    // mettent une éternité à traverser la carte.
    const world = createWorld();
    const villager = unitsOf(world, 0)[0] as Entity;
    const start = { x: villager.x, y: villager.y };

    orderMove(villager, start.x + 20, start.y);
    run(world, 20);

    const travelled = Math.hypot(villager.x - start.x, villager.y - start.y);
    ok(travelled > 15, `le paysan n'a parcouru que ${travelled.toFixed(1)} tuiles en 20 secondes`);
  });
});

describe('combat', () => {
  it('deux unités ennemies s\'engagent seules et une seule survit', () => {
    const world = createWorld();
    sandboxSpawn(world, 'soldat', 0, 32, 32, 1);
    sandboxSpawn(world, 'apprenti_soldat', 1, 34, 32, 1);

    run(world, 60);

    const saphir = unitsOf(world, 0).filter((e) => UNITS[e.defId]?.role === 'military');
    const rubis = unitsOf(world, 1).filter((e) => UNITS[e.defId]?.role === 'military');

    strictEqual(rubis.length, 0, "l'apprenti soldat aurait dû être tué par le soldat");
    strictEqual(saphir.length, 1);
  });

  it('les contres du tableau d\'équilibrage se retrouvent en jeu', () => {
    // Le simulateur de duel de src/balance est un modèle abstrait ; ici, ce
    // sont les vraies unités qui se déplacent et s'engagent sur la carte.
    const world = createWorld();
    sandboxSpawn(world, 'chevalier_lance', 0, 32, 32, 1);
    sandboxSpawn(world, 'chevalier', 1, 38, 32, 1);

    run(world, 90);

    const survivors = (owner: number) =>
      unitsOf(world, owner).filter((e) => UNITS[e.defId]?.role === 'military');

    strictEqual(
      survivors(1).length,
      0,
      'le chevalier survit au chevalier à la lance, contrairement au tableau des contres',
    );
    strictEqual(survivors(0).length, 1);
  });

  it('un paysan finit par abattre un bâtiment', () => {
    const world = createWorld();
    const villager = spawnUnit(world, 'paysan', 0, 50, 50);
    const enemyTc = [...world.entities.values()].find(
      (e) => e.owner === 1 && e.defId === 'centre_ville',
    );
    ok(enemyTc);

    villager.order = { kind: 'attack', targetId: enemyTc.id, x: enemyTc.x, y: enemyTc.y };
    const before = enemyTc.hp;
    run(world, 120);

    ok(enemyTc.hp < before, "le centre-ville n'a pas encaissé de dégâts");
  });
});

describe('partie complète contre l\'IA', () => {
  it('quinze minutes de jeu sans blocage, avec une économie qui progresse', () => {
    const world = createWorld();
    const ai = createAi(1);

    run(world, 15 * 60, (dt) => stepAi(world, ai, dt));

    const rubis = world.players[1];
    const villagers = unitsOf(world, 1).filter((e) => UNITS[e.defId]?.gather);

    ok(villagers.length > 3, `l'IA n'a produit aucun paysan (${villagers.length})`);
    ok(rubis.age >= 2, `l'IA est restée à l'âge ${rubis.age} au bout de 15 minutes`);
    ok(rubis.popCap > 10, "l'IA n'a construit aucune maison");

    const buildings = [...world.entities.values()].filter(
      (e) => e.owner === 1 && e.kind === 'building' && e.buildProgress >= 1,
    );
    ok(buildings.length >= 3, `l'IA n'a terminé que ${buildings.length} bâtiment(s)`);
  });

  it('la simulation reste déterministe sur une longue partie', () => {
    // Deux mondes identiques, même graine, mêmes ordres : à l'issue de dix
    // minutes de jeu, l'état doit être rigoureusement identique. C'est la
    // propriété sans laquelle le multijoueur en lockstep est impossible.
    const signature = (world: World): string =>
      [...world.entities.values()]
        .map((e) => `${e.id}:${e.defId}:${e.x.toFixed(4)}:${e.y.toFixed(4)}:${e.hp}`)
        .join('|');

    const first = createWorld(777);
    const firstAi = createAi(1);
    run(first, 600, (dt) => stepAi(first, firstAi, dt));

    const second = createWorld(777);
    const secondAi = createAi(1);
    run(second, 600, (dt) => stepAi(second, secondAi, dt));

    strictEqual(signature(first), signature(second));
  });
});

describe('progression d\'âge', () => {
  it('chiffre exactement ce qui manque', () => {
    const world = createWorld();
    const progress = ageProgress(world, 0);

    strictEqual(progress.nextAge, 2);
    strictEqual(progress.nameFr, 'Âge Féodal');
    // Le manque se déduit des données, jamais d'un chiffre recopié : retoucher
    // le coût d'un âge ne doit pas casser un test qui n'en parle pas.
    const required = AGES[2].advanceCost?.food ?? 0;
    strictEqual(progress.missing.food, required - STARTING_RESOURCES.food);
    strictEqual(progress.buildingsOwned, 0);
    strictEqual(progress.buildingsRequired, 2);
    strictEqual(progress.ready, false);
  });

  it('ne signale plus les ressources une fois le coût couvert', () => {
    const world = createWorld();
    world.players[0].resources.food = 5000;

    const progress = ageProgress(world, 0);
    strictEqual(Object.keys(progress.missing).length, 0);
    // Les bâtiments manquent toujours : le passage reste impossible.
    strictEqual(progress.ready, false);
  });

  it('passe à « prêt » quand ressources et bâtiments sont réunis', () => {
    const world = createWorld();
    world.players[0].resources.food = 5000;
    spawnBuilding(world, 'maison', 0, 40, 40);
    spawnBuilding(world, 'camp_bucheron', 0, 44, 40);

    const progress = ageProgress(world, 0);
    strictEqual(progress.buildingsOwned, 2);
    strictEqual(progress.ready, true);
  });

  it('ne compte pas le centre-ville ni les chantiers en cours', () => {
    // Le centre-ville est offert au départ : le compter reviendrait à offrir
    // un tiers du prérequis. Un chantier inachevé ne prouve rien non plus.
    const world = createWorld();
    world.players[0].resources.food = 5000;
    spawnBuilding(world, 'maison', 0, 40, 40, false);

    strictEqual(ageProgress(world, 0).buildingsOwned, 0);
  });

  it('signale le dernier âge au lieu d\'un objectif inatteignable', () => {
    const world = createWorld();
    world.players[0].age = 3;

    const progress = ageProgress(world, 0);
    strictEqual(progress.nextAge, null);
    strictEqual(progress.ready, false);
  });
});

describe('production', () => {
  it('un centre-ville produit un paysan et le fait apparaître', () => {
    const world = createWorld();
    const tc = [...world.entities.values()].find(
      (e) => e.owner === 0 && e.defId === 'centre_ville',
    ) as Entity;

    const before = unitsOf(world, 0).length;
    const result = train(world, tc, 'paysan');
    ok(result.ok, result.reason);

    run(world, 25);

    strictEqual(unitsOf(world, 0).length, before + 1);
    strictEqual(world.players[0].resources.food, 150);
  });
});
