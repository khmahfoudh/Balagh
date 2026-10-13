import { Injectable } from '@angular/core';

export interface AppConfig {
  /** Adresse du backend, ex. http://localhost:8080 */
  apiUrl: string;
  /** Fond de carte Leaflet ({z}/{x}/{y}). Par défaut les tuiles OpenStreetMap, sans clé. */
  mapTileUrl: string;
  /** Mention des sources affichée en bas de la carte (obligatoire pour OpenStreetMap). */
  mapAttribution: string;
}

const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

/** Configuration lue au démarrage depuis public/config.json (non versionné, voir config.example.json). */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private config: AppConfig = { apiUrl: 'http://localhost:8080', mapTileUrl: OSM_TILES, mapAttribution: OSM_ATTRIBUTION };

  async load(): Promise<void> {
    try {
      const response = await fetch('config.json', { cache: 'no-store' });
      if (response.ok) {
        this.config = { ...this.config, ...(await response.json()) };
      }
    } catch {
      // config.json absent : valeurs par défaut (backend local)
    }
  }

  private get baseUrl(): string {
    return this.config.apiUrl.replace(/\/+$/, '');
  }

  get apiUrl(): string {
    return this.baseUrl + '/api/v1';
  }

  /** WebSocket STOMP du backend : ws://hôte/ws (wss:// derrière HTTPS). */
  get wsUrl(): string {
    return this.baseUrl.replace(/^http/, 'ws') + '/ws';
  }

  get mapTileUrl(): string {
    return this.config.mapTileUrl || OSM_TILES;
  }

  /** Les tuiles OSM par défaut gardent toujours leur mention OpenStreetMap. */
  get mapAttribution(): string {
    return this.config.mapAttribution || (this.mapTileUrl === OSM_TILES ? OSM_ATTRIBUTION : '');
  }
}
