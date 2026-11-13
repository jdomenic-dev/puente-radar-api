/**
 * YouTube live cameras of the bridges, for fresh databases (the migration attaches the same
 * streams to bridges that already exist). All are published by the Fideicomiso de Puentes
 * Fronterizos de Chihuahua (@fpfch) and were verified live and embeddable on 2026-11-12.
 *
 * Stream ids can change when the owner restarts an encoder: fix them with PATCH /cameras/:id.
 */
export interface SeedCamera {
  bridgeSlug: string;
  videoId: string;
  label: string;
  description: string;
  sortOrder: number;
}

export const SEED_CAMERAS: SeedCamera[] = [
  {
    bridgeSlug: 'puente-libre',
    videoId: 'mp3RS0y77tY',
    label: 'Norte',
    description: 'Mirando hacia EE. UU.',
    sortOrder: 0,
  },
  {
    bridgeSlug: 'puente-libre',
    videoId: 'CZM5TpXLzE8',
    label: 'Sur',
    description: 'Mirando hacia México',
    sortOrder: 1,
  },
  {
    bridgeSlug: 'puente-libre',
    videoId: 'Y3OESQEXBlI',
    label: 'Av. Rafael Pérez Serna',
    description: 'Avenida de acceso',
    sortOrder: 2,
  },
  {
    bridgeSlug: 'puente-santa-fe',
    videoId: '0Pg3S6s76IE',
    label: 'Norte',
    description: 'Mirando hacia EE. UU.',
    sortOrder: 0,
  },
  {
    bridgeSlug: 'puente-santa-fe',
    videoId: 'IcvugJWPXz8',
    label: 'Sur',
    description: 'Mirando hacia México',
    sortOrder: 1,
  },
  {
    bridgeSlug: 'puente-zaragoza',
    videoId: 'KX-bm-Lhy3w',
    label: 'Norte',
    description: 'Mirando hacia EE. UU.',
    sortOrder: 0,
  },
  {
    bridgeSlug: 'puente-zaragoza',
    videoId: 'GC5RY3zipa4',
    label: 'Sur',
    description: 'Mirando hacia México',
    sortOrder: 1,
  },
  {
    bridgeSlug: 'puente-zaragoza',
    videoId: 'o5h9RB7qwY8',
    label: 'Av. Waterfill',
    description: 'Vista sur por la avenida',
    sortOrder: 2,
  },
  {
    bridgeSlug: 'puente-stanton-lerdo',
    videoId: 'CYhISA_wFQ8',
    label: 'Norte a Sur',
    description: 'Línea Exprés, vista de norte a sur',
    sortOrder: 0,
  },
  {
    bridgeSlug: 'puente-stanton-lerdo',
    videoId: 'sOHFG6_3zAs',
    label: 'Sur a Norte',
    description: 'Línea Exprés, vista de sur a norte',
    sortOrder: 1,
  },
  {
    bridgeSlug: 'puente-stanton-lerdo',
    videoId: 'RVXhhbkBGbI',
    label: 'Malecón',
    description: 'Línea Exprés, vista a Malecón',
    sortOrder: 2,
  },
];
