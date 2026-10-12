import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, merge } from 'rxjs';

import { AlertService } from '../../core/alert.service';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N_PIPES } from '../../core/i18n/pipes';
import { AdminUnit, CATEGORIES, Category, IncidentStatus, IncidentSummary, StatsSummary } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';
import { CATEGORY_ICONS, COLORS, errorMessage, OPEN_STATUSES, statusColor } from '../../core/ui';
import { MapComponent, MapPoint } from '../../shared/map/map.component';
import { IncidentStatusComponent, KpiComponent } from '../../shared/status.component';

/** Filtre de statut du tableau de bord : groupes lisibles plutôt que les 8 statuts. */
type StatusGroup = 'OPEN' | 'NEW' | 'IN_PROGRESS' | 'RESOLVED';
const STATUS_GROUPS: Record<StatusGroup, IncidentStatus[]> = {
  OPEN: OPEN_STATUSES,
  NEW: ['NEW', 'REOPENED'],
  IN_PROGRESS: ['CONFIRMED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE'],
  RESOLVED: ['RESOLVED'],
};

/**
 * Tableau de bord (maquette 16) : compteurs, carte en temps réel avec cercles rouges autour des urgents,
 * incidents urgents, dernières alertes. Les filtres agissent à la fois sur la carte et sur la liste ;
 * un agent ne voit que les zones et catégories de son organisme (filtré par le backend).
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [
    FormsModule, RouterLink, MatFormFieldModule, MatSelectModule, MatButtonModule, MatIconModule, MapComponent,
    KpiComponent, IncidentStatusComponent, ...I18N_PIPES,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  protected readonly alerts = inject(AlertService);

  protected readonly COLORS = COLORS;
  protected readonly ICONS = CATEGORY_ICONS;
  protected readonly groups: StatusGroup[] = ['OPEN', 'NEW', 'IN_PROGRESS', 'RESOLVED'];

  protected category: Category | null = null;
  protected group: StatusGroup = 'OPEN';
  protected zone: string | null = null;

  protected readonly categories = computed<Category[]>(() => this.auth.user()?.organization?.categories ?? CATEGORIES);
  protected readonly zones = signal<AdminUnit[]>([]);
  protected readonly stats = signal<StatsSummary | null>(null);
  protected readonly incidents = signal<IncidentSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly urgent = computed(() => this.incidents().filter((i) => i.priority === 'URGENT' && i.status !== 'RESOLVED'));
  protected readonly points = computed<MapPoint[]>(() => this.incidents().map((i) => ({
    id: i.id,
    latitude: i.latitude,
    longitude: i.longitude,
    color: statusColor(i.status, i.priority),
    label: String(i.reportersCount),
    title: `${this.i18n.label('category', i.category)} · ${i.place ?? ''} · ${this.i18n.label('status', i.status)}`,
    // Cercle = rayon de regroupement, autour des zones urgentes seulement (maquette 16)
    radiusM: i.priority === 'URGENT' && i.status !== 'RESOLVED' ? i.radiusM : undefined,
  })));

  ngOnInit(): void {
    void this.load();
    void this.api.adminUnits('MOUGHATAA').then((list) => this.zones.set(list)).catch(() => undefined);
    // Temps réel : un changement (nouveau signalement, URGENT, mission...) recharge compteurs, carte et liste
    merge(this.realtime.incidentChanges, this.realtime.reconnected)
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.load());
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [stats, page] = await Promise.all([
        this.api.stats(this.category),
        this.api.incidents({ status: STATUS_GROUPS[this.group], category: this.category, zone: this.zone }, 0, 200),
      ]);
      this.stats.set(stats);
      this.incidents.set(page.items);
      this.total.set(page.totalElements);
      this.error.set(null);
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    } finally {
      this.loading.set(false);
    }
  }

  protected open(id: string): void {
    void this.router.navigate(['/incidents', id]);
  }
}
