import type { UnitDef } from './types.ts';

/**
 * Roster complet (GDD §6).
 *
 * === Comment lire ces chiffres ===
 *
 * `gddRank` reprend les valeurs 1-10 du document de design. Les stats réelles
 * (hp, attack, armor, speed) en sont une traduction jouable, pas une simple
 * multiplication : l'ordre relatif du GDD est conservé — et testé — mais les
 * écarts sont creusés là où c'est nécessaire pour que les contre-systèmes
 * fonctionnent réellement en jeu.
 *
 * Le modèle de dégâts est volontairement simple (GDD §6, 4 stats seulement) :
 *
 *     dégâts = max(1, attaque + bonus_de_classe - armure_de_la_cible)
 *
 * Pas de types de dégâts séparés (perforant/contondant) comme dans AoE2 :
 * une seule valeur d'armure, et les contres passent par `bonusDamage`, qui
 * cible une classe d'unité. C'est plus lisible pour le joueur et suffisant
 * pour produire le triangle archer / cavalerie / lance du GDD.
 *
 * Les cooldowns d'attaque sont longs (2 s et plus) : c'est ce qui donne au
 * combat son rythme « lent », des batailles qui durent et où repositionner
 * ses unités a le temps d'avoir un effet.
 */
export const UNITS: Record<string, UnitDef> = {
  // ─────────────────────────────────────────────────────────────────────────
  // Unités économiques
  // ─────────────────────────────────────────────────────────────────────────

  paysan: {
    id: 'paysan',
    nameFr: 'Paysan',
    class: 'villager',
    role: 'economic',
    age: 1,
    trainedAt: 'centre_ville',
    gddRank: { hp: 3, damage: 1, speed: 4, armor: 1 },
    hp: 40,
    armor: 0,
    speed: 1.0,
    los: 6,
    popCost: 1,
    cost: { food: 50 },
    trainTime: 20,
    combat: {
      attack: 3,
      attackCooldown: 2.0,
      range: 0.6,
      bonusDamage: { building: 2 },
    },
    // Polyvalent mais médiocre partout : le paysan récolte les 4 ressources
    // sans exceller nulle part. C'est le mètre étalon économique du jeu.
    gather: { food: 0.4, wood: 0.35, gold: 0.3, stone: 0.3 },
  },

  fermier: {
    id: 'fermier',
    nameFr: 'Fermier',
    class: 'villager',
    role: 'economic',
    age: 2,
    trainedAt: 'centre_ville',
    gddRank: { hp: 3, damage: 1, speed: 4, armor: 1 },
    hp: 40,
    armor: 0,
    speed: 1.0,
    los: 6,
    popCost: 1,
    cost: { food: 60, wood: 40 },
    trainTime: 30,
    combat: { attack: 3, attackCooldown: 2.0, range: 0.6 },
    // +75 % sur la nourriture, quasi inutile ailleurs : spécialiser tôt paie,
    // mais fige une part de l'économie (cf. temps de rentabilité dans le
    // rapport d'équilibrage).
    gather: { food: 0.7, wood: 0.1, gold: 0.1, stone: 0.1 },
  },

  bucheron: {
    id: 'bucheron',
    nameFr: 'Bûcheron',
    class: 'villager',
    role: 'economic',
    age: 2,
    trainedAt: 'centre_ville',
    gddRank: { hp: 3, damage: 1, speed: 4, armor: 1 },
    hp: 40,
    armor: 0,
    speed: 1.0,
    los: 6,
    popCost: 1,
    cost: { food: 60, wood: 40 },
    trainTime: 30,
    combat: { attack: 3, attackCooldown: 2.0, range: 0.6 },
    gather: { food: 0.1, wood: 0.65, gold: 0.1, stone: 0.1 },
  },

  mineur: {
    id: 'mineur',
    nameFr: 'Mineur',
    class: 'villager',
    role: 'economic',
    age: 2,
    trainedAt: 'centre_ville',
    gddRank: { hp: 3, damage: 1, speed: 4, armor: 1 },
    hp: 40,
    armor: 0,
    speed: 1.0,
    los: 6,
    popCost: 1,
    cost: { food: 70, wood: 40 },
    trainTime: 35,
    combat: { attack: 3, attackCooldown: 2.0, range: 0.6 },
    // Seule unité à couvrir deux ressources (or ET pierre), d'où son surcoût.
    gather: { food: 0.1, wood: 0.1, gold: 0.6, stone: 0.55 },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Unités militaires — Âge 1
  // ─────────────────────────────────────────────────────────────────────────

  apprenti_soldat: {
    id: 'apprenti_soldat',
    nameFr: 'Apprenti soldat',
    class: 'infantry',
    role: 'military',
    age: 1,
    trainedAt: 'centre_ville',
    gddRank: { hp: 4, damage: 3, speed: 4, armor: 2 },
    hp: 55,
    armor: 1,
    speed: 1.0,
    los: 7,
    popCost: 1,
    cost: { food: 60, wood: 20 },
    trainTime: 20,
    combat: { attack: 6, attackCooldown: 2.0, range: 0.6 },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Unités militaires — Âge 2
  // ─────────────────────────────────────────────────────────────────────────

  soldat: {
    id: 'soldat',
    nameFr: 'Soldat',
    class: 'infantry',
    role: 'military',
    age: 2,
    trainedAt: 'caserne',
    gddRank: { hp: 5, damage: 4, speed: 4, armor: 2 },
    hp: 75,
    armor: 1,
    speed: 1.0,
    los: 7,
    popCost: 1,
    cost: { food: 65, wood: 25 },
    trainTime: 24,
    combat: { attack: 9, attackCooldown: 2.0, range: 0.6 },
  },

  archer: {
    id: 'archer',
    nameFr: 'Archer',
    class: 'archer',
    role: 'military',
    age: 2,
    trainedAt: 'archerie',
    gddRank: { hp: 3, damage: 4, speed: 4, armor: 1 },
    hp: 45,
    armor: 0,
    speed: 1.0,
    los: 9,
    popCost: 1,
    cost: { wood: 40, gold: 25 },
    trainTime: 26,
    // Sa force n'est pas son DPS mais sa portée : 5 tuiles, soit ~5 secondes
    // de tir gratuit sur une unité de mêlée qui charge. Fragile au contact.
    combat: {
      attack: 8,
      attackCooldown: 2.2,
      range: 5.0,
      projectileSpeed: 8,
    },
  },

  cavalier_lance: {
    id: 'cavalier_lance',
    nameFr: 'Cavalier à lance',
    class: 'cavalry',
    role: 'military',
    age: 2,
    trainedAt: 'ecurie',
    gddRank: { hp: 6, damage: 3, speed: 8, armor: 2 },
    hp: 90,
    armor: 1,
    speed: 1.8,
    los: 8,
    popCost: 1,
    cost: { food: 80, gold: 30 },
    trainTime: 30,
    // La charge récompense l'approche en ligne droite depuis le hors-champ :
    // c'est la mécanique qui rend la cavalerie mortelle contre les archers
    // et sans intérêt dans une mêlée déjà engagée.
    combat: {
      attack: 7,
      attackCooldown: 2.2,
      range: 0.6,
      charge: { bonus: 8, minDistance: 4, cooldown: 12 },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Unités militaires — Âge 3
  // ─────────────────────────────────────────────────────────────────────────

  chevalier: {
    id: 'chevalier',
    nameFr: 'Chevalier',
    // Monté, donc classé `cavalry` : c'est ce qui le rend vulnérable au
    // chevalier à la lance et referme le triangle de contres à l'âge 3.
    // Classé `infantry`, il gagnait tous ses duels sans exception, aucune
    // unité du roster n'ayant de quoi le menacer.
    // Sa vitesse reste celle d'un fantassin (note 4 au GDD) : c'est une
    // cavalerie lourde de ligne, pas un cavalier de raid.
    class: 'cavalry',
    role: 'military',
    age: 3,
    trainedAt: 'caserne',
    gddRank: { hp: 6, damage: 5, speed: 4, armor: 3 },
    hp: 100,
    armor: 2,
    speed: 1.0,
    los: 7,
    popCost: 1,
    cost: { food: 80, gold: 50 },
    trainTime: 32,
    // Le plus gros dégât brut du roster hors porte-étendard : c'est lui qui
    // perce le chevalier en armure, conformément au GDD §6.
    combat: { attack: 15, attackCooldown: 2.0, range: 0.6 },
  },

  chevalier_armure: {
    id: 'chevalier_armure',
    nameFr: 'Chevalier en armure',
    class: 'infantry',
    role: 'military',
    age: 3,
    trainedAt: 'caserne',
    gddRank: { hp: 7, damage: 3, speed: 3, armor: 6 },
    hp: 130,
    armor: 5,
    speed: 0.85,
    los: 7,
    popCost: 1,
    // Moins cher que le chevalier : c'est un spécialiste défensif, pas un
    // meilleur chevalier. Le prix fort va à la polyvalence, pas à l'armure.
    cost: { food: 75, gold: 50 },
    trainTime: 38,
    // Armure 5 : réduit un archer (8 d'attaque) à 3 dégâts par tir. Le tank
    // encaisse pendant que le reste de l'armée fait le travail.
    combat: { attack: 7, attackCooldown: 2.0, range: 0.6 },
  },

  chevalier_lance: {
    id: 'chevalier_lance',
    nameFr: 'Chevalier à la lance',
    class: 'infantry',
    role: 'military',
    age: 3,
    trainedAt: 'caserne',
    gddRank: { hp: 5, damage: 3, speed: 4, armor: 3 },
    hp: 80,
    armor: 2,
    speed: 1.0,
    los: 7,
    popCost: 1,
    cost: { food: 45, wood: 40, gold: 20 },
    trainTime: 28,
    // Anti-cavalerie dédié : dégâts bruts faibles (7, soit moins qu'un
    // soldat), mais +16 contre la classe `cavalry`. Soit 23 contre un cheval
    // et 7 contre tout le reste — un écart assez énorme pour être lisible
    // sans lire une infobulle.
    //
    // L'allonge de 1.4 tuile lui donne le premier coup contre toute unité de
    // mêlée : l'adversaire doit franchir 0.8 tuile de plus avant de riposter.
    // C'est un coup gratuit par engagement, pas un avantage continu — un
    // fantassin ne recule pas pour maintenir sa distance.
    combat: {
      attack: 7,
      attackCooldown: 2.0,
      range: 1.4,
      bonusDamage: { cavalry: 16 },
    },
  },

  chevalier_porte_etendard: {
    id: 'chevalier_porte_etendard',
    nameFr: 'Chevalier porte-étendard',
    class: 'cavalry',
    role: 'military',
    age: 3,
    trainedAt: 'ecurie',
    gddRank: { hp: 9, damage: 7, speed: 6, armor: 6 },
    hp: 180,
    armor: 5,
    speed: 1.5,
    los: 10,
    popCost: 3,
    cost: { food: 250, gold: 300 },
    trainTime: 90,
    // Un seul par joueur : c'est la pièce maîtresse, pas une unité de masse.
    // Sa vraie valeur est l'aura — envoyé seul il meurt sur une lance.
    maxCount: 1,
    combat: {
      attack: 18,
      attackCooldown: 2.0,
      range: 0.6,
      charge: { bonus: 10, minDistance: 4, cooldown: 12 },
    },
    aura: { radius: 6, attack: 2, armor: 1 },
  },
};

export const UNIT_IDS = Object.keys(UNITS);
