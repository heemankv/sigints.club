const DEFAULT_ART_COUNT = 20;

export function hashToIndex(input: string, max: number = DEFAULT_ART_COUNT): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  const safe = Math.abs(hash);
  return safe % max;
}

export function getCardArtUrl(key: string, count: number = DEFAULT_ART_COUNT): string {
  const idx = hashToIndex(key, count) + 1;
  return `/generated/subscription-${idx}.svg`;
}

export const CARD_ART_COUNT = DEFAULT_ART_COUNT;
