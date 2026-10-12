import {
  afterNextRender, ChangeDetectionStrategy, Component, effect, ElementRef, inject, Injectable, input, OnDestroy, output,
  signal, viewChild,
} from '@angular/core';
import { Cluster, MarkerClusterer } from '@googlemaps/markerclusterer';

import { ConfigService } from '../../core/config.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/pipes';
import { HeatPoint } from '../../core/models';
import { inkOn } from '../../core/ui';

/**
 * Carte du dashboard (fournisseur : Google Maps). Toute la cartographie passe par ce fichier :
 * changer de fournisseur (OpenStreetMap...) ne touche que lui.
 */

/** Un point affiché : couleur selon statut/priorité, chiffre = citoyens distincts, cercle = rayon de regroupement. */
export interface MapPoint {
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  label?: string;
  title?: string;
  radiusM?: number;
}

const NOUAKCHOTT = { lat: 18.0858, lng: -15.9785 };

/** Charge l'API JavaScript Google Maps une seule fois (clé et Map ID dans public/config.json). */
@Injectable({ providedIn: 'root' })
export class GoogleMapsLoader {
  private readonly config = inject(ConfigService);
  private readonly i18n = inject(I18nService);
  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    const loaded = (globalThis as { google?: { maps?: { importLibrary?: unknown } } }).google?.maps?.importLibrary;
    if (loaded) return Promise.resolve();
    this.loading ??= new Promise<void>((resolve, reject) => {
      const callback = '__balaghMapsReady';
      (window as unknown as Record<string, () => void>)[callback] = () => resolve();
      const query = new URLSearchParams({ v: 'weekly', loading: 'async', callback, language: this.i18n.lang, region: 'MR' });
      if (this.config.googleMapsApiKey) query.set('key', this.config.googleMapsApiKey);
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?${query}`;
      script.async = true;
      script.onerror = () => {
        this.loading = null;
        script.remove();
        reject(new Error('Google Maps indisponible'));
      };
      document.head.appendChild(script);
    });
    return this.loading;
  }
}

@Component({
  selector: 'app-map',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #canvas class="canvas"></div>
    @if (failed()) {
      <div class="fallback">{{ 'map.unavailable' | t }}</div>
    }
  `,
  styles: `
    :host { display: block; position: relative; min-height: 320px; border-radius: 12px; overflow: hidden; background: #e8eeeb; }
    .canvas { position: absolute; inset: 0; }
    .fallback { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; text-align: center; color: #475569; }
  `,
})
export class MapComponent implements OnDestroy {
  private readonly loader = inject(GoogleMapsLoader);
  private readonly config = inject(ConfigService);
  private readonly canvas = viewChild.required<ElementRef<HTMLDivElement>>('canvas');

  readonly points = input<MapPoint[]>([]);
  readonly heat = input<HeatPoint[]>([]);
  readonly pointClick = output<string>();

  protected readonly failed = signal(false);
  private readonly ready = signal(false);
  private map: google.maps.Map | null = null;
  private clusterer: MarkerClusterer | null = null;
  private circles: google.maps.Circle[] = [];
  private markerLib: google.maps.MarkerLibrary | null = null;
  private fitted = false;

  constructor() {
    afterNextRender(() => void this.init());
    effect(() => {
      const points = this.points();
      const heat = this.heat();
      if (this.ready()) this.render(points, heat);
    });
  }

  private async init(): Promise<void> {
    try {
      await this.loader.load();
      const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
      this.markerLib = (await google.maps.importLibrary('marker')) as google.maps.MarkerLibrary;
      this.map = new Map(this.canvas().nativeElement, {
        center: NOUAKCHOTT, zoom: 12, mapId: this.config.googleMapsMapId,
        streetViewControl: false, mapTypeControl: false, clickableIcons: false,
      });
      // Regroupement neutre (gris foncé) : il ne doit pas se confondre avec une couleur de statut
      this.clusterer = new MarkerClusterer({
        map: this.map,
        renderer: { render: (cluster: Cluster) => this.clusterMarker(cluster) },
      });
      this.ready.set(true);
    } catch {
      this.failed.set(true);
    }
  }

  private render(points: MapPoint[], heat: HeatPoint[]): void {
    const map = this.map;
    const lib = this.markerLib;
    if (!map || !lib) return;
    this.clusterer?.clearMarkers();
    this.circles.forEach((circle) => circle.setMap(null));
    this.circles = [];

    const markers = points.map((point) => {
      const position = { lat: point.latitude, lng: point.longitude };
      const marker = new lib.AdvancedMarkerElement({ position, title: point.title, content: this.pin(point), gmpClickable: true });
      marker.addEventListener('gmp-click', () => this.pointClick.emit(point.id));
      if (point.radiusM) {
        this.circles.push(new google.maps.Circle({
          map, center: position, radius: point.radiusM, clickable: false,
          strokeColor: point.color, strokeWeight: 1.5, fillColor: point.color, fillOpacity: 0.18,
        }));
      }
      return marker;
    });
    this.clusterer?.addMarkers(markers);

    // Carte de chaleur : cercles dont la taille et l'opacité suivent le nombre de citoyens
    const maxWeight = Math.max(1, ...heat.map((h) => h.weight));
    for (const h of heat) {
      const strength = h.weight / maxWeight;
      this.circles.push(new google.maps.Circle({
        map, center: { lat: h.latitude, lng: h.longitude }, radius: 80 + 220 * strength, clickable: false,
        strokeOpacity: 0, fillColor: '#C0392B', fillOpacity: 0.12 + 0.4 * strength,
      }));
    }

    const all = [...points.map((p) => ({ lat: p.latitude, lng: p.longitude })),
      ...heat.map((h) => ({ lat: h.latitude, lng: h.longitude }))];
    if (!this.fitted && all.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      all.forEach((position) => bounds.extend(position));
      map.fitBounds(bounds, 48);
      if (all.length === 1) map.setZoom(15);
      this.fitted = true;
    }
  }

  private clusterMarker(cluster: Cluster): google.maps.marker.AdvancedMarkerElement {
    const el = document.createElement('div');
    el.className = 'map-pin map-cluster';
    el.textContent = String(cluster.count);
    return new this.markerLib!.AdvancedMarkerElement({ position: cluster.position, content: el, zIndex: 1000 + cluster.count });
  }

  /** Pastille ronde colorée avec le nombre de citoyens. */
  private pin(point: MapPoint): HTMLElement {
    const el = document.createElement('div');
    el.className = 'map-pin';
    el.style.background = point.color;
    el.style.color = inkOn(point.color);
    el.textContent = point.label ?? '';
    return el;
  }

  ngOnDestroy(): void {
    this.clusterer?.clearMarkers();
    this.circles.forEach((circle) => circle.setMap(null));
  }
}
