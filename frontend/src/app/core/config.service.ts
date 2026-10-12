import { Injectable } from '@angular/core';

export interface AppConfig {
  /** Adresse du backend, ex. http://localhost:8080 */
  apiUrl: string;
  /** Clé Google Maps JavaScript API (restreinte au domaine du dashboard). Vide = mode développement Google. */
  googleMapsApiKey: string;
  /** Map ID Google (marqueurs avancés). DEMO_MAP_ID convient au développement. */
  googleMapsMapId: string;
}

/** Configuration lue au démarrage depuis public/config.json (non versionné, voir config.example.json). */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private config: AppConfig = { apiUrl: 'http://localhost:8080', googleMapsApiKey: '', googleMapsMapId: 'DEMO_MAP_ID' };

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

  get googleMapsApiKey(): string {
    return this.config.googleMapsApiKey;
  }

  get googleMapsMapId(): string {
    return this.config.googleMapsMapId || 'DEMO_MAP_ID';
  }
}
