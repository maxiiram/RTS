/**
 * Analyse économique : rendements, rentabilité des unités spécialisées et
 * estimation du temps de passage d'âge.
 *
 * Ces fonctions servent à vérifier que les chiffres produisent bien le rythme
 * « lent et stratégique » du GDD §4, avant même d'avoir un prototype jouable.
 */

import { AGES } from '../data/ages.ts';
import { UNITS } from '../data/units.ts';
import type { AgeId, Cost, ResourceId, UnitDef } from '../data/types.ts';
import { costValue, RESOURCE_WEIGHTS } from './combat.ts';

/** Ressources par seconde d'une unité sur une ressource donnée. */
export function gatherRate(unit: UnitDef, resource: ResourceId): number {
  return unit.gather?.[resource] ?? 0;
}

/** Une affectation de collecteurs : n unités d'un type sur une ressource. */
export interface Assignment {
  unitId: string;
  resource: ResourceId;
  count: number;
}

/** Revenu total par seconde, ressource par ressource. */
export function income(assignments: Assignment[]): Record<ResourceId, number> {
  const total: Record<ResourceId, number> = { food: 0, wood: 0, gold: 0, stone: 0 };

  for (const { unitId, resource, count } of assignments) {
    const unit = UNITS[unitId];
    if (!unit) throw new Error(`Unité inconnue : ${unitId}`);
    total[resource] += gatherRate(unit, resource) * count;
  }

  return total;
}

/**
 * Temps (s) qu'une unité met à rembourser son propre coût sur une ressource.
 * Le coût est ramené en valeur pondérée, le revenu aussi : un paysan qui
 * récolte de l'or rembourse sa nourriture plus vite qu'il n'y paraît.
 */
export function selfPaybackTime(unit: UnitDef, resource: ResourceId): number {
  const rate = gatherRate(unit, resource);
  if (rate <= 0) return Infinity;
  const incomePerSecond = rate * RESOURCE_WEIGHTS[resource];
  return costValue(unit.cost) / incomePerSecond;
}

/**
 * Temps (s) au bout duquel un collecteur spécialisé devient plus rentable
 * qu'un paysan sur sa ressource de prédilection.
 *
 * C'est le chiffre qui arbitre le choix économique central du GDD §6 :
 * se spécialiser tôt (rendement) ou rester polyvalent (flexibilité).
 * En dessous d'une minute, la spécialisation deviendrait automatique et le
 * choix disparaîtrait ; au-delà de cinq minutes, personne ne spécialiserait
 * jamais. La cible est entre les deux.
 */
export function specialistPayback(
  specialist: UnitDef,
  resource: ResourceId,
  baseline: UnitDef = UNITS['paysan'] as UnitDef,
): number {
  const gain = gatherRate(specialist, resource) - gatherRate(baseline, resource);
  if (gain <= 0) return Infinity;

  const extraCost = costValue(specialist.cost) - costValue(baseline.cost);
  return extraCost / (gain * RESOURCE_WEIGHTS[resource]);
}

/**
 * Temps (s) pour accumuler un coût donné avec un revenu donné.
 * Renvoie Infinity si une ressource requise n'est pas récoltée du tout.
 */
export function timeToAfford(cost: Cost, perSecond: Record<ResourceId, number>): number {
  let slowest = 0;

  for (const [resource, amount] of Object.entries(cost)) {
    const needed = amount ?? 0;
    if (needed <= 0) continue;
    const rate = perSecond[resource as ResourceId];
    if (rate <= 0) return Infinity;
    slowest = Math.max(slowest, needed / rate);
  }

  return slowest;
}

/**
 * Estimation du temps de passage à un âge : accumulation des ressources puis
 * durée de la recherche. Modèle volontairement grossier — revenu constant,
 * aucune dépense concurrente — donc un plancher optimiste. En partie réelle,
 * le joueur construit et produit en même temps : compter nettement plus.
 */
export function timeToAdvance(age: AgeId, perSecond: Record<ResourceId, number>): number {
  const def = AGES[age];
  if (!def.advanceCost || def.advanceTime === undefined) return 0;
  return timeToAfford(def.advanceCost, perSecond) + def.advanceTime;
}
