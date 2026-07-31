import type { AgeDef, AgeId } from './types.ts';

/**
 * Progression en 3 âges (GDD §5).
 *
 * Les coûts et durées sont calibrés pour le rythme « lent et stratégique » :
 * avec une économie de début de partie (~8 paysans, cf. src/balance/economy.ts),
 * l'âge 2 tombe autour de 8-10 minutes et l'âge 3 vers 20 minutes.
 * Le premier affrontement sérieux arrive donc après une vraie phase économique,
 * et non dans les trois premières minutes.
 */
export const AGES: Record<AgeId, AgeDef> = {
  1: {
    id: 1,
    nameFr: 'Âge des Villages',
  },
  2: {
    id: 2,
    nameFr: 'Âge Féodal',
    advanceCost: { food: 500 },
    advanceTime: 75,
    requiredBuildings: 2,
  },
  3: {
    id: 3,
    nameFr: 'Âge des Châteaux',
    advanceCost: { food: 800, gold: 400 },
    advanceTime: 120,
    requiredBuildings: 2,
  },
};

export const AGE_IDS: AgeId[] = [1, 2, 3];
