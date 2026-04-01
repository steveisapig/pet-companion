export type PlaceId = 'park' | 'beach' | 'forest' | 'city' | 'garden';

export interface SpotDef {
  /** Position as 0–1 of container width */
  x: number;
  /** Position as 0–1 of container height */
  y: number;
  label: string;
  emoji: string;
}

export interface PlaceDef {
  id: PlaceId;
  name: string;
  emoji: string;
  colors: [string, string, string];
  /** Base find chance 0–1 before level bonus */
  baseFindChance: number;
  /** Spots the pet can visit within the location */
  spots: SpotDef[];
  /** Scenery elements: emoji and position (x, y as 0–1) */
  scenery: { emoji: string; x: number; y: number; size?: number }[];
}

export const PLACE_DEFS: Record<PlaceId, PlaceDef> = {
  park: {
    id: 'park',
    name: 'Park',
    emoji: '🌳',
    colors: ['#B8E6B8', '#8FD98F', '#6BCB6B'],
    baseFindChance: 0.15,
    spots: [
      { x: 0.2, y: 0.5, label: 'Bench', emoji: '🪑' },
      { x: 0.5, y: 0.35, label: 'Pond', emoji: '💧' },
      { x: 0.8, y: 0.55, label: 'Tree', emoji: '🌳' },
      { x: 0.35, y: 0.7, label: 'Flower bed', emoji: '🌸' },
    ],
    scenery: [
      { emoji: '🌳', x: 0.1, y: 0.15, size: 36 },
      { emoji: '🌲', x: 0.85, y: 0.2, size: 40 },
      { emoji: '🌿', x: 0.3, y: 0.85, size: 28 },
      { emoji: '🌿', x: 0.7, y: 0.9, size: 24 },
    ],
  },
  beach: {
    id: 'beach',
    name: 'Beach',
    emoji: '🏖️',
    colors: ['#87CEEB', '#B0E0E6', '#F4E4BC'],
    baseFindChance: 0.12,
    spots: [
      { x: 0.25, y: 0.6, label: 'Tide pool', emoji: '🦀' },
      { x: 0.5, y: 0.5, label: 'Shore', emoji: '🌊' },
      { x: 0.75, y: 0.55, label: 'Sand castle', emoji: '🏰' },
      { x: 0.4, y: 0.75, label: 'Umbrella', emoji: '⛱️' },
    ],
    scenery: [
      { emoji: '🌊', x: 0.5, y: 0.25, size: 48 },
      { emoji: '☀️', x: 0.8, y: 0.1, size: 32 },
      { emoji: '🐚', x: 0.15, y: 0.7, size: 24 },
      { emoji: '🪨', x: 0.9, y: 0.65, size: 20 },
    ],
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    emoji: '🌲',
    colors: ['#90A955', '#7CB342', '#558B2F'],
    baseFindChance: 0.18,
    spots: [
      { x: 0.2, y: 0.45, label: 'Mushroom patch', emoji: '🍄' },
      { x: 0.55, y: 0.5, label: 'Oak tree', emoji: '🌳' },
      { x: 0.8, y: 0.4, label: 'Stream', emoji: '💧' },
      { x: 0.4, y: 0.7, label: 'Log', emoji: '🪵' },
    ],
    scenery: [
      { emoji: '🌲', x: 0.05, y: 0.1, size: 44 },
      { emoji: '🌲', x: 0.9, y: 0.15, size: 38 },
      { emoji: '🍂', x: 0.2, y: 0.85, size: 22 },
      { emoji: '🦉', x: 0.75, y: 0.2, size: 28 },
    ],
  },
  city: {
    id: 'city',
    name: 'City',
    emoji: '🏙️',
    colors: ['#B0BEC5', '#90A4AE', '#78909C'],
    baseFindChance: 0.1,
    spots: [
      { x: 0.2, y: 0.5, label: 'Café patio', emoji: '☕' },
      { x: 0.5, y: 0.45, label: 'Fountain', emoji: '⛲' },
      { x: 0.75, y: 0.5, label: 'Pet shop', emoji: '🏪' },
      { x: 0.4, y: 0.7, label: 'Park bench', emoji: '🪑' },
    ],
    scenery: [
      { emoji: '🏢', x: 0.1, y: 0.2, size: 36 },
      { emoji: '🏬', x: 0.85, y: 0.25, size: 40 },
      { emoji: '🚶', x: 0.3, y: 0.85, size: 24 },
      { emoji: '🌆', x: 0.6, y: 0.08, size: 32 },
    ],
  },
  garden: {
    id: 'garden',
    name: 'Garden',
    emoji: '🌷',
    colors: ['#C8E6C9', '#A5D6A7', '#81C784'],
    baseFindChance: 0.2,
    spots: [
      { x: 0.25, y: 0.4, label: 'Rose bush', emoji: '🌹' },
      { x: 0.5, y: 0.55, label: 'Bird bath', emoji: '🦜' },
      { x: 0.75, y: 0.45, label: 'Vegetable patch', emoji: '🥕' },
      { x: 0.4, y: 0.75, label: 'Sunflowers', emoji: '🌻' },
    ],
    scenery: [
      { emoji: '🌷', x: 0.15, y: 0.2, size: 32 },
      { emoji: '🌸', x: 0.85, y: 0.25, size: 28 },
      { emoji: '🦋', x: 0.5, y: 0.15, size: 24 },
      { emoji: '🌿', x: 0.7, y: 0.88, size: 26 },
    ],
  },
};

export function getPlaceNameKey(placeId: PlaceId): `walk.places.${PlaceId}` {
  return `walk.places.${placeId}`;
}
