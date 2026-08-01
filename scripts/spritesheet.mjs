/**
 * Planche de référence de l'art du jeu.
 *
 *   npm run sprites [fichier.png] [agrandissement]
 *
 * L'agrandissement sert au travail graphique : à 1 pixel pour 1 les sprites
 * sont trop petits pour juger un détail, à 4 ou 5 on voit chaque pixel.
 *
 * Fabrique une image unique montrant chaque sprite du jeu, section par
 * section. C'est le document de contrôle de la direction artistique : tout se
 * regarde d'un coup d'œil, et une incohérence de style, de palette ou
 * d'échelle saute aux yeux bien mieux qu'en jouant.
 *
 * L'encodage PNG est fait à la main (zlib est dans Node) : aucune dépendance
 * n'est ajoutée au projet pour un outil qui ne sert qu'ici.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

import { catalogue } from '../src/art/index.ts';
import { PALETTE } from '../src/art/palette.ts';

const output = process.argv[2] ?? 'docs/sprites.png';
const SCALE = Math.max(1, Math.min(8, Number(process.argv[3]) || 1));

/** Taille de cellule par section : les bâtiments ont besoin de place. */
const CELL_BY_SECTION = {
  'Bâtiments': { cell: 148 * SCALE, columns: 5 },
  Chantiers: { cell: 148 * SCALE, columns: 5 },
  Murailles: { cell: 52 * SCALE, columns: 8 },
};
// 76 pixels : c'est la plus haute unité (le porte-étendard, 48 de haut, ancré
// à 43) qui fixe la taille de cellule. À 68, elle débordait sur la rangée du
// dessus.
const DEFAULT_CELL = { cell: 76 * SCALE, columns: 10 };
const HEADER = 16;
const MARGIN = 12;

const sections = [];
for (const entry of catalogue()) {
  let section = sections.find((s) => s.name === entry.section);
  if (!section) {
    section = { name: entry.section, entries: [] };
    sections.push(section);
  }
  section.entries.push(entry);
}

// Hauteur totale : chaque section a son bandeau puis ses lignes de cellules.
let height = MARGIN;
let width = 0;
for (const section of sections) {
  const layout = CELL_BY_SECTION[section.name] ?? DEFAULT_CELL;
  section.cell = layout.cell;
  section.columns = layout.columns;
  section.top = height;
  section.rows = Math.ceil(section.entries.length / section.columns);
  height += HEADER + section.rows * section.cell + 8;
  width = Math.max(width, MARGIN * 2 + section.columns * section.cell);
}
height += MARGIN;
const pixels = new Uint8Array(width * height * 4);

function set(x, y, color, alpha = 255) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = (y * width + x) * 4;
  const a = alpha / 255;
  pixels[i] = Math.round(((color >> 16) & 0xff) * a + (pixels[i] ?? 0) * (1 - a));
  pixels[i + 1] = Math.round(((color >> 8) & 0xff) * a + (pixels[i + 1] ?? 0) * (1 - a));
  pixels[i + 2] = Math.round((color & 0xff) * a + (pixels[i + 2] ?? 0) * (1 - a));
  pixels[i + 3] = 255;
}

function fill(x, y, w, h, color) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) set(x + dx, y + dy, color);
}

// Fond sombre, pour juger les contours comme dans le jeu.
fill(0, 0, width, height, 0x2f2a24);

for (const section of sections) {
  // Bandeau de section : une bande claire, largeur pleine.
  fill(MARGIN, section.top + 4, width - MARGIN * 2, 2, PALETTE.thatch);

  section.entries.forEach((entry, index) => {
    const CELL = section.cell;
    const column = index % section.columns;
    const row = Math.floor(index / section.columns);
    const cellX = MARGIN + column * CELL;
    const cellY = section.top + HEADER + row * CELL;

    // Damier de fond : rend visibles les pixels transparents du sprite.
    for (let dy = 0; dy < CELL - 4; dy++) {
      for (let dx = 0; dx < CELL - 4; dx++) {
        const dark = (Math.floor(dx / (8 * SCALE)) + Math.floor(dy / (8 * SCALE))) % 2 === 0;
        set(cellX + dx, cellY + dy, dark ? 0x3a332b : 0x433b31);
      }
    }

    const sprite = entry.sprite;
    // Le sprite est centré sur son point d'ancrage, posé au tiers bas de la
    // cellule : c'est ainsi qu'on le verra en jeu, debout sur le sol.
    const originX = cellX + Math.floor((CELL - 4) / 2) - sprite.anchorX * SCALE;
    const originY = cellY + Math.floor(((CELL - 4) * 2) / 3) - sprite.anchorY * SCALE;

    for (let y = 0; y < sprite.height; y++) {
      for (let x = 0; x < sprite.width; x++) {
        const i = (y * sprite.width + x) * 4;
        const alpha = sprite.data[i + 3] ?? 0;
        if (alpha === 0) continue;
        const color =
          ((sprite.data[i] ?? 0) << 16) | ((sprite.data[i + 1] ?? 0) << 8) | (sprite.data[i + 2] ?? 0);

        for (let sy = 0; sy < SCALE; sy++) {
          for (let sx = 0; sx < SCALE; sx++) {
            set(originX + x * SCALE + sx, originY + y * SCALE + sy, color, alpha);
          }
        }
      }
    }
  });
}

/** Encodeur PNG minimal : en-tête, données compressées, fin. */
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filtre « aucun »
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }

  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 6; // RVB + alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

writeFileSync(output, encodePng(width, height, pixels));
console.log(
  `${catalogue().length} sprites, ${sections.length} sections → ${output} (${width} × ${height})`,
);
