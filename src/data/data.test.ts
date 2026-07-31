/**
 * Intégrité des tables de données.
 *
 * Ces tests ne jugent pas l'équilibrage (c'est le rôle de balance.test.ts) :
 * ils vérifient que les tables sont cohérentes entre elles et fidèles au GDD.
 * Une faute de frappe dans un identifiant de bâtiment, ou une unité rendue
 * disponible avant le bâtiment qui la produit, se voit ici et pas trois
 * heures plus tard dans le jeu.
 */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AGES, AGE_IDS } from './ages.ts';
import { BUILDINGS } from './buildings.ts';
import { RESOURCES, RESOURCE_IDS } from './resources.ts';
import { UNITS } from './units.ts';
import type { GddRank, UnitDef } from './types.ts';

const allUnits = Object.values(UNITS);
const allBuildings = Object.values(BUILDINGS);

describe('cohérence des identifiants', () => {
  it('la clé de chaque table correspond au champ id', () => {
    for (const [key, unit] of Object.entries(UNITS)) strictEqual(unit.id, key);
    for (const [key, building] of Object.entries(BUILDINGS)) strictEqual(building.id, key);
    for (const [key, resource] of Object.entries(RESOURCES)) strictEqual(resource.id, key);
  });

  it('chaque unité est produite par un bâtiment existant qui la liste', () => {
    for (const unit of allUnits) {
      const producer = BUILDINGS[unit.trainedAt];
      ok(producer, `${unit.id} est produit par un bâtiment inconnu : ${unit.trainedAt}`);
      ok(
        producer.trains?.includes(unit.id),
        `${producer.id} ne liste pas ${unit.id} dans ses productions`,
      );
    }
  });

  it('chaque production listée par un bâtiment existe', () => {
    for (const building of allBuildings) {
      for (const unitId of building.trains ?? []) {
        const unit = UNITS[unitId];
        ok(unit, `${building.id} produit une unité inconnue : ${unitId}`);
        strictEqual(
          unit.trainedAt,
          building.id,
          `${unitId} est listé par ${building.id} mais déclare être produit ailleurs`,
        );
      }
    }
  });

  it('aucune unité ne précède le bâtiment qui la produit', () => {
    for (const unit of allUnits) {
      const producer = BUILDINGS[unit.trainedAt] as (typeof allBuildings)[number];
      ok(
        unit.age >= producer.age,
        `${unit.id} (âge ${unit.age}) sort d'un bâtiment d'âge ${producer.age}`,
      );
    }
  });

  it('les dépôts couvrent les quatre ressources', () => {
    const covered = new Set(allBuildings.flatMap((b) => b.dropOff ?? []));
    for (const resource of RESOURCE_IDS) {
      ok(covered.has(resource), `aucun bâtiment n'accepte le dépôt de ${resource}`);
    }
  });
});

describe('valeurs plausibles', () => {
  it('les unités ont des coûts, des temps et des stats positifs', () => {
    for (const unit of allUnits) {
      ok(unit.hp > 0, `${unit.id} : PV nuls`);
      ok(unit.speed > 0, `${unit.id} : vitesse nulle`);
      ok(unit.armor >= 0, `${unit.id} : armure négative`);
      ok(unit.popCost >= 1, `${unit.id} : coût en population invalide`);
      ok(unit.trainTime > 0, `${unit.id} : temps de production nul`);
      ok(
        Object.values(unit.cost).some((amount) => (amount ?? 0) > 0),
        `${unit.id} : unité gratuite`,
      );
      if (unit.combat) {
        ok(unit.combat.attack > 0, `${unit.id} : attaque nulle`);
        ok(unit.combat.attackCooldown > 0, `${unit.id} : cadence de tir nulle`);
        ok(unit.combat.range > 0, `${unit.id} : portée nulle`);
      }
    }
  });

  it('les bâtiments ont des coûts, des PV et une emprise valides', () => {
    for (const building of allBuildings) {
      ok(building.hp > 0, `${building.id} : PV nuls`);
      ok(building.buildTime > 0, `${building.id} : construction instantanée`);
      ok(building.footprint.w > 0 && building.footprint.h > 0, `${building.id} : emprise nulle`);
      ok(
        Object.values(building.cost).some((amount) => (amount ?? 0) > 0),
        `${building.id} : bâtiment gratuit`,
      );
    }
  });

  it('les taux de récolte sont renseignés pour les quatre ressources', () => {
    for (const unit of allUnits) {
      if (!unit.gather) continue;
      deepStrictEqual(
        Object.keys(unit.gather).sort(),
        [...RESOURCE_IDS].sort(),
        `${unit.id} : taux de récolte incomplets`,
      );
    }
  });

  it('la progression des âges coûte de plus en plus cher', () => {
    const costs = AGE_IDS.map((id) => AGES[id].advanceCost);
    strictEqual(costs[0], undefined, "l'âge 1 ne doit rien coûter");

    const age2 = AGES[2];
    const age3 = AGES[3];
    ok((age3.advanceCost?.food ?? 0) > (age2.advanceCost?.food ?? 0));
    ok((age3.advanceTime ?? 0) > (age2.advanceTime ?? 0));
  });
});

/**
 * Fidélité au GDD : les stats réelles doivent respecter l'ordre relatif des
 * notes 1-10 du document. Si le GDD classe A strictement au-dessus de B sur
 * une stat, la valeur de jeu doit suivre — sinon le document et le code
 * racontent deux histoires différentes.
 */
describe('fidélité aux notes du GDD §6', () => {
  const axes: Array<{ rank: keyof GddRank; label: string; value: (u: UnitDef) => number }> = [
    { rank: 'hp', label: 'vie', value: (u) => u.hp },
    { rank: 'armor', label: 'armure', value: (u) => u.armor },
    { rank: 'speed', label: 'vitesse', value: (u) => u.speed },
    { rank: 'damage', label: 'dégât', value: (u) => u.combat?.attack ?? 0 },
  ];

  for (const axis of axes) {
    it(`l'ordre des notes de ${axis.label} est respecté`, () => {
      for (const a of allUnits) {
        for (const b of allUnits) {
          if (a.gddRank[axis.rank] <= b.gddRank[axis.rank]) continue;
          ok(
            axis.value(a) > axis.value(b),
            `${a.nameFr} est noté ${a.gddRank[axis.rank]} en ${axis.label} et ${b.nameFr} ` +
              `${b.gddRank[axis.rank]}, mais leurs valeurs de jeu sont ` +
              `${axis.value(a)} et ${axis.value(b)}`,
          );
        }
      }
    });
  }

  it('seuls les paysans et leurs variantes récoltent', () => {
    for (const unit of allUnits) {
      const gathers = Object.values(unit.gather ?? {}).some((rate) => rate > 0);
      strictEqual(
        gathers,
        unit.role === 'economic',
        `${unit.id} : rôle ${unit.role} incohérent avec sa capacité de récolte`,
      );
    }
  });

  it('le porte-étendard est unique et le seul à porter une aura', () => {
    const withAura = allUnits.filter((u) => u.aura);
    strictEqual(withAura.length, 1);
    strictEqual(withAura[0]?.id, 'chevalier_porte_etendard');
    strictEqual(withAura[0]?.maxCount, 1);
  });
});
