/**
 * Ordres et actions du joueur.
 *
 * Tout ce qui modifie le monde passe par ici — l'interface comme l'IA. Cette
 * discipline est ce qui rendra le multijoueur possible : ces fonctions sont
 * déjà, en pratique, la liste des ordres à transmettre sur le réseau.
 */

import { AGES } from '../data/ages.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { UNITS } from '../data/units.ts';
import type { AgeId } from '../data/types.ts';
import { footprintOf, inBounds, nearestFreeTile } from './grid.ts';
import type { Entity, PlayerId, World } from './types.ts';
import {
  canAfford,
  distanceBetween,
  isEnemy,
  isHarvestable,
  logEvent,
  pay,
  recomputePopulation,
  spawnBuilding,
  spawnUnit,
} from './world.ts';

export function orderMove(unit: Entity, x: number, y: number): void {
  unit.order = { kind: 'move', targetId: null, x, y };
  unit.path = [];
  unit.pathGoal = null;
}

export function orderAttack(unit: Entity, target: Entity): void {
  unit.order = { kind: 'attack', targetId: target.id, x: target.x, y: target.y };
  unit.path = [];
  unit.pathGoal = null;
}

export function orderGather(unit: Entity, node: Entity): void {
  unit.order = { kind: 'gather', targetId: node.id, x: node.x, y: node.y };
  unit.lastNodeId = node.id;
  unit.path = [];
  unit.pathGoal = null;
}

export function orderBuild(unit: Entity, site: Entity): void {
  unit.order = { kind: 'build', targetId: site.id, x: site.x, y: site.y };
  unit.path = [];
  unit.pathGoal = null;
}

export function orderIdle(unit: Entity): void {
  unit.order = { kind: 'idle', targetId: null, x: unit.x, y: unit.y };
  unit.path = [];
  unit.pathGoal = null;
}

/**
 * Ordre contextuel du clic droit : la cible détermine l'action.
 * C'est la convention de tous les RTS du genre, et elle évite au joueur de
 * chercher un bouton pour chaque action courante.
 */
export function orderSmart(world: World, unit: Entity, target: Entity | null, x: number, y: number): void {
  const def = UNITS[unit.defId];
  if (!def || unit.owner === null) return;

  if (target && isEnemy(unit, target)) {
    if (def.combat) orderAttack(unit, target);
    else orderMove(unit, target.x, target.y);
    return;
  }

  if (target && def.gather && isHarvestable(target, unit.owner)) {
    orderGather(unit, target);
    return;
  }

  if (target && def.gather && target.kind === 'building' && target.owner === unit.owner && target.buildProgress < 1) {
    orderBuild(unit, target);
    return;
  }

  orderMove(unit, x, y);
}

// ───────────────────────────────────────────────────────────────────────────
// Production
// ───────────────────────────────────────────────────────────────────────────

export interface ActionResult {
  ok: boolean;
  reason?: string;
}

/** L'unité est-elle produisible ici et maintenant ? */
export function canTrain(world: World, building: Entity, unitId: string): ActionResult {
  const def = UNITS[unitId];
  const buildingDef = BUILDINGS[building.defId];
  if (!def || !buildingDef || building.owner === null) return { ok: false, reason: 'Inconnu' };
  if (building.buildProgress < 1) return { ok: false, reason: 'Chantier inachevé' };
  if (!buildingDef.trains?.includes(unitId)) return { ok: false, reason: 'Mauvais bâtiment' };

  const player = world.players[building.owner];
  if (player.age < def.age) return { ok: false, reason: `Âge ${def.age} requis` };
  if (!canAfford(world, building.owner, def.cost)) return { ok: false, reason: 'Ressources insuffisantes' };
  if (player.popUsed + def.popCost > player.popCap) return { ok: false, reason: 'Population maximale' };

  if (def.maxCount !== undefined) {
    let count = 0;
    for (const e of world.entities.values()) {
      if (e.kind === 'unit' && e.owner === building.owner && e.defId === unitId) count++;
    }
    for (const e of world.entities.values()) {
      if (e.kind === 'building' && e.owner === building.owner) {
        count += e.queue.filter((q) => q === unitId).length;
      }
    }
    if (count >= def.maxCount) return { ok: false, reason: `Maximum ${def.maxCount}` };
  }

  return { ok: true };
}

export function train(world: World, building: Entity, unitId: string): ActionResult {
  const check = canTrain(world, building, unitId);
  if (!check.ok || building.owner === null) return check;

  const def = UNITS[unitId];
  if (!def) return { ok: false, reason: 'Unité inconnue' };

  pay(world, building.owner, def.cost);
  building.queue.push(unitId);
  if (building.queue.length === 1) building.queueRemaining = def.trainTime;

  // La population est réservée dès la mise en file, sinon on pourrait
  // enfiler dix unités avec une seule place disponible.
  world.players[building.owner].popUsed += def.popCost;

  return { ok: true };
}

// ───────────────────────────────────────────────────────────────────────────
// Construction
// ───────────────────────────────────────────────────────────────────────────

/** L'emprise est-elle libre et dans la carte ? */
export function canPlaceAt(world: World, buildingId: string, tileX: number, tileY: number): boolean {
  const { w, h } = footprintOf(buildingId);

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const x = tileX + dx;
      const y = tileY + dy;
      if (!inBounds(world, x, y)) return false;
      if (world.blocked[y * world.width + x] === 1) return false;
    }
  }

  // Une unité qui se trouverait dans l'emprise empêcherait le chantier.
  for (const e of world.entities.values()) {
    if (e.kind !== 'unit') continue;
    if (e.x >= tileX && e.x < tileX + w && e.y >= tileY && e.y < tileY + h) return false;
  }

  return true;
}

export function canBuild(world: World, owner: PlayerId, buildingId: string): ActionResult {
  const def = BUILDINGS[buildingId];
  if (!def) return { ok: false, reason: 'Bâtiment inconnu' };

  const player = world.players[owner];
  if (player.age < def.age) return { ok: false, reason: `Âge ${def.age} requis` };
  if (!canAfford(world, owner, def.cost)) return { ok: false, reason: 'Ressources insuffisantes' };

  return { ok: true };
}

/**
 * Pose un chantier et y envoie les bâtisseurs. Le coût est payé à la pose,
 * comme dans Age of Empires : annuler un chantier rembourserait (non
 * implémenté pour l'instant).
 */
export function placeBuilding(
  world: World,
  owner: PlayerId,
  buildingId: string,
  tileX: number,
  tileY: number,
  builders: Entity[],
): ActionResult {
  const check = canBuild(world, owner, buildingId);
  if (!check.ok) return check;
  if (!canPlaceAt(world, buildingId, tileX, tileY)) return { ok: false, reason: 'Emplacement occupé' };

  const def = BUILDINGS[buildingId];
  if (!def) return { ok: false, reason: 'Bâtiment inconnu' };

  pay(world, owner, def.cost);
  const site = spawnBuilding(world, buildingId, owner, tileX, tileY, false);

  for (const builder of builders) {
    if (UNITS[builder.defId]?.gather) orderBuild(builder, site);
  }

  return { ok: true };
}

// ───────────────────────────────────────────────────────────────────────────
// Progression d'âge
// ───────────────────────────────────────────────────────────────────────────

export function canAdvanceAge(world: World, owner: PlayerId): ActionResult {
  const player = world.players[owner];
  if (player.advancing !== null) return { ok: false, reason: 'Recherche en cours' };

  const nextAge = (player.age + 1) as AgeId;
  const def = AGES[nextAge];
  if (!def?.advanceCost) return { ok: false, reason: 'Âge maximal atteint' };
  if (!canAfford(world, owner, def.advanceCost)) return { ok: false, reason: 'Ressources insuffisantes' };

  const required = def.requiredBuildings ?? 0;
  let count = 0;
  for (const e of world.entities.values()) {
    if (e.kind !== 'building' || e.owner !== owner || e.buildProgress < 1) continue;
    if (e.defId === 'centre_ville') continue;
    if ((BUILDINGS[e.defId]?.age ?? 1) <= player.age) count++;
  }
  if (count < required) {
    return { ok: false, reason: `${required} bâtiments de l'âge en cours requis (${count})` };
  }

  return { ok: true };
}

export function advanceAge(world: World, owner: PlayerId): ActionResult {
  const check = canAdvanceAge(world, owner);
  if (!check.ok) return check;

  const player = world.players[owner];
  const nextAge = (player.age + 1) as AgeId;
  const def = AGES[nextAge];
  if (!def?.advanceCost) return { ok: false, reason: 'Âge maximal atteint' };

  pay(world, owner, def.advanceCost);
  player.advancing = def.advanceTime ?? 0;
  logEvent(world, `${player.nameFr} : recherche de l'${def.nameFr} lancée.`);

  return { ok: true };
}

// ───────────────────────────────────────────────────────────────────────────
// Bac à sable — pour tester l'équilibrage sans jouer une partie entière
// ───────────────────────────────────────────────────────────────────────────

/** Fait apparaître des unités sans coût ni population, pour les essais. */
export function sandboxSpawn(
  world: World,
  unitId: string,
  owner: PlayerId,
  x: number,
  y: number,
  count = 1,
): Entity[] {
  const spawned: Entity[] = [];

  for (let i = 0; i < count; i++) {
    const free = nearestFreeTile(world, Math.floor(x), Math.floor(y), 10);
    const px = free ? free.x + 0.5 + (i % 3) * 0.4 : x;
    const py = free ? free.y + 0.5 + Math.floor(i / 3) * 0.4 : y;
    spawned.push(spawnUnit(world, unitId, owner, px, py));
  }

  recomputePopulation(world);
  return spawned;
}

/** Trouve l'entité sous un point, la plus proche d'abord. */
export function entityAt(world: World, x: number, y: number, maxDistance = 1.2): Entity | null {
  let best: Entity | null = null;
  let bestDistance = maxDistance;

  for (const e of world.entities.values()) {
    const d = distanceBetween({ x, y }, e);
    if (d < bestDistance) {
      bestDistance = d;
      best = e;
    }
  }

  return best;
}
