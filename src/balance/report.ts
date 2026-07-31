/**
 * Rapport d'équilibrage — `npm run balance`.
 *
 * Affiche en console tout ce qu'on peut vérifier sans jouer : coûts, rendements,
 * efficacité par ressource investie, matrice des duels, rentabilité des
 * collecteurs spécialisés et rythme estimé de la partie.
 *
 * C'est l'outil à relancer après chaque retouche d'un chiffre, pour voir
 * immédiatement ce qui bascule ailleurs.
 */

import { BUILDINGS } from '../data/buildings.ts';
import { UNITS } from '../data/units.ts';
import { RESOURCE_IDS } from '../data/resources.ts';
import { AGES } from '../data/ages.ts';
import { POP_CAP, STARTING_RESOURCES } from '../data/constants.ts';
import type { BuildingDef, Cost, ResourceId, UnitDef } from '../data/types.ts';
import { asTarget, costValue, damagePerHit, dps, effectiveHp, simulateDuel } from './combat.ts';
import { income, selfPaybackTime, specialistPayback, timeToAdvance } from './economy.ts';

const MILITARY = Object.values(UNITS).filter((u) => u.role === 'military');
const ECONOMIC = Object.values(UNITS).filter((u) => u.role === 'economic');

/** Cible de référence pour comparer les DPS : ni armure, ni classe bonifiée. */
const DUMMY: UnitDef = {
  id: 'dummy',
  nameFr: 'Mannequin',
  class: 'infantry',
  role: 'military',
  age: 1,
  trainedAt: 'caserne',
  gddRank: { hp: 5, damage: 0, speed: 0, armor: 0 },
  hp: 100,
  armor: 0,
  speed: 0,
  los: 0,
  popCost: 1,
  cost: {},
  trainTime: 0,
};

function formatCost(cost: Cost): string {
  const parts = RESOURCE_IDS.filter((r) => (cost[r] ?? 0) > 0).map(
    (r) => `${cost[r]}${r[0]!.toUpperCase()}`,
  );
  return parts.length > 0 ? parts.join(' ') : '—';
}

function n(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '∞';
  return value.toFixed(digits);
}

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(displayWidth(h), ...rows.map((row) => displayWidth(row[i] ?? ''))),
  );

  const line = (cells: string[]) =>
    cells.map((c, i) => pad(c, widths[i] ?? 0, i === 0)).join('  ');

  const separator = widths.map((w) => '─'.repeat(w)).join('  ');

  return [line(headers), separator, ...rows.map(line)].join('\n');
}

/** Largeur d'affichage : les accents comptent pour un caractère. */
function displayWidth(text: string): number {
  return [...text.normalize('NFC')].length;
}

function pad(text: string, width: number, left: boolean): string {
  const filler = ' '.repeat(Math.max(0, width - displayWidth(text)));
  return left ? text + filler : filler + text;
}

function title(text: string): void {
  console.log(`\n\n${text}\n${'═'.repeat(displayWidth(text))}`);
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Roster militaire
// ───────────────────────────────────────────────────────────────────────────

function militaryRoster(): void {
  title('1. Roster militaire');

  const rows = MILITARY.map((u) => {
    const value = costValue(u.cost);
    const unitDps = dps(u, DUMMY);
    // Puissance de combat : ce que l'unité inflige × ce qu'elle encaisse.
    // Rapportée à sa valeur en ressources, elle rend comparables des unités
    // qui ne coûtent ni la même chose ni les mêmes ressources.
    const power = unitDps * effectiveHp(u, 10);
    return [
      u.nameFr,
      String(u.age),
      formatCost(u.cost),
      n(value, 0),
      `${u.trainTime}s`,
      String(u.popCost),
      String(u.hp),
      String(u.combat?.attack ?? 0),
      String(u.armor),
      n(u.speed, 2),
      n(u.combat?.range ?? 0, 1),
      n(unitDps, 2),
      n(effectiveHp(u, 10), 0),
      n(power / value, 2),
    ];
  });

  console.log(
    table(
      ['Unité', 'Âge', 'Coût', 'Val.', 'Prod.', 'Pop', 'PV', 'Att', 'Arm', 'Vit', 'Port', 'DPS', 'PVeff', 'Eff/val'],
      rows,
    ),
  );
  console.log(
    '\nDPS et PVeff sont mesurés contre une cible sans armure (attaque 10 pour les PV effectifs).',
  );
  console.log(
    "Eff/val = (DPS × PVeff) / valeur du coût : plus c'est haut, plus l'unité rend par ressource investie.",
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 2. Matrice des duels
// ───────────────────────────────────────────────────────────────────────────

function duelMatrix(): void {
  title('2. Matrice des duels 1v1 (départ à 8 tuiles)');

  const headers = ['Attaquant \\ Défenseur', ...MILITARY.map((u) => short(u))];
  const rows = MILITARY.map((a) => {
    const cells = MILITARY.map((b) => {
      if (a.id === b.id) return '—';
      const result = simulateDuel(a, b);
      if (result.winner === 'draw') return 'nul';
      const symbol = result.winner === 'a' ? '✓' : '✗';
      return `${symbol} ${n(result.seconds, 0)}s`;
    });
    return [a.nameFr, ...cells];
  });

  console.log(table(headers, rows));
  console.log('\n✓ = la ligne gagne, ✗ = la colonne gagne. Le temps est la durée du duel.');
  console.log(
    'Aucune micro-gestion simulée : les unités à distance ne kitent pas, leurs résultats sont donc un plancher.',
  );
}

function short(unit: UnitDef): string {
  return unit.nameFr
    .split(' ')
    .map((w) => w.slice(0, 3))
    .join('.');
}

// ───────────────────────────────────────────────────────────────────────────
// 3. Contre-systèmes du GDD
// ───────────────────────────────────────────────────────────────────────────

interface CounterCheck {
  label: string;
  winner: string;
  loser: string;
}

const COUNTERS: CounterCheck[] = [
  { label: 'Cavalier à lance > Archer', winner: 'cavalier_lance', loser: 'archer' },
  { label: 'Chevalier à la lance > Cavalier à lance', winner: 'chevalier_lance', loser: 'cavalier_lance' },
  { label: 'Chevalier à la lance > Chevalier', winner: 'chevalier_lance', loser: 'chevalier' },
  { label: 'Chevalier en armure > Archer', winner: 'chevalier_armure', loser: 'archer' },
  { label: 'Chevalier en armure > Soldat', winner: 'chevalier_armure', loser: 'soldat' },
  { label: 'Chevalier > Chevalier en armure (dégât brut)', winner: 'chevalier', loser: 'chevalier_armure' },
  { label: 'Soldat > Apprenti soldat', winner: 'soldat', loser: 'apprenti_soldat' },
  { label: 'Porte-étendard > Chevalier', winner: 'chevalier_porte_etendard', loser: 'chevalier' },
];

function counterChecks(): void {
  title('3. Contre-systèmes annoncés par le GDD §6');

  const rows = COUNTERS.map(({ label, winner, loser }) => {
    const a = UNITS[winner] as UnitDef;
    const b = UNITS[loser] as UnitDef;
    const result = simulateDuel(a, b);
    const ok = result.winner === 'a';
    return [
      ok ? 'OK' : 'ÉCHEC',
      label,
      `${n(result.seconds, 0)}s`,
      `${n(result.winnerHpRatio * 100, 0)} % PV restants`,
    ];
  });

  console.log(table(['', 'Contre attendu', 'Durée', 'Marge du vainqueur'], rows));
  console.log(
    "\nUne marge très élevée signale un contre trop brutal : l'unité contrée devient injouable.",
  );
  console.log('Fourchette visée : 30 à 70 % de PV restants.');

  // Le chevalier à la lance ne doit contrer QUE la cavalerie : contre le reste
  // du roster, ses faibles dégâts bruts doivent le pénaliser.
  const spear = UNITS['chevalier_lance'] as UnitDef;
  const cav = UNITS['cavalier_lance'] as UnitDef;
  const soldier = UNITS['soldat'] as UnitDef;
  console.log(
    `\nSpécialisation de la lance : ${damagePerHit(spear, cav)} dégâts sur un cavalier ` +
      `contre ${damagePerHit(spear, soldier)} sur un soldat.`,
  );

  // L'allonge du chevalier à la lance : ce qu'elle rapporte réellement.
  const reachRows = ['chevalier', 'soldat', 'chevalier_armure'].map((id) => {
    const opponent = UNITS[id] as UnitDef;
    const result = simulateDuel(spear, opponent);
    return [
      opponent.nameFr,
      n(opponent.combat?.range ?? 0, 1),
      result.firstStriker === 'a' ? 'la lance' : opponent.nameFr,
      `${n(result.openingAdvantage, 2)}s`,
    ];
  });

  title("3b. Ce que rapporte l'allonge de la lance (portée 1.4)");
  console.log(table(['Face à', 'Sa portée', 'Frappe en premier', 'Avance'], reachRows));
  console.log(
    "\nL'allonge offre un coup gratuit par engagement, rien de plus : une unité de mêlée",
  );
  console.log(
    "ne recule pas pour maintenir sa distance. Ce qui bat le chevalier, c'est le bonus",
  );
  console.log('anti-cavalerie ; sans lui, la lance perd malgré le premier coup (test dédié).');
}

// ───────────────────────────────────────────────────────────────────────────
// 4. Économie
// ───────────────────────────────────────────────────────────────────────────

function economyReport(): void {
  title('4. Collecteurs et rendements (ressources/seconde)');

  const rows = ECONOMIC.map((u) => [
    u.nameFr,
    String(u.age),
    formatCost(u.cost),
    `${u.trainTime}s`,
    ...RESOURCE_IDS.map((r) => n(u.gather?.[r] ?? 0, 2)),
  ]);

  console.log(
    table(['Unité', 'Âge', 'Coût', 'Prod.', 'Nourr.', 'Bois', 'Or', 'Pierre'], rows),
  );

  title('4b. Rentabilité');

  const paysan = UNITS['paysan'] as UnitDef;
  const selfRows = RESOURCE_IDS.map((r) => [
    `Paysan sur ${r}`,
    `${n(selfPaybackTime(paysan, r), 0)}s`,
  ]);

  const specialists: Array<[string, ResourceId]> = [
    ['fermier', 'food'],
    ['bucheron', 'wood'],
    ['mineur', 'gold'],
    ['mineur', 'stone'],
  ];

  const specialistRows = specialists.map(([id, resource]) => {
    const unit = UNITS[id] as UnitDef;
    return [
      `${unit.nameFr} vs paysan sur ${resource}`,
      `${n(specialistPayback(unit, resource), 0)}s`,
    ];
  });

  console.log(table(['Scénario', 'Amortissement'], [...selfRows, ...specialistRows]));
  console.log(
    "\nAmortissement d'un spécialiste = temps au bout duquel son surcoût est remboursé par son surplus de rendement.",
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. Rythme de partie
// ───────────────────────────────────────────────────────────────────────────

function paceReport(): void {
  title('5. Rythme estimé de la partie');

  // Économie de début de partie typique : 8 paysans, majoritairement sur la
  // nourriture puisque c'est ce qui débloque l'âge 2.
  const earlyGame = income([
    { unitId: 'paysan', resource: 'food', count: 5 },
    { unitId: 'paysan', resource: 'wood', count: 3 },
  ]);

  // Économie de milieu de partie : 24 collecteurs, spécialistes inclus.
  const midGame = income([
    { unitId: 'fermier', resource: 'food', count: 8 },
    { unitId: 'bucheron', resource: 'wood', count: 8 },
    { unitId: 'mineur', resource: 'gold', count: 5 },
    { unitId: 'mineur', resource: 'stone', count: 3 },
  ]);

  const rows = [
    [
      'Âge 2 — 8 paysans',
      formatCost(AGES[2].advanceCost ?? {}),
      `${AGES[2].advanceTime}s`,
      `${n(timeToAdvance(2, earlyGame) / 60, 1)} min`,
    ],
    [
      'Âge 3 — 24 collecteurs',
      formatCost(AGES[3].advanceCost ?? {}),
      `${AGES[3].advanceTime}s`,
      `${n(timeToAdvance(3, midGame) / 60, 1)} min`,
    ],
  ];

  console.log(table(['Palier', 'Coût', 'Recherche', 'Délai cumulé'], rows));
  console.log(
    '\nModèle optimiste : revenu constant et aucune dépense concurrente. En partie réelle, compter 1,5 à 2 fois plus.',
  );

  const soldier = UNITS['soldat'] as UnitDef;
  const townCenter = BUILDINGS['centre_ville'] as BuildingDef;
  const armyCost = costValue(soldier.cost) * 10;
  const timeToRaze = townCenter.hp / (dps(soldier, asTarget(townCenter)) * 10);

  console.log(
    `\n10 soldats coûtent ${n(armyCost, 0)} de valeur et mettent ${n(timeToRaze, 0)}s ` +
      `à détruire un centre-ville (${townCenter.hp} PV, armure ${townCenter.armor}).`,
  );
  console.log(
    "Une durée longue est voulue : elle laisse le temps de réagir à une attaque et interdit le rush éclair.",
  );

  title('6. Constantes de partie');
  console.log(
    table(
      ['Paramètre', 'Valeur'],
      [
        ['Population maximale', String(POP_CAP)],
        ['Ressources de départ', formatCost(STARTING_RESOURCES)],
        ['Pop. fournie par le centre-ville', String(BUILDINGS['centre_ville']?.popProvided ?? 0)],
        ['Pop. fournie par une maison', String(BUILDINGS['maison']?.popProvided ?? 0)],
      ],
    ),
  );
}

militaryRoster();
duelMatrix();
counterChecks();
economyReport();
paceReport();
console.log('');
