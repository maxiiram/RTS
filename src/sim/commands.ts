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
import { footprintOf, inBounds, isBlocked, nearestFreeTile } from './grid.ts';
import type { Entity, PlayerId, Point, World } from './types.ts';
import {
  canAfford,
  distanceBetween,
  isEnemy,
  isHarvestable,
  isReachable,
  isTargetable,
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

// ───────────────────────────────────────────────────────────────────────────
// Ordres de groupe
// ───────────────────────────────────────────────────────────────────────────

/**
 * Un groupe sélectionné se commande comme une seule unité.
 *
 * Donner le même ordre à chaque unité séparément produit un résultat absurde :
 * dix paysans s'entassent sur le même arbre, dix soldats se marchent dessus
 * pour frapper la même cible, et tout le monde converge vers le pixel exact où
 * le joueur a cliqué. Un ordre de groupe désigne donc une **intention sur une
 * zone**, que l'on répartit ensuite entre les unités.
 *
 * Trois traductions, selon ce qui est visé :
 *  - un point → une formation autour de ce point ;
 *  - un gisement → le bosquet ou le filon auquel il appartient ;
 *  - un ennemi → le groupe ennemi qui l'entoure.
 */
export function orderGroup(
  world: World,
  units: Entity[],
  target: Entity | null,
  x: number,
  y: number,
): void {
  // Ordre stable : deux clients qui reçoivent le même ordre doivent répartir
  // les unités exactement de la même façon.
  const ordered = [...units].sort((a, b) => a.id - b.id);
  const first = ordered[0];
  if (!first) return;

  const owner = first.owner;

  if (target && ordered.some((unit) => isEnemy(unit, target))) {
    orderGroupAttack(world, ordered, target);
    return;
  }

  if (target && target.kind === 'building' && target.owner === owner && target.buildProgress < 1) {
    for (const unit of ordered) {
      if (UNITS[unit.defId]?.gather) orderBuild(unit, target);
    }
    return;
  }

  if (target && owner !== null && isHarvestable(target, owner)) {
    orderGroupGather(world, ordered, target);
    return;
  }

  orderGroupMove(world, ordered, x, y);
}

/** Rayon autour de la cible désignée, en tuiles, pour un ordre de zone. */
const GATHER_AREA_RADIUS = 8;
const ATTACK_AREA_RADIUS = 7;

/**
 * Pénalité de distance appliquée par unité déjà affectée à une cible.
 * Elle pousse les unités à se répartir : à charge égale on prend la cible la
 * plus proche, mais une cible déjà prise doit être nettement plus proche pour
 * l'emporter sur une cible libre.
 */
const CROWDING_PENALTY = 3.5;

/**
 * Répartit les récolteurs sur tout le bosquet plutôt que sur l'arbre cliqué.
 * Ne retient que les gisements réellement approchables : un arbre cerné par
 * d'autres arbres n'est exploitable par personne.
 */
export function orderGroupGather(world: World, units: Entity[], node: Entity): void {
  const owner = units[0]?.owner;
  if (owner === undefined || owner === null) return;

  const cluster: Entity[] = [];
  for (const candidate of world.entities.values()) {
    if (!isHarvestable(candidate, owner)) continue;
    if (candidate.resource !== node.resource) continue;
    if (distanceBetween(node, candidate) > GATHER_AREA_RADIUS) continue;
    if (candidate.id !== node.id && !isReachable(world, candidate)) continue;
    cluster.push(candidate);
  }

  if (cluster.length === 0) {
    for (const unit of units) orderGather(unit, node);
    return;
  }

  assign(units, cluster, (unit) => UNITS[unit.defId]?.gather !== undefined, orderGather);
}

/**
 * Envoie le groupe sur la troupe ennemie autour de la cible désignée, et non
 * sur ce seul défenseur : viser un paysan isolé au milieu de sa base ne doit
 * pas laisser dix soldats faire la queue derrière lui.
 */
export function orderGroupAttack(world: World, units: Entity[], target: Entity): void {
  const attacker = units[0];
  if (!attacker) return;

  const cluster: Entity[] = [];
  for (const candidate of world.entities.values()) {
    if (!isEnemy(attacker, candidate) || !isTargetable(candidate)) continue;
    if (candidate.id !== target.id) {
      if (distanceBetween(target, candidate) > ATTACK_AREA_RADIUS) continue;
      // Les bâtiments ne sont pas ajoutés d'office : on ne détourne pas une
      // attaque sur une unité vers la maison d'à côté.
      if (candidate.kind !== 'unit') continue;
    }
    cluster.push(candidate);
  }

  if (cluster.length === 0) {
    for (const unit of units) orderAttack(unit, target);
    return;
  }

  assign(units, cluster, (unit) => UNITS[unit.defId]?.combat !== undefined, orderAttack);
}

/**
 * Affecte chaque unité à la cible la plus proche, en évitant que toutes
 * choisissent la même. Déterministe : même entrée, même répartition.
 */
function assign(
  units: Entity[],
  targets: Entity[],
  eligible: (unit: Entity) => boolean,
  give: (unit: Entity, target: Entity) => void,
): void {
  const load = new Map<number, number>();

  for (const unit of units) {
    if (!eligible(unit)) continue;

    let best: Entity | null = null;
    let bestScore = Infinity;

    for (const candidate of targets) {
      const score =
        distanceBetween(unit, candidate) + (load.get(candidate.id) ?? 0) * CROWDING_PENALTY;
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (!best) continue;
    load.set(best.id, (load.get(best.id) ?? 0) + 1);
    give(unit, best);
  }
}

/**
 * Déplace le groupe en formation autour du point visé, au lieu d'envoyer tout
 * le monde sur la même case — où les unités passeraient leur temps à se
 * pousser les unes les autres.
 */
export function orderGroupMove(world: World, units: Entity[], x: number, y: number): void {
  if (units.length === 1) {
    const single = units[0] as Entity;
    orderMove(single, x, y);
    return;
  }

  const slots = formationSlots(world, units.length, x, y);
  const remaining = new Set(units);

  // Chaque emplacement revient à l'unité la plus proche encore libre : le
  // groupe garde ainsi sa disposition d'origine au lieu de se croiser.
  for (const slot of slots) {
    let best: Entity | null = null;
    let bestDistance = Infinity;

    for (const unit of remaining) {
      const distance = Math.hypot(unit.x - slot.x, unit.y - slot.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = unit;
      }
    }

    if (!best) break;
    remaining.delete(best);
    orderMove(best, slot.x, slot.y);
  }

  // Sécurité : une unité sans emplacement va au point visé.
  for (const unit of remaining) orderMove(unit, x, y);
}

/** Grille carrée d'emplacements centrée sur le point visé. */
function formationSlots(world: World, count: number, x: number, y: number): Point[] {
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const spacing = 1.1;
  const slots: Point[] = [];

  for (let index = 0; index < count; index++) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const px = x + (column - (columns - 1) / 2) * spacing;
    const py = y + (row - (rows - 1) / 2) * spacing;

    if (isBlocked(world, px, py)) {
      const free = nearestFreeTile(world, Math.floor(px), Math.floor(py), 6);
      slots.push(free ? { x: free.x + 0.5, y: free.y + 0.5 } : { x, y });
    } else {
      slots.push({ x: px, y: py });
    }
  }

  return slots;
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
