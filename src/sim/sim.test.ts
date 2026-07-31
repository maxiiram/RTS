/**
 * Tests de la simulation.
 *
 * Ils jouent de vraies parties sans affichage : c'est le seul moyen de
 * vérifier qu'une boucle de jeu de plusieurs dizaines de minutes ne se bloque
 * pas, et ça tourne en quelques secondes.
 */

import { ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SIM_TICK_SECONDS } from '../data/constants.ts';
import { UNITS } from '../data/units.ts';
import { createAi, stepAi } from './ai.ts';
import { orderGather, orderMove, sandboxSpawn, train } from './commands.ts';
import { findPath } from './grid.ts';
import { stepWorld } from './sim.ts';
import type { Entity, World } from './types.ts';
import { createWorld, findNearest, isHarvestable, spawnUnit } from './world.ts';

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
