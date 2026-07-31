/**
 * Modèle de combat et outils d'analyse d'équilibrage.
 *
 * Les fonctions de ce module sont pures et déterministes : aucun aléatoire,
 * aucune dépendance à l'horloge système. C'est une exigence du multijoueur
 * en lockstep — la même entrée doit donner exactement le même résultat sur
 * tous les clients — et ça permet accessoirement de tester l'équilibrage.
 */

import { MIN_DAMAGE, SIM_TICK_SECONDS } from '../data/constants.ts';
import type { BuildingDef, Cost, ResourceId, UnitClass, UnitDef } from '../data/types.ts';

/**
 * Ce qu'il faut savoir d'une cible pour calculer des dégâts : son armure et
 * sa classe. Unités et bâtiments passent donc par la même formule.
 */
export interface DamageTarget {
  armor: number;
  class: UnitClass;
  hp: number;
}

/** Vue « cible » d'un bâtiment, pour le calcul des dégâts de siège. */
export function asTarget(building: BuildingDef): DamageTarget {
  return { armor: building.armor, class: 'building', hp: building.hp };
}

/**
 * Dégâts d'un coup, bonus de classe et de charge inclus.
 *
 * Formule : max(MIN_DAMAGE, attaque + bonus_classe + bonus_charge - armure)
 */
export function damagePerHit(
  attacker: UnitDef,
  defender: DamageTarget,
  options: { charged?: boolean } = {},
): number {
  const combat = attacker.combat;
  if (!combat) return 0;

  const classBonus = combat.bonusDamage?.[defender.class] ?? 0;
  const chargeBonus = options.charged ? (combat.charge?.bonus ?? 0) : 0;
  const raw = combat.attack + classBonus + chargeBonus - defender.armor;

  return Math.max(MIN_DAMAGE, raw);
}

/** Dégâts par seconde soutenus, hors charge (qui est un pic ponctuel). */
export function dps(attacker: UnitDef, defender: DamageTarget): number {
  const combat = attacker.combat;
  if (!combat) return 0;
  return damagePerHit(attacker, defender) / combat.attackCooldown;
}

/** Temps (s) pour tuer, hors déplacement — utile pour comparer des DPS bruts. */
export function timeToKill(attacker: UnitDef, defender: DamageTarget): number {
  const perSecond = dps(attacker, defender);
  return perSecond > 0 ? defender.hp / perSecond : Infinity;
}

/**
 * PV effectifs face à une attaque donnée : combien de dégâts bruts il faut
 * réellement infliger pour tuer l'unité, armure prise en compte. C'est la
 * mesure qui rend lisible la valeur d'une armure élevée.
 */
export function effectiveHp(unit: DamageTarget, incomingAttack: number): number {
  const perHit = Math.max(MIN_DAMAGE, incomingAttack - unit.armor);
  return (unit.hp / perHit) * incomingAttack;
}

/**
 * Pondération des ressources pour comparer des coûts hétérogènes.
 * L'or et la pierre sont plus chers que leur valeur brute : ils se récoltent
 * plus lentement et leurs gisements sont finis et disputés sur la carte.
 */
export const RESOURCE_WEIGHTS: Record<ResourceId, number> = {
  food: 1.0,
  wood: 1.0,
  gold: 1.75,
  stone: 1.5,
};

/** Coût total d'un achat, ramené à une valeur unique comparable. */
export function costValue(cost: Cost): number {
  let total = 0;
  for (const [resource, amount] of Object.entries(cost)) {
    total += (amount ?? 0) * RESOURCE_WEIGHTS[resource as ResourceId];
  }
  return total;
}

export interface DuelOptions {
  /** Distance de départ en tuiles. Par défaut hors de portée de tous. */
  startDistance?: number;
  /** Abandon au bout de ce délai (s) : le duel est déclaré nul. */
  maxSeconds?: number;
}

export interface DuelResult {
  winner: 'a' | 'b' | 'draw';
  /** Durée du duel en secondes. */
  seconds: number;
  /** PV restants au vainqueur. */
  winnerHp: number;
  /** Part des PV du vainqueur encore intacts, entre 0 et 1. */
  winnerHpRatio: number;
  /** Qui touche en premier — c'est là que l'allonge se mesure. */
  firstStriker: 'a' | 'b' | 'draw';
  /**
   * Avance (s) du premier tireur sur la riposte adverse. C'est tout ce
   * qu'une allonge supérieure rapporte au corps-à-corps : le temps que
   * l'adversaire met à franchir l'écart de portée, soit en général de quoi
   * placer un coup gratuit, pas davantage.
   */
  openingAdvantage: number;
}

interface DuelState {
  unit: UnitDef;
  hp: number;
  position: number;
  cooldown: number;
  /** Distance parcourue depuis le dernier arrêt, pour armer la charge. */
  travelled: number;
  chargeReady: boolean;
  chargeCooldown: number;
}

function initState(unit: UnitDef, position: number): DuelState {
  return {
    unit,
    hp: unit.hp,
    position,
    cooldown: 0,
    travelled: 0,
    chargeReady: true,
    chargeCooldown: 0,
  };
}

/**
 * Duel 1 contre 1, simulé au pas fixe.
 *
 * Les deux unités partent à distance et avancent l'une vers l'autre jusqu'à
 * être à portée. C'est volontairement plus réaliste qu'une comparaison de DPS :
 * ça capture l'avantage de la portée (l'archer tire pendant l'approche) et
 * celui de la vitesse (la cavalerie franchit cette zone bien plus vite),
 * qui sont précisément les axes des contre-systèmes du GDD §6.
 *
 * Aucune micro-gestion n'est simulée : personne ne recule pour tirer en
 * kitant. Les résultats sont donc un plancher pour les unités à distance,
 * pas leur potentiel maximal entre les mains d'un joueur.
 */
export function simulateDuel(
  unitA: UnitDef,
  unitB: UnitDef,
  options: DuelOptions = {},
): DuelResult {
  const startDistance = options.startDistance ?? 8;
  const maxSeconds = options.maxSeconds ?? 300;
  const dt = SIM_TICK_SECONDS;

  const a = initState(unitA, 0);
  const b = initState(unitB, startDistance);

  let elapsed = 0;
  let firstHitA: number | null = null;
  let firstHitB: number | null = null;

  const opening = (): Pick<DuelResult, 'firstStriker' | 'openingAdvantage'> => {
    if (firstHitA === null && firstHitB === null) {
      return { firstStriker: 'draw', openingAdvantage: 0 };
    }
    if (firstHitB === null) return { firstStriker: 'a', openingAdvantage: 0 };
    if (firstHitA === null) return { firstStriker: 'b', openingAdvantage: 0 };
    if (firstHitA === firstHitB) return { firstStriker: 'draw', openingAdvantage: 0 };
    return {
      firstStriker: firstHitA < firstHitB ? 'a' : 'b',
      openingAdvantage: round(Math.abs(firstHitB - firstHitA), 2),
    };
  };

  while (elapsed < maxSeconds) {
    const distance = Math.abs(b.position - a.position);

    // Les dégâts des deux camps sont calculés avant d'être appliqués : une
    // élimination mutuelle sur le même tick reste possible, plutôt que de
    // donner un avantage arbitraire à celui qui est traité en premier.
    const damageToB = resolveAttack(a, b, distance, dt);
    const damageToA = resolveAttack(b, a, distance, dt);

    if (damageToB > 0 && firstHitA === null) firstHitA = elapsed;
    if (damageToA > 0 && firstHitB === null) firstHitB = elapsed;

    a.hp -= damageToA;
    b.hp -= damageToB;

    elapsed += dt;

    if (a.hp <= 0 || b.hp <= 0) {
      const seconds = round(elapsed, 2);
      if (a.hp <= 0 && b.hp <= 0) {
        return { winner: 'draw', seconds, winnerHp: 0, winnerHpRatio: 0, ...opening() };
      }
      const winner = a.hp > 0 ? 'a' : 'b';
      const winnerHp = Math.max(a.hp, b.hp);
      const winnerUnit = winner === 'a' ? unitA : unitB;
      return {
        winner,
        seconds,
        winnerHp: round(winnerHp, 1),
        winnerHpRatio: round(winnerHp / winnerUnit.hp, 3),
        ...opening(),
      };
    }
  }

  return { winner: 'draw', seconds: maxSeconds, winnerHp: 0, winnerHpRatio: 0, ...opening() };
}

/**
 * Fait avancer une unité d'un tick : elle approche, ou elle frappe si elle
 * est à portée et que son cooldown est écoulé. Renvoie les dégâts infligés.
 */
function resolveAttack(
  attacker: DuelState,
  defender: DuelState,
  distance: number,
  dt: number,
): number {
  const combat = attacker.unit.combat;
  if (!combat) return 0;

  attacker.cooldown = Math.max(0, attacker.cooldown - dt);
  attacker.chargeCooldown = Math.max(0, attacker.chargeCooldown - dt);
  if (attacker.chargeCooldown === 0) attacker.chargeReady = true;

  if (distance > combat.range) {
    // Hors de portée : on avance, et la distance parcourue arme la charge.
    const step = attacker.unit.speed * dt;
    const direction = defender.position > attacker.position ? 1 : -1;
    attacker.position += direction * step;
    attacker.travelled += step;
    return 0;
  }

  if (attacker.cooldown > 0) return 0;

  const charge = combat.charge;
  const charged =
    charge !== undefined &&
    attacker.chargeReady &&
    attacker.travelled >= charge.minDistance;

  const damage = damagePerHit(attacker.unit, defender.unit, { charged });

  attacker.cooldown = combat.attackCooldown;
  attacker.travelled = 0;
  if (charged && charge) {
    attacker.chargeReady = false;
    attacker.chargeCooldown = charge.cooldown;
  }

  return damage;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
