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
 * Position à l'écran d'une entité choisie par un prédicat, en pixels.
 *
 * Cliquer à des coordonnées écrites en dur rendait ce test dépendant de la
 * carte : le moindre changement de génération le faisait échouer sans qu'aucun
 * bug n'ait été introduit. On demande donc au jeu où se trouve la cible.
 */
const screenPositionOf = (kind) =>
  page.evaluate(async (wanted) => {
    const { world, renderer } = window.rts;
    const { tileToScreen } = await import('/src/sim/grid.ts');

    const villager = [...world.entities.values()].find(
      (e) => e.kind === 'unit' && e.owner === 0,
    );
    if (!villager) return null;

    let best = null;
    let bestDistance = Infinity;
    for (const e of world.entities.values()) {
      if (wanted === 'wood' && !(e.kind === 'resource' && e.resource === 'wood')) continue;
      if (wanted === 'townCenter' && !(e.owner === 0 && e.defId === 'centre_ville')) continue;
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
await page.mouse.move(640, 400);
await page.mouse.down();
await page.mouse.move(820, 520, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
check('la sélection au rectangle attrape les paysans', (await state()).selection === 3);

// — Récolte —
const woodBefore = (await state()).wood;
const tree = await screenPositionOf('wood');
check('un bosquet est accessible depuis la base', tree !== null);
await page.mouse.click(tree.x, tree.y, { button: 'right' });
await page.locator('.speeds button[data-speed="8"]').click();
await page.waitForTimeout(9000);
const woodAfter = (await state()).wood;
check('les paysans récoltent et déposent', woodAfter > woodBefore, `bois ${woodBefore} → ${Math.floor(woodAfter)}`);
await shot('02-recolte');

// — Production —
await page.locator('.speeds button[data-speed="1"]').click();
const townCenter = await screenPositionOf('townCenter');
await page.mouse.click(townCenter.x, townCenter.y - 20);
await page.waitForTimeout(300);
const buttons = await page.locator('#actions-panel button').count();
check('le centre-ville propose ses productions', buttons >= 4, `${buttons} boutons`);

const before = (await state()).saphir;
await page.locator('#actions-panel button').first().click();
await page.locator('.speeds button[data-speed="8"]').click();
await page.waitForTimeout(4000);
check('un paysan sort de la file de production', (await state()).saphir > before);

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
