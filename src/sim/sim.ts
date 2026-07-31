/**
 * Boucle de simulation.
 *
 * Un pas fixe de 50 ms (20 Hz), totalement séparé du rendu : la simulation
 * avance du même nombre de ticks quel que soit le nombre d'images par seconde.
 * C'est ce qui rendra le lockstep possible, et ça évite au passage qu'une
 * machine lente joue une partie différente d'une machine rapide.
 */

import { AGES } from '../data/ages.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { MELEE_CONTACT_DISTANCE, SIM_TICK_SECONDS } from '../data/constants.ts';
import { RESOURCES } from '../data/resources.ts';
import { UNITS } from '../data/units.ts';
import type { AgeId, ResourceId, UnitDef } from '../data/types.ts';
import { damagePerHit, type DamageTarget } from '../balance/combat.ts';
import { findPath, isBlocked, nearestFreeTile, rebuildBlocked } from './grid.ts';
import { orderGather, orderIdle, orderMove } from './commands.ts';
import type { Entity, Point, World } from './types.ts';
import {
  approachPoint,
  distanceBetween,
  findDropOff,
  findNearest,
  isEnemy,
  isHarvestable,
  isReachable,
  isTargetable,
  logEvent,
  recomputePopulation,
  spawnUnit,
  updateVisibility,
} from './world.ts';

/** Distance à laquelle un paysan peut récolter ou bâtir. */
const WORK_RANGE = 1.3;

/**
 * Avance la simulation d'un tick.
 * `dt` est toujours SIM_TICK_SECONDS : le paramètre n'existe que pour rendre
 * les formules lisibles.
 */
export function stepWorld(world: World): void {
  const dt = SIM_TICK_SECONDS;

  world.tick++;
  world.time += dt;

  if (world.winner !== null) return;

  const auras = collectAuras(world);

  for (const e of [...world.entities.values()]) {
    if (e.hp <= 0) continue;

    if (e.kind === 'building') {
      stepBuilding(world, e, dt, auras);
    } else if (e.kind === 'unit') {
      stepUnit(world, e, dt, auras);
    }
  }

  separateUnits(world, dt);
  removeDead(world);

  // La population et la victoire changent rarement : une fois par seconde suffit.
  if (world.tick % 20 === 0) {
    recomputePopulation(world);
    checkVictory(world);
  }

  // Le brouillard se rafraîchit deux fois par seconde : assez pour ne pas
  // sentir de retard à l'écran, assez rare pour ne rien coûter.
  if (world.tick % 10 === 0) updateVisibility(world);

  for (const player of world.players) {
    if (player.advancing === null) continue;
    player.advancing -= dt;
    if (player.advancing <= 0) {
      player.advancing = null;
      player.age = (player.age + 1) as AgeId;
      logEvent(world, `${player.nameFr} atteint l'${AGES[player.age].nameFr}.`);
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Unités
// ───────────────────────────────────────────────────────────────────────────

function stepUnit(world: World, e: Entity, dt: number, auras: AuraSource[]): void {
  const def = UNITS[e.defId];
  if (!def) return;

  e.attackCooldown = Math.max(0, e.attackCooldown - dt);
  e.chargeCooldown = Math.max(0, e.chargeCooldown - dt);

  switch (e.order.kind) {
    case 'gather':
      handleGather(world, e, def, dt);
      break;
    case 'attack':
      handleAttack(world, e, def, dt, auras);
      break;
    case 'build':
      handleBuild(world, e, def, dt);
      break;
    case 'move':
      if (moveTowards(world, e, def, { x: e.order.x, y: e.order.y }, dt, 0.25)) orderIdle(e);
      break;
    case 'idle':
      autoAcquire(world, e, def);
      break;
  }
}

/**
 * Une unité militaire au repos engage d'elle-même un ennemi qui entre dans sa
 * ligne de vue. Sans ça, une armée postée regarderait passer l'adversaire.
 * Les paysans, eux, ne se battent que sur ordre explicite.
 */
function autoAcquire(world: World, e: Entity, def: UnitDef): void {
  if (!def.combat || def.role !== 'military') return;
  // Une recherche par seconde et par unité : inutile d'en faire vingt.
  if ((world.tick + e.id) % 20 !== 0) return;

  const target = findNearest(
    world,
    e,
    (other) => isEnemy(e, other) && isTargetable(other),
    def.los,
  );

  if (target) {
    e.order = { kind: 'attack', targetId: target.id, x: target.x, y: target.y };
    e.path = [];
    e.pathGoal = null;
  }
}

function handleAttack(world: World, e: Entity, def: UnitDef, dt: number, auras: AuraSource[]): void {
  const target = e.order.targetId === null ? null : world.entities.get(e.order.targetId);

  if (!target || target.hp <= 0 || !isTargetable(target)) {
    orderIdle(e);
    return;
  }

  const combat = def.combat;
  if (!combat) {
    orderIdle(e);
    return;
  }

  const distance = distanceBetween(e, target);
  const range = Math.max(combat.range, MELEE_CONTACT_DISTANCE * 0.5);

  if (distance > range) {
    if (!moveToEntity(world, e, def, target, dt, range) && isStuck(e)) {
      // Cible inaccessible : inutile de s'acharner contre un mur.
      e.stuckTimer = 0;
      orderIdle(e);
    }
    return;
  }

  // À portée : on s'arrête et on frappe dès que la cadence le permet.
  e.path = [];
  e.pathGoal = null;
  if (e.attackCooldown > 0) return;

  const charge = combat.charge;
  const charged = charge !== undefined && e.chargeCooldown <= 0 && e.travelled >= charge.minDistance;

  const bonus = auraFor(auras, e);
  const boosted: UnitDef = bonus.attack > 0
    ? { ...def, combat: { ...combat, attack: combat.attack + bonus.attack } }
    : def;

  const damage = damagePerHit(boosted, targetProfile(world, target, auras), { charged });
  target.hp -= damage;

  e.attackCooldown = combat.attackCooldown;
  e.travelled = 0;
  if (charged && charge) e.chargeCooldown = charge.cooldown;

  if (target.hp <= 0) onKilled(world, target);
}

function handleGather(world: World, e: Entity, def: UnitDef, dt: number): void {
  if (!def.gather || e.owner === null) {
    orderIdle(e);
    return;
  }

  // Phase de dépôt : la charge est pleine, on rentre.
  if (e.carrying && e.carrying.amount >= RESOURCES[e.carrying.resource].carryCapacity) {
    const resource = e.carrying.resource;
    const dropOff = findDropOff(world, e, resource);

    if (!dropOff) {
      // Aucun dépôt : l'unité reste plantée avec sa charge plutôt que de la perdre.
      return;
    }

    if (moveToEntity(world, e, def, dropOff, dt, WORK_RANGE)) {
      world.players[e.owner].resources[resource] += e.carrying.amount;
      e.carrying = null;
      resumeGathering(world, e, resource);
    }
    return;
  }

  // Phase de récolte.
  const node = e.order.targetId === null ? null : world.entities.get(e.order.targetId);

  if (!node || !isHarvestable(node, e.owner)) {
    const replacement = findReplacementNode(world, e);
    if (replacement) orderGather(e, replacement);
    else orderIdle(e);
    return;
  }

  const resource = node.resource as ResourceId;
  const rate = def.gather[resource];

  if (rate <= 0) {
    orderIdle(e);
    return;
  }

  if (!moveToEntity(world, e, def, node, dt, WORK_RANGE)) {
    if (isStuck(e)) {
      // Gisement enclavé : on en cherche un autre plutôt que d'attendre là.
      e.stuckTimer = 0;
      const replacement = findReplacementNode(world, e, resource, node.id);
      if (replacement) orderGather(e, replacement);
      else orderIdle(e);
    }
    return;
  }

  const capacity = RESOURCES[resource].carryCapacity;
  if (!e.carrying) e.carrying = { resource, amount: 0 };
  if (e.carrying.resource !== resource) {
    // Changement de ressource : on abandonne le peu qu'on portait.
    e.carrying = { resource, amount: 0 };
  }

  const harvested = Math.min(rate * dt, node.amount, capacity - e.carrying.amount);
  e.carrying.amount += harvested;
  node.amount -= harvested;
  e.lastNodeId = node.id;

  if (node.amount <= 0) onDepleted(world, node);
}

/** Après un dépôt, l'unité retourne d'elle-même sur son gisement. */
function resumeGathering(world: World, e: Entity, resource: ResourceId): void {
  const previous = e.lastNodeId === null ? null : world.entities.get(e.lastNodeId);

  if (previous && e.owner !== null && isHarvestable(previous, e.owner)) {
    orderGather(e, previous);
    return;
  }

  const replacement = findReplacementNode(world, e, resource);
  if (replacement) orderGather(e, replacement);
  else orderIdle(e);
}

/**
 * Cherche un autre gisement à exploiter.
 *
 * On n'accepte que des gisements réellement approchables : sans ce filtre,
 * l'unité repartirait aussitôt sur un arbre tout aussi enclavé que celui
 * qu'elle vient d'abandonner.
 */
function findReplacementNode(
  world: World,
  e: Entity,
  resource?: ResourceId,
  excludeId?: number,
): Entity | null {
  if (e.owner === null) return null;
  const owner = e.owner;
  const wanted = resource ?? e.carrying?.resource ?? null;

  const suitable = (other: Entity, sameResource: boolean): boolean => {
    if (other.id === excludeId) return false;
    if (!isHarvestable(other, owner)) return false;
    if (sameResource && wanted !== null && other.resource !== wanted) return false;
    return isReachable(world, other);
  };

  return (
    findNearest(world, e, (other) => suitable(other, true), 40) ??
    findNearest(world, e, (other) => suitable(other, false), 40)
  );
}

function handleBuild(world: World, e: Entity, def: UnitDef, dt: number): void {
  const site = e.order.targetId === null ? null : world.entities.get(e.order.targetId);

  if (!site || site.kind !== 'building' || site.hp <= 0) {
    orderIdle(e);
    return;
  }

  if (site.buildProgress >= 1) {
    orderIdle(e);
    return;
  }

  if (!moveToEntity(world, e, def, site, dt, WORK_RANGE)) {
    if (isStuck(e)) {
      e.stuckTimer = 0;
      orderIdle(e);
    }
    return;
  }

  const buildingDef = BUILDINGS[site.defId];
  if (!buildingDef) return;

  // Chaque bâtisseur ajoute sa part : n bâtisseurs divisent le temps par n.
  site.buildProgress = Math.min(1, site.buildProgress + dt / buildingDef.buildTime);
  site.hp = Math.max(
    site.hp,
    Math.round(buildingDef.hp * (0.1 + 0.9 * site.buildProgress)),
  );

  if (site.buildProgress >= 1) {
    site.hp = buildingDef.hp;
    rebuildBlocked(world);
    recomputePopulation(world);
    logEvent(world, `${buildingDef.nameFr} terminé.`);
    orderIdle(e);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Déplacement
// ───────────────────────────────────────────────────────────────────────────

/**
 * Approche une entité jusqu'à être à portée d'agir sur elle.
 *
 * Le test d'arrivée porte sur la distance réelle à la cible, jamais sur la
 * distance à un point d'approche intermédiaire : ce point se déplace à mesure
 * que l'unité avance, et s'y fier laissait les unités s'immobiliser à quelques
 * dixièmes de tuile hors de portée, sans jamais rien faire.
 */
function moveToEntity(
  world: World,
  e: Entity,
  def: UnitDef,
  target: Entity,
  dt: number,
  range: number,
): boolean {
  const before = distanceBetween(e, target);

  if (before <= range) {
    e.path = [];
    e.pathGoal = null;
    e.stuckTimer = 0;
    return true;
  }

  // On vise franchement l'intérieur de la portée, pas sa limite exacte.
  moveTowards(world, e, def, approachPoint(e, target, range * 0.5), dt, 0.05);

  const after = distanceBetween(e, target);
  if (after <= range) {
    e.stuckTimer = 0;
    return true;
  }

  // Aucun progrès notable : la cible est probablement inatteignable.
  if (before - after < def.speed * dt * 0.2) e.stuckTimer += dt;
  else e.stuckTimer = 0;

  return false;
}

/** L'unité tourne en rond depuis assez longtemps pour abandonner sa cible. */
function isStuck(e: Entity): boolean {
  return e.stuckTimer > 3;
}

/**
 * Approche d'un point, en recalculant un chemin quand la destination change.
 * Renvoie `true` une fois arrivé.
 */
function moveTowards(
  world: World,
  e: Entity,
  def: UnitDef,
  goal: Point,
  dt: number,
  tolerance: number,
): boolean {
  const direct = Math.hypot(goal.x - e.x, goal.y - e.y);
  if (direct <= tolerance) {
    e.path = [];
    e.pathGoal = null;
    return true;
  }

  const goalMoved =
    e.pathGoal === null || Math.hypot(e.pathGoal.x - goal.x, e.pathGoal.y - goal.y) > 0.75;

  if (goalMoved || (e.path.length === 0 && direct > tolerance)) {
    e.pathGoal = { x: goal.x, y: goal.y };
    e.path = findPath(world, e, goal);
    // Chemin introuvable (cible enclavée) : on avance quand même en ligne
    // droite, ce qui suffit sur les courtes distances et évite le blocage net.
    if (e.path.length === 0) e.path = [{ x: goal.x, y: goal.y }];
  }

  const step = def.speed * dt;
  let remaining = step;

  while (remaining > 0 && e.path.length > 0) {
    const waypoint = e.path[0] as Point;
    const dx = waypoint.x - e.x;
    const dy = waypoint.y - e.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= remaining) {
      e.x = waypoint.x;
      e.y = waypoint.y;
      e.path.shift();
      remaining -= distance;
    } else {
      e.x += (dx / distance) * remaining;
      e.y += (dy / distance) * remaining;
      remaining = 0;
    }
  }

  e.travelled += step - remaining;
  return Math.hypot(goal.x - e.x, goal.y - e.y) <= tolerance;
}

/**
 * Écarte les unités qui se chevauchent.
 *
 * Trois règles, apprises d'un blocage observé en jeu : un paquet d'unités
 * lancées vers un passage étroit s'immobilisait complètement, chacune
 * repoussée par ses voisines.
 *
 * 1. **La poussée ne dépasse jamais la marche.** C'était la cause du blocage :
 *    une correction plus forte que le pas de déplacement transforme un groupe
 *    dense en bloc qui se verrouille lui-même. Elle est désormais plafonnée à
 *    une fraction du pas, si bien qu'avancer l'emporte toujours sur s'écarter.
 * 2. **Qui marche a la priorité.** Une unité à l'arrêt encaisse l'essentiel de
 *    la correction : elle s'écarte du passage au lieu de faire barrage.
 * 3. **Personne n'est poussé dans un mur.** Une correction qui ferait entrer
 *    une unité dans une case infranchissable est annulée sur cet axe.
 */
function separateUnits(world: World, dt: number): void {
  const units: Entity[] = [];
  for (const e of world.entities.values()) {
    if (e.kind === 'unit' && e.hp > 0) units.push(e);
  }

  // Découpage en cases d'une tuile : évite de comparer toutes les paires.
  const buckets = new Map<string, Entity[]>();
  for (const e of units) {
    const key = `${Math.floor(e.x)},${Math.floor(e.y)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(e);
    else buckets.set(key, [e]);
  }

  const minDistance = 0.45;
  const corrections = new Map<number, Point>();

  const add = (e: Entity, dx: number, dy: number): void => {
    const current = corrections.get(e.id);
    if (current) {
      current.x += dx;
      current.y += dy;
    } else {
      corrections.set(e.id, { x: dx, y: dy });
    }
  };

  for (const e of units) {
    const cx = Math.floor(e.x);
    const cy = Math.floor(e.y);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const neighbours = buckets.get(`${cx + dx},${cy + dy}`);
        if (!neighbours) continue;

        for (const other of neighbours) {
          if (other.id <= e.id) continue;
          const ox = other.x - e.x;
          const oy = other.y - e.y;
          const distance = Math.hypot(ox, oy);
          if (distance >= minDistance) continue;

          // Deux unités exactement superposées : on en décale une de façon
          // arbitraire mais déterministe, jamais au hasard.
          const nx = distance < 0.001 ? ((e.id % 3) - 1) * 0.01 : ox / distance;
          const ny = distance < 0.001 ? ((e.id % 5) - 2) * 0.01 : oy / distance;
          const overlap = minDistance - distance;

          // Celle qui marche cède peu de terrain, celle qui stationne s'écarte.
          const eMoving = e.path.length > 0;
          const otherMoving = other.path.length > 0;
          let eShare = 0.5;
          if (eMoving && !otherMoving) eShare = 0.15;
          else if (!eMoving && otherMoving) eShare = 0.85;

          add(e, -nx * overlap * eShare, -ny * overlap * eShare);
          add(other, nx * overlap * (1 - eShare), ny * overlap * (1 - eShare));
        }
      }
    }
  }

  for (const e of units) {
    const correction = corrections.get(e.id);
    if (!correction) continue;

    const def = UNITS[e.defId];
    const length = Math.hypot(correction.x, correction.y);
    if (length < 1e-6) continue;

    // Le plafond est la clé : s'écarter reste toujours plus lent qu'avancer.
    const maxCorrection = (def?.speed ?? 1) * dt * 0.6;
    const scale = Math.min(1, maxCorrection / length);
    const targetX = e.x + correction.x * scale;
    const targetY = e.y + correction.y * scale;

    // Un axe qui mènerait dans un obstacle est abandonné, l'autre s'applique :
    // l'unité glisse le long du mur au lieu d'y être encastrée.
    if (!isBlocked(world, targetX, e.y)) e.x = targetX;
    if (!isBlocked(world, e.x, targetY)) e.y = targetY;
  }

  for (const e of units) {
    e.x = Math.min(world.width - 0.5, Math.max(0.5, e.x));
    e.y = Math.min(world.height - 0.5, Math.max(0.5, e.y));
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Bâtiments
// ───────────────────────────────────────────────────────────────────────────

function stepBuilding(world: World, e: Entity, dt: number, auras: AuraSource[]): void {
  if (e.buildProgress < 1) return;

  const def = BUILDINGS[e.defId];
  if (!def) return;

  // Production
  if (e.queue.length > 0) {
    e.queueRemaining -= dt;
    if (e.queueRemaining <= 0) {
      const unitId = e.queue.shift() as string;
      const spot = nearestFreeTile(world, Math.round(e.x), Math.round(e.y + def.footprint.h / 2 + 1), 8);
      const unit = spawnUnit(world, unitId, e.owner ?? 0, (spot?.x ?? e.x) + 0.5, (spot?.y ?? e.y) + 0.5);
      if (e.rally) orderMove(unit, e.rally.x, e.rally.y);

      const next = e.queue[0];
      e.queueRemaining = next ? (UNITS[next]?.trainTime ?? 0) : 0;
    }
  }

  // Défense active (tour de garde)
  if (def.combat) {
    e.attackCooldown = Math.max(0, e.attackCooldown - dt);
    if (e.attackCooldown > 0) return;

    const target = findNearest(
      world,
      e,
      (other) => isEnemy(e, other) && isTargetable(other) && other.kind === 'unit',
      def.combat.range,
    );
    if (!target) return;

    // Une tour se comporte comme une unité immobile du point de vue des dégâts.
    const asUnit = {
      combat: def.combat,
      class: 'building' as const,
    } as UnitDef;

    target.hp -= damagePerHit(asUnit, targetProfile(world, target, auras));
    e.attackCooldown = def.combat.attackCooldown;
    if (target.hp <= 0) onKilled(world, target);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Auras, dégâts et disparitions
// ───────────────────────────────────────────────────────────────────────────

interface AuraSource {
  owner: number;
  x: number;
  y: number;
  radius: number;
  attack: number;
  armor: number;
}

/** Le porte-étendard est la seule source d'aura, et il est unique par joueur. */
function collectAuras(world: World): AuraSource[] {
  const sources: AuraSource[] = [];

  for (const e of world.entities.values()) {
    if (e.kind !== 'unit' || e.hp <= 0 || e.owner === null) continue;
    const aura = UNITS[e.defId]?.aura;
    if (!aura) continue;
    sources.push({
      owner: e.owner,
      x: e.x,
      y: e.y,
      radius: aura.radius,
      attack: aura.attack,
      armor: aura.armor,
    });
  }

  return sources;
}

function auraFor(auras: AuraSource[], e: Entity): { attack: number; armor: number } {
  let attack = 0;
  let armor = 0;

  for (const source of auras) {
    if (source.owner !== e.owner) continue;
    if (Math.hypot(source.x - e.x, source.y - e.y) > source.radius) continue;
    attack = Math.max(attack, source.attack);
    armor = Math.max(armor, source.armor);
  }

  return { attack, armor };
}

/** Profil de cible : armure et classe, aura défensive comprise. */
function targetProfile(world: World, target: Entity, auras: AuraSource[]): DamageTarget {
  const bonus = auraFor(auras, target);

  if (target.kind === 'building') {
    const def = BUILDINGS[target.defId];
    return { armor: def?.armor ?? 0, class: 'building', hp: target.hp };
  }

  const def = UNITS[target.defId];
  return {
    armor: (def?.armor ?? 0) + bonus.armor,
    class: def?.class ?? 'infantry',
    hp: target.hp,
  };
}

function onKilled(world: World, target: Entity): void {
  const name =
    target.kind === 'building'
      ? BUILDINGS[target.defId]?.nameFr
      : UNITS[target.defId]?.nameFr;

  if (target.kind === 'building') {
    logEvent(world, `${name ?? 'Bâtiment'} détruit.`);
  }
}

function onDepleted(world: World, node: Entity): void {
  node.amount = 0;
  if (node.kind === 'building') {
    // Une ferme épuisée disparaît : il faut en reconstruire une.
    node.hp = 0;
    logEvent(world, 'Ferme épuisée.');
  } else {
    node.hp = 0;
  }
}

function removeDead(world: World): void {
  let structuresChanged = false;

  for (const e of [...world.entities.values()]) {
    if (e.hp > 0) continue;
    world.entities.delete(e.id);
    if (e.kind !== 'unit') structuresChanged = true;
  }

  if (structuresChanged) {
    rebuildBlocked(world);
    recomputePopulation(world);
  }
}

/**
 * Condition de victoire du GDD §8 : destruction totale de l'adversaire.
 * Un joueur sans la moindre unité ni le moindre bâtiment est éliminé.
 */
function checkVictory(world: World): void {
  const alive = [false, false];

  for (const e of world.entities.values()) {
    if (e.owner === null || e.hp <= 0) continue;
    alive[e.owner] = true;
  }

  for (const player of world.players) {
    if (!alive[player.id] && !player.defeated) {
      player.defeated = true;
      logEvent(world, `${player.nameFr} est éliminé.`);
    }
  }

  if (world.winner === null) {
    if (world.players[0].defeated) world.winner = 1;
    else if (world.players[1].defeated) world.winner = 0;
  }
}
