/**
 * Itinéraire routier (voiture) entre deux points, calculé par un serveur OSRM sur les données OpenStreetMap.
 * Par défaut le serveur de démonstration du projet OSRM (sans clé, usage modéré : 1 requête/s au plus) ;
 * en production, un OSRM à soi (extrait Mauritanie de Geofabrik) déclaré par EXPO_PUBLIC_ROUTING_URL.
 * Fichier sans dépendance React Native.
 */
export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Route {
  distanceMeters: number;
  durationSeconds: number;
  /** Tracé de la route, du point de départ à la destination. */
  path: LatLng[];
}

const OSRM_DEMO = 'https://router.project-osrm.org';
let routingUrl = OSRM_DEMO;

/** Adresse du serveur OSRM (vide = serveur de démonstration). */
export function setRoutingUrl(url?: string): void {
  routingUrl = (url || OSRM_DEMO).replace(/\/+$/, '');
}

interface OsrmResponse {
  code: string;
  routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
}

/** Lève une erreur si le serveur ne répond pas ou ne trouve pas de route (point hors du réseau routier). */
export async function fetchRoute(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<Route> {
  // OSRM attend longitude,latitude
  const coordinates = [from, to].map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`).join(';');
  const response = await fetch(`${routingUrl}/route/v1/driving/${coordinates}?overview=full&geometries=geojson`, {
    // Identifie l'application (règles d'usage du serveur OSRM de démonstration)
    headers: { Accept: 'application/json', 'User-Agent': 'BalaghMR/1.0' },
    signal,
  });
  if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);
  const data = (await response.json()) as OsrmResponse;
  const route = data.code === 'Ok' ? data.routes?.[0] : undefined;
  if (!route) throw new Error(`OSRM ${data.code}`);
  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    path: route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
  };
}
