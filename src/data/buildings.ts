import type { BuildingDef } from './types.ts';

/**
 * Bâtiments (GDD §7).
 *
 * Les temps de construction sont donnés pour **un seul bâtisseur**. La règle
 * retenue est celle d'AoE : n bâtisseurs divisent le temps par n, avec un
 * rendement décroissant à définir au moment du prototype.
 *
 * Les PV des bâtiments sont élevés par rapport aux dégâts des unités : un
 * centre-ville ne tombe pas à quatre soldats. C'est ce qui rend l'attaque
 * coûteuse et donc préparée, conformément au rythme lent du GDD §4.
 */
export const BUILDINGS: Record<string, BuildingDef> = {
  // ─────────────────────────────────────────────────────────────────────────
  // Âge 1
  // ─────────────────────────────────────────────────────────────────────────

  centre_ville: {
    id: 'centre_ville',
    nameFr: 'Centre-ville',
    age: 1,
    hp: 2000,
    armor: 3,
    cost: { wood: 300, stone: 150 },
    buildTime: 120,
    footprint: { w: 4, h: 4 },
    popProvided: 10,
    dropOff: ['food', 'wood', 'gold', 'stone'],
    trains: ['paysan', 'fermier', 'bucheron', 'mineur', 'apprenti_soldat'],
    advancesAge: true,
  },

  maison: {
    id: 'maison',
    nameFr: 'Maison',
    age: 1,
    hp: 400,
    armor: 0,
    cost: { wood: 40 },
    buildTime: 25,
    footprint: { w: 2, h: 2 },
    popProvided: 5,
  },

  camp_bucheron: {
    id: 'camp_bucheron',
    nameFr: 'Camp de bûcheron',
    age: 1,
    hp: 500,
    armor: 0,
    cost: { wood: 80 },
    buildTime: 30,
    footprint: { w: 2, h: 2 },
    dropOff: ['wood'],
  },

  ferme: {
    id: 'ferme',
    nameFr: 'Ferme',
    age: 1,
    hp: 400,
    armor: 0,
    cost: { wood: 70 },
    buildTime: 25,
    footprint: { w: 3, h: 3 },
    dropOff: ['food'],
    // Stock fini : la ferme s'épuise et doit être reconstruite. C'est le
    // puits de nourriture de fin de partie, une fois le gibier et les baies
    // consommés, et un coût en bois récurrent qui garde l'économie active.
    contains: { resource: 'food', amount: 400 },
  },

  mine: {
    id: 'mine',
    nameFr: 'Mine',
    age: 1,
    hp: 500,
    armor: 0,
    cost: { wood: 100 },
    buildTime: 35,
    footprint: { w: 2, h: 2 },
    dropOff: ['gold', 'stone'],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Âge 2
  // ─────────────────────────────────────────────────────────────────────────

  caserne: {
    id: 'caserne',
    nameFr: 'Caserne',
    age: 2,
    hp: 1200,
    armor: 2,
    cost: { wood: 175 },
    buildTime: 60,
    footprint: { w: 3, h: 3 },
    trains: ['soldat', 'chevalier', 'chevalier_armure', 'chevalier_lance'],
  },

  archerie: {
    id: 'archerie',
    nameFr: 'Archerie',
    age: 2,
    hp: 1100,
    armor: 2,
    cost: { wood: 175 },
    buildTime: 60,
    footprint: { w: 3, h: 3 },
    trains: ['archer'],
  },

  ecurie: {
    id: 'ecurie',
    nameFr: 'Écurie',
    age: 2,
    hp: 1200,
    armor: 2,
    cost: { wood: 200 },
    buildTime: 65,
    footprint: { w: 3, h: 3 },
    trains: ['cavalier_lance', 'chevalier_porte_etendard'],
  },

  muraille: {
    id: 'muraille',
    nameFr: 'Muraille',
    age: 2,
    hp: 800,
    armor: 6,
    // Coût par segment : la pierre est la ressource la plus lente à récolter,
    // ce qui fait d'une grande muraille un vrai investissement stratégique
    // et non un réflexe systématique.
    cost: { stone: 5 },
    buildTime: 8,
    footprint: { w: 1, h: 1 },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Âge 3
  // ─────────────────────────────────────────────────────────────────────────

  forge: {
    id: 'forge',
    nameFr: 'Forge',
    age: 3,
    hp: 1200,
    armor: 2,
    cost: { wood: 150, gold: 50 },
    buildTime: 70,
    footprint: { w: 3, h: 3 },
    // Les améliorations elles-mêmes restent à concevoir (arbre technologique).
  },

  tour_garde: {
    id: 'tour_garde',
    nameFr: 'Tour de garde',
    age: 3,
    hp: 1000,
    armor: 5,
    cost: { wood: 50, stone: 125 },
    buildTime: 50,
    footprint: { w: 2, h: 2 },
    // Portée supérieure à celle de l'archer (7 contre 5) : une tour couvre
    // ses défenseurs et oblige l'attaquant à amener de quoi la démonter.
    combat: {
      attack: 12,
      attackCooldown: 2.0,
      range: 7,
      projectileSpeed: 8,
    },
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS);
