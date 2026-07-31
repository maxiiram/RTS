/**
 * Types des données d'équilibrage.
 *
 * Ces définitions sont volontairement pures : pas de logique, pas de dépendance
 * au moteur de rendu. La simulation (déterministe, à pas fixe) et le rendu
 * PixiJS liront ces mêmes tables, ce qui garantit que client et serveur
 * partagent exactement les mêmes chiffres.
 */

export type ResourceId = 'food' | 'wood' | 'gold' | 'stone';

/** Un coût partiel : les ressources absentes valent 0. */
export type Cost = Partial<Record<ResourceId, number>>;

/** Les trois âges du GDD (§5). */
export type AgeId = 1 | 2 | 3;

/**
 * Classe d'unité — sert de cible aux bonus de dégâts (le « chevalier à la
 * lance » frappe la classe `cavalry`, pas une unité en particulier).
 */
export type UnitClass = 'villager' | 'infantry' | 'archer' | 'cavalry' | 'building';

export type UnitRole = 'economic' | 'military';

/**
 * Les valeurs 1-10 du GDD (§6), conservées telles quelles.
 * Les tests vérifient que les stats réelles respectent l'ordre relatif
 * défini ici : si le GDD dit qu'une unité a plus de vie qu'une autre, les PV
 * réels doivent le refléter. C'est le garde-fou contre une dérive silencieuse
 * de l'équilibrage par rapport au document de design.
 */
export interface GddRank {
  hp: number;
  damage: number;
  speed: number;
  armor: number;
}

export interface ChargeProfile {
  /** Dégâts bruts ajoutés au premier coup après une charge. */
  bonus: number;
  /** Distance (en tuiles) à parcourir sans s'arrêter pour armer la charge. */
  minDistance: number;
  /** Délai (s) avant de pouvoir recharger après un coup chargé. */
  cooldown: number;
}

export interface CombatProfile {
  /** Dégâts bruts avant soustraction de l'armure. */
  attack: number;
  /** Secondes entre deux attaques. */
  attackCooldown: number;
  /** Portée en tuiles. Le corps-à-corps vaut moins de 1. */
  range: number;
  /** Tuiles/seconde du projectile ; absent pour le corps-à-corps. */
  projectileSpeed?: number;
  /** Dégâts bruts supplémentaires contre une classe donnée. */
  bonusDamage?: Partial<Record<UnitClass, number>>;
  charge?: ChargeProfile;
}

/** Buff de zone du chevalier porte-étendard (GDD §6). */
export interface AuraProfile {
  radius: number;
  attack: number;
  armor: number;
}

/** Ressources/seconde par type de ressource. */
export type GatherRates = Record<ResourceId, number>;

export interface UnitDef {
  id: string;
  nameFr: string;
  class: UnitClass;
  role: UnitRole;
  /** Âge auquel l'unité devient disponible. */
  age: AgeId;
  /** Bâtiment qui produit l'unité. */
  trainedAt: string;
  gddRank: GddRank;
  hp: number;
  armor: number;
  /** Vitesse de déplacement en tuiles/seconde. */
  speed: number;
  /** Ligne de vue en tuiles (portée du brouillard de guerre). */
  los: number;
  popCost: number;
  cost: Cost;
  /** Temps de production en secondes. */
  trainTime: number;
  /** Plafond d'exemplaires simultanés par joueur, si limité. */
  maxCount?: number;
  combat?: CombatProfile;
  gather?: GatherRates;
  aura?: AuraProfile;
}

export interface BuildingDef {
  id: string;
  nameFr: string;
  age: AgeId;
  hp: number;
  armor: number;
  cost: Cost;
  /** Temps de construction en secondes (un seul bâtisseur). */
  buildTime: number;
  /** Emprise au sol en tuiles. */
  footprint: { w: number; h: number };
  /** Population maximale ajoutée. */
  popProvided?: number;
  /** Ressources que ce bâtiment accepte en dépôt. */
  dropOff?: ResourceId[];
  /** Unités produites ici. */
  trains?: string[];
  /** Permet la recherche d'âge. */
  advancesAge?: boolean;
  /** Stock fini de ressource contenu par le bâtiment (ferme). */
  contains?: { resource: ResourceId; amount: number };
  combat?: CombatProfile;
}

export interface AgeDef {
  id: AgeId;
  nameFr: string;
  /** Coût de la recherche qui débloque cet âge ; absent pour l'âge 1. */
  advanceCost?: Cost;
  /** Durée de la recherche en secondes. */
  advanceTime?: number;
  /** Nombre de bâtiments de l'âge précédent requis pour lancer la recherche. */
  requiredBuildings?: number;
}

export interface ResourceDef {
  id: ResourceId;
  nameFr: string;
  /** Quantité par gisement/arbre sur la carte. */
  nodeAmount: number;
  /** Ce qu'un collecteur porte avant de devoir déposer. */
  carryCapacity: number;
  /** Le stock est-il renouvelable (fermes) ou fini (mines, forêts) ? */
  finite: boolean;
}
