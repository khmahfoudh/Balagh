import {
  afterNextRender, ChangeDetectionStrategy, Component, effect, ElementRef, inject, input, OnDestroy, output, signal,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
// Greffe L.markerClusterGroup sur le L global posé par Leaflet (doit venir après l'import de Leaflet)
import 'leaflet.markercluster';

import { ConfigService } from '../../core/config.service';
import { HeatPoint } from '../../core/models';
import { inkOn } from '../../core/ui';

/**
 * Carte du dashboard (fournisseur : Leaflet + tuiles OpenStreetMap, sans clé). Toute la cartographie passe
 * par ce fichier : changer de fournisseur ne touche que lui. Fond de carte réglable dans public/config.json.
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

const NOUAKCHOTT: L.LatLngTuple = [18.0858, -15.9785];

@Component({
  selector: 'app-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // dir="ltr" : Leaflet place ses tuiles et contrôles en coordonnées gauche/haut, même en arabe
  template: `<div #canvas class="canvas" dir="ltr"></div>`,
  styles: `
    :host { display: block; position: relative; min-height: 320px; border-radius: 12px; overflow: hidden; background: #e8eeeb; }
    .canvas { position: absolute; inset: 0; z-index: 0; background: #e8eeeb; }
  `,
})
export class MapComponent implements OnDestroy {
  private readonly config = inject(ConfigService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly canvas = viewChild.required<ElementRef<HTMLDivElement>>('canvas');

  readonly points = input<MapPoint[]>([]);
  readonly heat = input<HeatPoint[]>([]);
  readonly pointClick = output<string>();

  private readonly ready = signal(false);
  private map: L.Map | null = null;
  private clusters: L.MarkerClusterGroup | null = null;
  private circles: L.LayerGroup | null = null;
  private resize: ResizeObserver | null = null;
  private fitted = false;

  constructor() {
    afterNextRender(() => this.init());
    effect(() => {
      const points = this.points();
      const heat = this.heat();
      if (this.ready()) this.render(points, heat);
    });
  }

  private init(): void {
    const map = L.map(this.canvas().nativeElement, { center: NOUAKCHOTT, zoom: 12 });
    L.tileLayer(this.config.mapTileUrl, { maxZoom: 19, attribution: this.config.mapAttribution }).addTo(map);
    // Cercles sous les pastilles ; ils ne captent pas les clics
    this.circles = L.layerGroup().addTo(map);
    // Regroupement neutre (gris foncé) : il ne doit pas se confondre avec une couleur de statut
    this.clusters = L.markerClusterGroup({
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => this.icon(this.clusterPin(cluster.getChildCount())),
    }).addTo(map);
    // La carte suit la taille de son bloc (menu replié, onglet affiché après coup...)
    this.resize = new ResizeObserver(() => map.invalidateSize());
    this.resize.observe(this.host.nativeElement);
    this.map = map;
    this.ready.set(true);
  }

  private render(points: MapPoint[], heat: HeatPoint[]): void {
    const map = this.map;
    if (!map || !this.clusters || !this.circles) return;
    this.clusters.clearLayers();
    this.circles.clearLayers();

    const markers = points.map((point) => {
      const position: L.LatLngTuple = [point.latitude, point.longitude];
      if (point.radiusM) {
        L.circle(position, {
          radius: point.radiusM, interactive: false,
          color: point.color, weight: 1.5, fillColor: point.color, fillOpacity: 0.18,
        }).addTo(this.circles!);
      }
      return L.marker(position, { icon: this.icon(this.pin(point)), title: point.title ?? '', keyboard: true })
        .on('click', () => this.pointClick.emit(point.id));
    });
    this.clusters.addLayers(markers);

    // Carte de chaleur : cercles dont la taille et l'opacité suivent le nombre de citoyens
    const maxWeight = Math.max(1, ...heat.map((h) => h.weight));
    for (const h of heat) {
      const strength = h.weight / maxWeight;
      L.circle([h.latitude, h.longitude], {
        radius: 80 + 220 * strength, interactive: false,
        stroke: false, fillColor: '#C0392B', fillOpacity: 0.12 + 0.4 * strength,
      }).addTo(this.circles);
    }

    const all: L.LatLngTuple[] = [...points.map((p): L.LatLngTuple => [p.latitude, p.longitude]),
      ...heat.map((h): L.LatLngTuple => [h.latitude, h.longitude])];
    if (!this.fitted && all.length > 0) {
      map.fitBounds(L.latLngBounds(all), { padding: [48, 48], maxZoom: 15 });
      this.fitted = true;
    }
  }

  /** Icône de taille nulle centrée sur le point : la pastille se centre elle-même (voir .map-pin-anchor). */
  private icon(content: HTMLElement): L.DivIcon {
    return L.divIcon({ html: content, className: 'map-pin-anchor', iconSize: [0, 0] });
  }

  private clusterPin(count: number): HTMLElement {
    const el = document.createElement('div');
    el.className = 'map-pin map-cluster';
    el.textContent = String(count);
    return el;
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
    this.resize?.disconnect();
    this.map?.remove();
  }
}
