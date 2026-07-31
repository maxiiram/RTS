/**
 * Point d'entrée unique des données d'équilibrage.
 *
 * Le reste du code (simulation, IA, interface, serveur multijoueur) importe
 * depuis ce module et jamais depuis un fichier de données directement : ça
 * laisse la possibilité de charger les tables depuis du JSON plus tard sans
 * toucher aux appelants.
 */

export * from './types.ts';
export * from './constants.ts';
export { RESOURCES, RESOURCE_IDS } from './resources.ts';
export { AGES, AGE_IDS } from './ages.ts';
export { UNITS, UNIT_IDS } from './units.ts';
export { BUILDINGS, BUILDING_IDS } from './buildings.ts';
