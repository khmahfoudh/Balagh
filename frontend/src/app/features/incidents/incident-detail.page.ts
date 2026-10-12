import { Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { debounceTime, filter, merge } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { TranslationKey } from '../../core/i18n/fr';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N_PIPES } from '../../core/i18n/pipes';
import {
  IncidentDetail, IncidentSummary, MediaItem, REJECTION_REASONS, RejectionReason, TeamMember, Vehicle,
} from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';
import { CATEGORY_ICONS, errorMessage, OPEN_STATUSES, statusColor } from '../../core/ui';
import { MapComponent, MapPoint } from '../../shared/map/map.component';
import { IncidentStatusComponent, MissionStatusComponent } from '../../shared/status.component';

/** Délai souhaité proposé à l'assignation (maquette 17 : « Délai souhaité : aujourd'hui »). */
type Due = 'NONE' | 'H4' | 'TODAY' | 'TOMORROW';

type Panel = 'reject' | 'duplicate' | 'cancel' | null;

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Détail d'un incident (maquette 17) : photos et vidéos, signalements (citoyens anonymisés pour les agents),
 * chronologie, et actions de l'agent : confirmer, rejeter (motif obligatoire), doublon, ASSIGNER un chauffeur
 * et un véhicule, annuler la mission. Les boutons affichés viennent du backend (detail.actions).
 */
@Component({
  selector: 'app-incident-detail-page',
  imports: [
    FormsModule, RouterLink, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, MatInputModule,
    MapComponent, IncidentStatusComponent, MissionStatusComponent, ...I18N_PIPES,
  ],
  templateUrl: './incident-detail.page.html',
  styleUrl: './incident-detail.page.scss',
})
export class IncidentDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  /** :id de la route */
  readonly id = input.required<string>();

  protected readonly ICONS = CATEGORY_ICONS;
  protected readonly REASONS = REJECTION_REASONS;
  protected readonly dues: Due[] = ['TODAY', 'H4', 'TOMORROW', 'NONE'];

  protected readonly detail = signal<IncidentDetail | null>(null);
  protected readonly drivers = signal<TeamMember[]>([]);
  protected readonly vehicles = signal<Vehicle[]>([]);
  protected readonly candidates = signal<(IncidentSummary & { distance: number })[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly panel = signal<Panel>(null);

  // Formulaires
  protected driverId: string | null = null;
  protected vehicleId: string | null = null;
  protected due: Due = 'TODAY';
  protected reason: RejectionReason | null = null;
  protected note = '';
  protected duplicateOf: string | null = null;
  protected cancelReason = '';

  protected readonly incident = computed(() => this.detail()?.incident ?? null);
  protected readonly photos = computed(() => this.detail()?.media ?? []);
  /** Avant / après côte à côte quand le chauffeur a envoyé sa photo (maquette 17). */
  protected readonly before = computed<MediaItem | null>(() => this.photos().find((m) => m.type === 'PHOTO') ?? null);
  protected readonly point = computed<MapPoint[]>(() => {
    const i = this.incident();
    return i ? [{ id: i.id, latitude: i.latitude, longitude: i.longitude, color: statusColor(i.status, i.priority),
      label: String(i.reportersCount), radiusM: i.radiusM }] : [];
  });
  protected readonly selectedDriver = computed(() => this.drivers().find((d) => d.id === this.driverId) ?? null);

  ngOnInit(): void {
    void this.load();
    // Mise à jour en direct : nouveau signalement, avancement de la mission par le chauffeur...
    merge(this.realtime.incidentChanges.pipe(filter((e) => e.incidentId === this.id())), this.realtime.reconnected)
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.load());
  }

  protected async load(): Promise<void> {
    try {
      const detail = await this.api.incident(this.id());
      this.detail.set(detail);
      this.error.set(null);
      if (detail.actions.assign && this.drivers().length === 0) await this.loadTeam();
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    }
  }

  private async loadTeam(): Promise<void> {
    const [drivers, vehicles] = await Promise.all([this.api.drivers(), this.api.vehicles()]);
    this.drivers.set(drivers);
    this.vehicles.set(vehicles.filter((v) => v.active));
    // Proposition par défaut : premier chauffeur disponible et premier véhicule disponible
    this.driverId ??= drivers.find((d) => d.availability === 'DISPONIBLE')?.id ?? null;
    this.vehicleId ??= vehicles.find((v) => v.availability === 'DISPONIBLE')?.id ?? null;
  }

  protected driverLabel(d: TeamMember): string {
    const state = this.i18n.label('availability', d.availability);
    return d.activeMissions > 0 ? `${d.name} · ${state} (${d.activeMissions})` : `${d.name} · ${state}`;
  }

  protected dueAt(due: Due): string | null {
    const now = new Date();
    switch (due) {
      case 'H4':
        return new Date(now.getTime() + 4 * 3_600_000).toISOString();
      case 'TODAY':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59).toISOString();
      case 'TOMORROW':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59).toISOString();
      default:
        return null;
    }
  }

  protected assign(): Promise<void> {
    const driver = this.selectedDriver();
    if (!driver) return Promise.resolve();
    return this.act(() => this.api.assign(this.id(), driver.id, this.vehicleId, this.dueAt(this.due)),
      'detail.assigned', { name: driver.name });
  }

  protected confirm(): Promise<void> {
    return this.act(() => this.api.confirm(this.id()), 'detail.confirmed');
  }

  protected reject(): Promise<void> {
    if (!this.reason) return Promise.resolve();
    return this.act(() => this.api.reject(this.id(), this.reason!, this.note.trim() || null), 'detail.rejected');
  }

  protected markDuplicate(): Promise<void> {
    if (!this.duplicateOf) return Promise.resolve();
    return this.act(() => this.api.markDuplicate(this.id(), this.duplicateOf!), 'detail.duplicated');
  }

  protected cancelMission(): Promise<void> {
    const mission = this.detail()?.activeMission;
    if (!mission || !this.cancelReason.trim()) return Promise.resolve();
    return this.act(() => this.api.cancelMission(mission.id, this.cancelReason.trim()), 'detail.cancelled');
  }

  protected async openPanel(panel: Panel): Promise<void> {
    this.panel.set(this.panel() === panel ? null : panel);
    if (panel === 'duplicate' && this.candidates().length === 0) {
      const self = this.incident();
      if (!self) return;
      const page = await this.api.incidents({ category: self.category, status: OPEN_STATUSES }, 0, 100).catch(() => null);
      this.candidates.set((page?.items ?? [])
        .filter((i) => i.id !== self.id)
        .map((i) => ({ ...i, distance: Math.round(distanceMeters(self, i)) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 20));
    }
  }

  private async act(action: () => Promise<unknown>, success: TranslationKey, params?: Record<string, string>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.panel.set(null);
      this.reason = null;
      this.note = this.cancelReason = '';
      this.snackBar.open(this.i18n.t(success, params), undefined, { duration: 4000, direction: this.i18n.dir });
      await this.load();
      if (this.detail()?.actions.assign) await this.loadTeam();
    } catch (e) {
      this.snackBar.open(errorMessage(e, this.i18n), this.i18n.t('common.close'),
        { duration: 8000, direction: this.i18n.dir });
    } finally {
      this.busy.set(false);
    }
  }
}
