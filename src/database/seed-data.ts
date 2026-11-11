import { BridgeStatus } from '../common/enums/bridge.enum.js';
import { CreateBridgeDto } from '../modules/bridges/dto/create-bridge.dto.js';

/**
 * The six Juárez–El Paso bridges.
 *
 * Opening hours come from the `hours` field CBP publishes for each port
 * (bwt.cbp.gov/api/waittimes, checked 2026-11-11); null/null means 24 hours.
 * Coordinates are from OpenStreetMap, at the crossing (Stanton and Santa Teresa use the
 * port-of-entry building), and are meant for directions, not surveying.
 */
export const SEED_BRIDGES: CreateBridgeDto[] = [
  {
    name: 'Puente Libre / Córdova-Américas',
    shortName: 'Puente Libre',
    slug: 'puente-libre',
    status: BridgeStatus.Low,
    cbpPortNumber: 240201,
    sortOrder: 1,
    latitude: 31.76521,
    longitude: -106.45159,
  },
  {
    name: 'Puente Santa Fe',
    shortName: 'Puente Santa Fe',
    slug: 'puente-santa-fe',
    status: BridgeStatus.Low,
    cbpPortNumber: 240202,
    sortOrder: 2,
    latitude: 31.74774,
    longitude: -106.48693,
  },
  {
    name: 'Puente Zaragoza / Ysleta',
    shortName: 'Zaragoza / Ysleta',
    slug: 'puente-zaragoza',
    status: BridgeStatus.Low,
    cbpPortNumber: 240203,
    sortOrder: 3,
    latitude: 31.67248,
    longitude: -106.33601,
  },
  {
    name: 'Puente Guadalupe-Tornillo',
    shortName: 'Guadalupe-Tornillo',
    slug: 'puente-guadalupe-tornillo',
    status: BridgeStatus.Low,
    cbpPortNumber: 240401,
    sortOrder: 4,
    latitude: 31.4328,
    longitude: -106.14797,
    opensAt: '06:00',
    closesAt: '22:00',
  },
  {
    name: 'Puente Stanton / Lerdo',
    shortName: 'Stanton / Lerdo',
    slug: 'puente-stanton-lerdo',
    status: BridgeStatus.Low,
    cbpPortNumber: 240204,
    sortOrder: 5,
    latitude: 31.74948,
    longitude: -106.48343,
    opensAt: '06:00',
    closesAt: '24:00',
  },
  {
    name: 'Puente Santa Teresa',
    shortName: 'Santa Teresa',
    slug: 'puente-santa-teresa',
    status: BridgeStatus.Low,
    cbpPortNumber: 240801,
    sortOrder: 6,
    latitude: 31.78287,
    longitude: -106.67976,
    opensAt: '06:00',
    closesAt: '22:00',
  },
];
