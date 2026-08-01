/**
 * Conversion des sprites peints dans `src/art` en textures PixiJS.
 *
 * L'art est produit en RGBA classique ; le rendu attend de l'alpha
 * prémultiplié. La conversion se fait ici, une seule fois par sprite, et le
 * résultat est mis en cache : cent soldats partagent la même texture.
 */

import { BufferImageSource, Texture } from 'pixi.js';

import type { Sprite } from '../art/index.ts';

const textures = new Map<Sprite, Texture>();

export function textureFor(sprite: Sprite): Texture {
  const existing = textures.get(sprite);
  if (existing) return existing;

  const pixels = new Uint8Array(sprite.data.length);
  for (let i = 0; i < sprite.data.length; i += 4) {
    const alpha = sprite.data[i + 3] ?? 0;
    const factor = alpha / 255;
    pixels[i] = Math.round((sprite.data[i] ?? 0) * factor);
    pixels[i + 1] = Math.round((sprite.data[i + 1] ?? 0) * factor);
    pixels[i + 2] = Math.round((sprite.data[i + 2] ?? 0) * factor);
    pixels[i + 3] = alpha;
  }

  const texture = new Texture({
    source: new BufferImageSource({
      resource: pixels,
      width: sprite.width,
      height: sprite.height,
      alphaMode: 'premultiplied-alpha',
      // Pixel art : jamais d'interpolation, quel que soit le zoom.
      scaleMode: 'nearest',
    }),
  });

  textures.set(sprite, texture);
  return texture;
}
