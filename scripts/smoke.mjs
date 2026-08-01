/**
 * Test de bout en bout du jeu dans un vrai navigateur.
 *
 * Lance la page, pilote la souris comme le ferait un joueur et vérifie que la
 * boucle complète répond : sélection, récolte, production, combat. Les tests
 * de `src/` couvrent la simulation ; celui-ci couvre ce qu'aucun test
 * headless ne peut voir — le rendu, les entrées et le HUD.
 *
 * Prérequis : `npm run dev` doit tourner.
 *   node scripts/smoke.mjs [url] [dossier-captures]
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.argv[3] ?? null;

const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const failures = [];
function check(label, condition, detail = '') {
  const status = condition ? '  ok  ' : ' ÉCHEC';
  console.log(`${status}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures.push(label);
}

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });

const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

if (shots) await mkdir(shots, { recursive: true });
const shot = async (name) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

/**
 * Position à l'écran d'une entité, en pixels.
 *
 * Cliquer à des coordonnées écrites en dur rendait ce test dépendant de la
 * carte : le moindre changement de génération le faisait échouer sans qu'aucun
 * bug n'ait été introduit. On demande donc au jeu où se trouve la cible.
 */
const screenPositionOf = (kind) =>
  page.evaluate(async (wanted) => {
    const { world, renderer } = window.rts;
    const { tileToScreen } = await import('/src/sim/grid.ts');

    const villager = [...world.entities.values()].find((e) => e.kind === 'unit' && e.owner === 0);
    if (!villager) return null;

    let best = null;
    let bestDistance = Infinity;
    for (const e of world.entities.values()) {
      if (wanted === 'wood' && !(e.kind === 'resource' && e.resource === 'wood')) continue;
      if (wanted === 'townCenter' && !(e.owner === 0 && e.defId === 'centre_ville')) continue;
      if (wanted === 'villager' && !(e.kind === 'unit' && e.owner === 0 && e.defId === 'paysan')) {
        continue;
      }
      const distance = Math.hypot(e.x - villager.x, e.y - villager.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = e;
      }
    }
    if (!best) return null;

    const point = tileToScreen(best.x, best.y);
    return {
      x: renderer.world.position.x + point.x * renderer.world.scale.x,
      y: renderer.world.position.y + point.y * renderer.world.scale.y,
    };
  }, kind);

const state = () => page.evaluate(() => {
  const { world, selection } = window.rts;
  const units = (owner) =>
    [...world.entities.values()].filter((e) => e.kind === 'unit' && e.owner === owner);
  // Le décompte militaire ignore les paysans, que l'IA reproduit en continu.
  const military = (owner) =>
    units(owner).filter((e) => !['paysan', 'fermier', 'bucheron', 'mineur'].includes(e.defId));
  return {
    time: world.time,
    wood: world.players[0].resources.wood,
    food: world.players[0].resources.food,
    selection: [...selection].length,
    saphir: units(0).length,
    rubis: units(1).length,
    saphirArmee: military(0).length,
    rubisArmee: military(1).length,
    entities: world.entities.size,
  };
});

check('la page démarre sans erreur', errors.length === 0, errors[0] ?? '');
check('le monde est peuplé', (await state()).entities > 100);
await shot('01-demarrage');

// — Sélection au rectangle —
//
// Le rectangle est calculé d'après la position réelle des paysans, jamais
// écrit en dur : depuis que la carte est tirée au sort, la base n'est plus au
// même endroit d'une partie à l'autre, et des coordonnées fixes feraient
// échouer ce test pour une raison sans rapport avec la sélection.
const villagerBox = await page.evaluate(async () => {
  const { world, renderer } = window.rts;
  const { tileToScreen } = await import('/src/sim/grid.ts');

  const points = [...world.entities.values()]
    .filter((e) => e.kind === 'unit' && e.owner === 0)
    .map((e) => {
      const p = tileToScreen(e.x, e.y);
      return {
        x: renderer.world.position.x + p.x * renderer.world.scale.x,
        y: renderer.world.position.y + p.y * renderer.world.scale.y,
      };
    });

  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
});

await page.mouse.move(villagerBox.minX - 40, villagerBox.minY - 50);
await page.mouse.down();
await page.mouse.move(villagerBox.maxX + 40, villagerBox.maxY + 20, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
check('la sélection au rectangle attrape les paysans', (await state()).selection === 3);

// — Récolte —
const woodBefore = (await state()).wood;
const tree = await screenPositionOf('wood');
check('un bosquet est accessible depuis la base', tree !== null);
await page.mouse.click(tree.x, tree.y, { button: 'right' });
await page.locator('.speeds button[data-speed="8"]').click();
// Large, et il faut qu'il le soit : la carte étant tirée au sort, le bosquet
// le plus proche peut être à quatre tuiles comme à quinze, et un aller-retour
// complet — marche, coupe, retour au dépôt — prend alors une quarantaine de
// secondes de jeu. Le conteneur n'ayant pas de GPU, la vitesse ×8 n'en vaut
// qu'environ cinq.
await page.waitForTimeout(16000);
const woodAfter = (await state()).wood;
check('les paysans récoltent et déposent', woodAfter > woodBefore, `bois ${woodBefore} → ${Math.floor(woodAfter)}`);
await shot('02-recolte');

// — Production —
//
// Le centre-ville est sélectionné par le manche de débogage et non au clic :
// un paysan planté devant lui est désigné à sa place — c'est le comportement
// voulu, celui qui est devant l'emporte — et on se retrouvait alors à cliquer
// sur le menu de construction en croyant produire une unité.
await page.locator('.speeds button[data-speed="1"]').click();
await page.evaluate(() => {
  const { world, selection } = window.rts;
  const tc = [...world.entities.values()].find(
    (e) => e.owner === 0 && e.defId === 'centre_ville',
  );
  selection.clear();
  if (tc) selection.add(tc.id);
});
await page.waitForTimeout(300);
const buttons = await page.locator('#actions-panel button').count();
check('le centre-ville propose ses productions', buttons >= 4, `${buttons} boutons`);

const before = (await state()).saphir;
await page.locator('#actions-panel button', { hasText: 'Paysan' }).first().click();
await page.locator('.speeds button[data-speed="8"]').click();
// Le temps d'attente est large : sans GPU, le navigateur du conteneur ne tient
// pas la vitesse ×8 demandée — l'horloge du jeu avance environ cinq fois plus
// vite que le temps réel, pas huit. Quatre secondes ne suffisaient pas aux
// vingt secondes de formation d'un paysan.
await page.waitForTimeout(7000);
check('un paysan sort de la file de production', (await state()).saphir > before);

// — Muraille posée au glisser —
await page.locator('.speeds button[data-speed="0"]').click();
await page.evaluate(() => {
  const { world } = window.rts;
  world.players[0].age = 2;
  world.players[0].resources.stone = 500;
});
await page.waitForTimeout(200);

// Un paysan doit être sélectionné pour que le menu de construction
// apparaisse. On le sélectionne directement plutôt qu'au clic : à ce stade les
// paysans sont partis récolter et peuvent être hors de l'écran, ce qui ferait
// échouer le test pour une raison sans rapport avec les murailles.
const selected = await page.evaluate(() => {
  const { world, selection } = window.rts;
  const villager = [...world.entities.values()].find(
    (e) => e.kind === 'unit' && e.owner === 0 && e.defId === 'paysan',
  );
  if (!villager) return false;
  selection.clear();
  selection.add(villager.id);
  return true;
});
check('un paysan est disponible pour bâtir', selected);
await page.waitForTimeout(300);

const wallButton = page.locator('#actions-panel button', { hasText: 'Muraille' });
check('le menu de construction propose la muraille', (await wallButton.count()) > 0);

const wallsBefore = await page.evaluate(
  () => [...window.rts.world.entities.values()].filter((e) => e.defId === 'muraille').length,
);

const anchor = await screenPositionOf('townCenter');
await wallButton.first().click();
await page.mouse.move(anchor.x - 220, anchor.y + 60);
await page.mouse.down();
await page.mouse.move(anchor.x - 60, anchor.y + 140, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(300);

const wallsAfter = await page.evaluate(
  () => [...window.rts.world.entities.values()].filter((e) => e.defId === 'muraille').length,
);
check(
  'un glisser pose plusieurs segments de muraille',
  wallsAfter - wallsBefore >= 3,
  `${wallsAfter - wallsBefore} segment(s)`,
);
await shot('05-muraille');

// — Combat —
// Mesure à vitesse normale : à ×8, la mêlée se résout avant la capture d'état.
await page.locator('.speeds button[data-speed="0"]').click();
await page.locator('#sandbox-unit').selectOption('chevalier_lance');
await page.locator('#sandbox-count').fill('3');
await page.locator('#spawn-saphir').click();
await page.locator('#sandbox-unit').selectOption('chevalier');
await page.locator('#sandbox-count').fill('3');
await page.locator('#spawn-rubis').click();
await page.waitForTimeout(400);
await shot('03-combat-avant');

const beforeFight = await state();
check('le bac à sable fait apparaître le nombre demandé', beforeFight.saphirArmee >= 3 && beforeFight.rubisArmee >= 3,
  `${beforeFight.saphirArmee} lances contre ${beforeFight.rubisArmee} chevaliers`);

await page.locator('.speeds button[data-speed="4"]').click();
await page.waitForTimeout(8000);
const afterFight = await state();
check(
  'les deux camps s\'engagent sans intervention',
  afterFight.rubisArmee < beforeFight.rubisArmee || afterFight.saphirArmee < beforeFight.saphirArmee,
  `armées ${beforeFight.saphirArmee}v${beforeFight.rubisArmee} → ${afterFight.saphirArmee}v${afterFight.rubisArmee}`,
);
await shot('04-combat-apres');

check('aucune erreur JavaScript sur toute la session', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();

console.log(failures.length === 0 ? '\nTout est vert.' : `\n${failures.length} échec(s).`);
process.exit(failures.length === 0 ? 0 : 1);
