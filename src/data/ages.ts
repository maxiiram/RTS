import type { AgeDef, AgeId } from './types.ts';

/**
 * Progression en 3 âges (GDD §5).
 *
 * Les coûts et durées sont calibrés pour le rythme « lent et stratégique ».
 * Ils ont été relevés après un essai jugé trop expéditif : sur la grande carte,
 * l'âge 2 tombe autour de 11-13 minutes et l'âge 3 vers 25 minutes, pour une
 * partie qui ressemble à une escarmouche d'Age of Empires plutôt qu'à une
 * course de dix minutes.
 */
export const AGES: Record<AgeId, AgeDef> = {
  1: {
    id: 1,
    nameFr: 'Âge des Villages',
  },
  2: {
    id: 2,
    nameFr: 'Âge Féodal',
    advanceCost: { food: 600 },
    advanceTime: 100,
    requiredBuildings: 2,
  },
  3: {
    id: 3,
    nameFr: 'Âge des Châteaux',
    advanceCost: { food: 1000, gold: 600 },
    advanceTime: 160,
    requiredBuildings: 2,
  },
};

export const AGE_IDS: AgeId[] = [1, 2, 3];
