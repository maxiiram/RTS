import type { ResourceDef, ResourceId } from './types.ts';

/**
 * Les 4 ressources du GDD (§5).
 *
 * Rareté croissante : bois et nourriture sont abondants et alimentent tout
 * le début de partie ; l'or est rare et conditionne les unités d'élite ;
 * la pierre est le goulot d'étranglement des fortifications, ce qui force
 * un choix entre se défendre et progresser.
 */
export const RESOURCES: Record<ResourceId, ResourceDef> = {
  food: {
    id: 'food',
    nameFr: 'Nourriture',
    nodeAmount: 300,
    carryCapacity: 10,
    finite: true,
  },
  wood: {
    id: 'wood',
    nameFr: 'Bois',
    nodeAmount: 200,
    carryCapacity: 10,
    finite: true,
  },
  gold: {
    id: 'gold',
    nameFr: 'Or',
    nodeAmount: 600,
    carryCapacity: 8,
    finite: true,
  },
  stone: {
    id: 'stone',
    nameFr: 'Pierre',
    nodeAmount: 400,
    carryCapacity: 8,
    finite: true,
  },
};

export const RESOURCE_IDS: ResourceId[] = ['food', 'wood', 'gold', 'stone'];
