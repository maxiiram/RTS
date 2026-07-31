/**
 * Verrous d'équilibrage.
 *
 * Chaque test correspond à une promesse faite au joueur dans le GDD. Retoucher
 * un chiffre casse ici tout ce qu'il déséquilibre ailleurs — c'est le filet
 * qui permet d'itérer sur l'équilibrage sans tout relire à chaque fois.
 */

import { ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MIN_DAMAGE } from '../data/constants.ts';
import { UNITS } from '../data/units.ts';
import { BUILDINGS } from '../data/buildings.ts';
import type { ResourceId, UnitDef } from '../data/types.ts';
import { asTarget, costValue, damagePerHit, dps, effectiveHp, simulateDuel } from './combat.ts';
import { gatherRate, income, specialistPayback, timeToAdvance } from './economy.ts';

const unit = (id: string): UnitDef => {
  const found = UNITS[id];
  if (!found) throw new Error(`Unité inconnue dans les tests : ${id}`);
  return found;
};

describe('modèle de dégâts', () => {
  it('applique le plancher de dégâts face à une armure écrasante', () => {
    // Un paysan (3 d'attaque) contre un chevalier en armure (5 d'armure) :
    // sans plancher, il ne pourrait littéralement rien lui faire.
    strictEqual(damagePerHit(unit('paysan'), unit('chevalier_armure')), MIN_DAMAGE);
  });

  it('ajoute le bonus de charge au premier coup seulement', () => {
    const cavalier = unit('cavalier_lance');
    const archer = unit('archer');
    const normal = damagePerHit(cavalier, archer);
    const charged = damagePerHit(cavalier, archer, { charged: true });
    strictEqual(charged - normal, cavalier.combat?.charge?.bonus);
  });

  it('réserve le bonus de la lance à la cavalerie', () => {
    const lance = unit('chevalier_lance');
    const versusCavalry = damagePerHit(lance, unit('cavalier_lance'));
    const versusInfantry = damagePerHit(lance, unit('soldat'));
    ok(
      versusCavalry >= 2 * versusInfantry,
      `la lance inflige ${versusCavalry} à la cavalerie contre ${versusInfantry} à l'infanterie : ` +
        'le contre est trop peu marqué pour être lisible',
    );
  });

  it('traite les bâtiments comme des cibles ordinaires', () => {
    const soldat = unit('soldat');
    const centreVille = BUILDINGS['centre_ville'];
    ok(centreVille);
    strictEqual(
      damagePerHit(soldat, asTarget(centreVille)),
      (soldat.combat?.attack ?? 0) - centreVille.armor,
    );
  });
});

describe('déterminisme', () => {
  it('deux simulations identiques donnent exactement le même résultat', () => {
    // Prérequis absolu du multijoueur en lockstep (GDD §9) : la simulation
    // ne doit dépendre de rien d'autre que de ses entrées.
    const first = simulateDuel(unit('chevalier'), unit('archer'));
    const second = simulateDuel(unit('chevalier'), unit('archer'));
    strictEqual(JSON.stringify(first), JSON.stringify(second));
  });
});

/** Contres annoncés par le GDD §6, avec la marge de victoire attendue. */
const COUNTERS: Array<{
  winner: string;
  loser: string;
  /** Un contre « dur » écrase volontairement sa cible (tank contre archer). */
  hardCounter?: boolean;
}> = [
  { winner: 'cavalier_lance', loser: 'archer' },
  { winner: 'chevalier_lance', loser: 'cavalier_lance' },
  { winner: 'chevalier_armure', loser: 'archer', hardCounter: true },
  { winner: 'chevalier_armure', loser: 'soldat' },
  { winner: 'chevalier', loser: 'chevalier_armure' },
  { winner: 'soldat', loser: 'apprenti_soldat' },
  { winner: 'chevalier_porte_etendard', loser: 'chevalier' },
];

describe('contre-systèmes (GDD §6)', () => {
  for (const { winner, loser, hardCounter } of COUNTERS) {
    it(`${unit(winner).nameFr} bat ${unit(loser).nameFr}`, () => {
      const result = simulateDuel(unit(winner), unit(loser));
      strictEqual(result.winner, 'a', `${winner} ne bat pas ${loser}`);

      if (!hardCounter) {
        ok(
          result.winnerHpRatio <= 0.75,
          `${winner} bat ${loser} en gardant ${Math.round(result.winnerHpRatio * 100)} % de ses PV : ` +
            "le contre est si écrasant que l'unité contrée devient injouable",
        );
      }
    });
  }

  it("l'archer perd au corps-à-corps mais gagne du temps à distance", () => {
    // Le GDD veut un archer fort à distance et fragile une fois engagé. On le
    // vérifie en comparant un duel à distance normale et un duel démarré au
    // contact : l'écart de durée mesure exactement ce que la portée apporte.
    const archer = unit('archer');
    const soldat = unit('soldat');
    const fromRange = simulateDuel(archer, soldat, { startDistance: 8 });
    const fromContact = simulateDuel(archer, soldat, { startDistance: 0.5 });

    strictEqual(fromRange.winner, 'b');
    strictEqual(fromContact.winner, 'b');
    ok(
      fromRange.winnerHpRatio < fromContact.winnerHpRatio,
      "la portée de l'archer ne lui rapporte rien : il meurt aussi vite de loin que de près",
    );
  });

  it('aucune unité militaire ne reste sans utilité face à ses contemporaines', () => {
    // Une unité qui perd tous ses duels contre ce qui est disponible au même
    // moment n'a aucune raison d'être produite. Le duel 1v1 ne dit rien de la
    // valeur en groupe, mais il détecte les unités mortes-nées.
    const military = Object.values(UNITS).filter((u) => u.role === 'military');

    for (const attacker of military) {
      const contemporaries = military.filter(
        (other) => other.id !== attacker.id && other.age <= attacker.age,
      );
      // L'apprenti soldat est seul à l'âge 1 : rien à quoi le comparer.
      if (contemporaries.length === 0) continue;

      const wins = contemporaries.filter(
        (defender) => simulateDuel(attacker, defender).winner === 'a',
      );
      ok(
        wins.length > 0,
        `${attacker.nameFr} perd tous ses duels contre les unités de son âge ou d'avant`,
      );
    }
  });
});

describe('économie', () => {
  /**
   * Domaine de chaque collecteur spécialisé. Le mineur en couvre deux (or et
   * pierre), ce qui justifie son surcoût par rapport aux deux autres.
   */
  const specialists: Array<{ id: string; specialities: ResourceId[] }> = [
    { id: 'fermier', specialities: ['food'] },
    { id: 'bucheron', specialities: ['wood'] },
    { id: 'mineur', specialities: ['gold', 'stone'] },
  ];

  it('chaque spécialiste bat nettement le paysan sur sa ressource', () => {
    const paysan = unit('paysan');
    for (const { id, specialities } of specialists) {
      const specialist = unit(id);
      for (const resource of specialities) {
        ok(
          gatherRate(specialist, resource) >= gatherRate(paysan, resource) * 1.5,
          `${id} n'est pas assez supérieur au paysan sur ${resource}`,
        );
      }
    }
  });

  it('chaque spécialiste est mauvais partout ailleurs', () => {
    const paysan = unit('paysan');
    for (const { id, specialities } of specialists) {
      const specialist = unit(id);
      const others = (['food', 'wood', 'gold', 'stone'] as ResourceId[]).filter(
        (r) => !specialities.includes(r),
      );
      for (const resource of others) {
        ok(
          gatherRate(specialist, resource) < gatherRate(paysan, resource),
          `${id} récolte ${resource} aussi bien qu'un paysan : sa spécialisation ne coûte rien`,
        );
      }
    }
  });

  it('la spécialisation se rembourse entre 1 et 5 minutes', () => {
    // En dessous d'une minute, spécialiser serait un réflexe automatique et le
    // choix économique du GDD §6 disparaîtrait. Au-delà de cinq, personne ne
    // le ferait jamais.
    for (const { id, specialities } of specialists) {
      for (const resource of specialities) {
        const payback = specialistPayback(unit(id), resource);
        ok(
          payback >= 60 && payback <= 300,
          `${id} sur ${resource} s'amortit en ${Math.round(payback)}s, hors de la fourchette visée`,
        );
      }
    }
  });

  it('le rythme des âges reste lent', () => {
    // GDD §4 : phase économique longue avant les premiers affrontements.
    const earlyGame = income([
      { unitId: 'paysan', resource: 'food', count: 5 },
      { unitId: 'paysan', resource: 'wood', count: 3 },
    ]);
    const midGame = income([
      { unitId: 'fermier', resource: 'food', count: 8 },
      { unitId: 'bucheron', resource: 'wood', count: 8 },
      { unitId: 'mineur', resource: 'gold', count: 5 },
      { unitId: 'mineur', resource: 'stone', count: 3 },
    ]);

    const toAge2 = timeToAdvance(2, earlyGame);
    const toAge3 = timeToAdvance(3, midGame);

    ok(toAge2 >= 240, `âge 2 atteignable en ${Math.round(toAge2)}s : trop rapide pour un RTS lent`);
    ok(toAge2 <= 480, `âge 2 en ${Math.round(toAge2)}s : la partie s'enlise`);
    ok(toAge3 >= 180, `âge 3 en ${Math.round(toAge3)}s après l'âge 2 : trop rapide`);
    ok(toAge3 <= 600, `âge 3 en ${Math.round(toAge3)}s après l'âge 2 : la partie s'enlise`);
  });
});

describe('coûts et rentabilité militaire', () => {
  it('à classe et âge égaux, la plus chère est la plus puissante', () => {
    // Comparaison volontairement restreinte : entre classes, le prix paie
    // aussi la mobilité et la portée, que ce calcul de puissance brute ignore
    // (un cavalier coûte plus cher qu'un soldat tout en frappant moins fort —
    // c'est normal, il choisit ses combats). Au sein d'une même classe et d'un
    // même âge, en revanche, payer plus doit donner plus.
    const groups = new Map<string, UnitDef[]>();
    for (const u of Object.values(UNITS)) {
      if (u.role !== 'military') continue;
      const key = `${u.age}-${u.class}`;
      groups.set(key, [...(groups.get(key) ?? []), u]);
    }

    const dummy = { armor: 0, class: 'infantry' as const, hp: 100 };

    for (const units of groups.values()) {
      for (const a of units) {
        for (const b of units) {
          if (costValue(a.cost) <= costValue(b.cost)) continue;
          // Puissance = ce qu'elle inflige × ce qu'elle encaisse réellement,
          // armure comprise : c'est ce qui rend le tank comparable au reste.
          const powerA = dps(a, dummy) * effectiveHp(a, 10);
          const powerB = dps(b, dummy) * effectiveHp(b, 10);
          ok(
            powerA > powerB,
            `${a.nameFr} coûte plus cher que ${b.nameFr} sans être plus puissant ` +
              `(${powerA.toFixed(0)} contre ${powerB.toFixed(0)})`,
          );
        }
      }
    }
  });

  it('détruire un centre-ville demande une vraie armée', () => {
    // Rythme lent (GDD §4) : pas de rush éclair. Dix soldats doivent y passer
    // un temps qui laisse au défenseur le loisir de réagir.
    const soldat = unit('soldat');
    const centreVille = BUILDINGS['centre_ville'];
    ok(centreVille);

    const seconds = centreVille.hp / (dps(soldat, asTarget(centreVille)) * 10);
    ok(seconds >= 45, `10 soldats rasent un centre-ville en ${Math.round(seconds)}s : trop rapide`);
  });
});
