import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N_PIPES } from '../../core/i18n/pipes';
import { CATEGORIES, Category, HeatPoint, StatsSummary } from '../../core/models';
import { errorMessage, saveFile, toCsv, today } from '../../core/ui';
import { BarListComponent, ChartDatum, ColumnChartComponent } from '../../shared/charts.component';
import { MapComponent } from '../../shared/map/map.component';
import { KpiComponent } from '../../shared/status.component';

const WEEKS = 8;

/** Lundi (UTC) de la semaine d'une date, au format AAAA-MM-JJ, comme date_trunc('week') côté backend. */
function mondayKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Statistiques (maquette 18) : incidents par semaine, zones les plus touchées, répartition par catégorie,
 * délais moyens de résolution, carte de chaleur des points noirs (30 derniers jours).
 */
@Component({
  selector: 'app-stats-page',
  imports: [
    FormsModule, MatFormFieldModule, MatSelectModule, MatButtonModule, MatIconModule, KpiComponent,
    ColumnChartComponent, BarListComponent, MapComponent, ...I18N_PIPES,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'nav.stats' | t }}</h1>
          <p class="subtitle">{{ 'stats.subtitle' | t }}</p>
        </div>
        <span class="spacer"></span>
        <button mat-stroked-button (click)="exportCsv()" [disabled]="!stats()">
          <mat-icon>download</mat-icon>{{ 'common.exportCsv' | t }}
        </button>
      </div>

      <div class="filters">
        <mat-form-field>
          <mat-label>{{ 'filters.category' | t }}</mat-label>
          <mat-select [(ngModel)]="category" (selectionChange)="load()">
            <mat-option [value]="null">{{ 'filters.all' | t }}</mat-option>
            @for (c of categories(); track c) {
              <mat-option [value]="c">{{ c | label: 'category' }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>

      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      @if (stats(); as s) {
        <section class="kpis">
          <app-kpi [label]="'stats.avgResolution' | t" [value]="s.avgResolutionHours | hours" />
          <app-kpi [label]="'stats.avgUrgent' | t" [value]="s.avgUrgentResolutionHours | hours" />
          <app-kpi [label]="'dashboard.inProgress' | t" [value]="s.inProgress" />
          <app-kpi [label]="'dashboard.resolvedToday' | t" [value]="s.resolvedToday" />
          @if (auth.hasRole('ADMIN', 'AUTHORITY')) {
            <app-kpi [label]="'dashboard.unassigned' | t" [value]="s.unassigned" />
          }
        </section>

        <div class="grid">
          <section class="card">
            <h2>{{ 'stats.byWeek' | t }}</h2>
            <app-column-chart [data]="weeks()" [loading]="loading()" [ariaLabel]="'stats.byWeek' | t" />
          </section>
          <section class="card">
            <h2>{{ 'stats.byZone' | t }}</h2>
            <app-bar-list [data]="zones()" />
            @if (zones().length === 0) {
              <p class="empty">{{ 'stats.noData' | t }}</p>
            }
          </section>
          @if (categoryRows().length > 1) {
            <section class="card">
              <h2>{{ 'stats.byCategory' | t }}</h2>
              <app-bar-list [data]="categoryRows()" />
            </section>
          }
          <section class="card heat">
            <h2>{{ 'stats.heatmap' | t }}</h2>
            <p class="muted small">{{ 'stats.heatmapHint' | t }}</p>
            <app-map class="map" [heat]="heat()" />
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 16px; align-items: start; }
    .heat { grid-column: 1 / -1; }
    .map { height: 420px; }
    @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
  `,
})
export class StatsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);

  protected category: Category | null = null;
  protected readonly categories = computed<Category[]>(() => this.auth.user()?.organization?.categories ?? CATEGORIES);
  protected readonly stats = signal<StatsSummary | null>(null);
  protected readonly heat = signal<HeatPoint[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** 8 dernières semaines, semaines sans incident comprises (à 0). */
  protected readonly weeks = computed<ChartDatum[]>(() => {
    const counts = new Map((this.stats()?.byWeek ?? []).map((w) => [w.period, w.count]));
    const format = new Intl.DateTimeFormat(this.i18n.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return Array.from({ length: WEEKS }, (_, i) => {
      const key = mondayKey(new Date(Date.now() - (WEEKS - 1 - i) * 7 * 86_400_000));
      return { label: format.format(new Date(key + 'T00:00:00Z')), value: counts.get(key) ?? 0 };
    });
  });
  protected readonly zones = computed<ChartDatum[]>(() => (this.stats()?.byZone ?? []).map((z) => ({
    label: z.zone, value: z.incidents, note: z.urgent > 0 ? this.i18n.t('stats.urgentNote', { n: z.urgent }) : undefined,
  })));
  protected readonly categoryRows = computed<ChartDatum[]>(() => Object.entries(this.stats()?.byCategory ?? {})
    .map(([category, value]) => ({ label: this.i18n.label('category', category), value }))
    .sort((a, b) => b.value - a.value));

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [stats, heat] = await Promise.all([this.api.stats(this.category), this.api.heatmap(this.category, 30)]);
      this.stats.set(stats);
      this.heat.set(heat);
      this.error.set(null);
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    } finally {
      this.loading.set(false);
    }
  }

  protected exportCsv(): void {
    const rows: (string | number)[][] = [
      ...this.weeks().map((w) => [this.i18n.t('stats.byWeek'), w.label, w.value, '']),
      ...(this.stats()?.byZone ?? []).map((z) => [this.i18n.t('stats.byZone'), z.zone, z.incidents, z.urgent]),
      ...this.categoryRows().map((c) => [this.i18n.t('stats.byCategory'), c.label, c.value, '']),
    ];
    saveFile(toCsv([this.i18n.t('csv.indicator'), this.i18n.t('csv.value'), this.i18n.t('csv.incidents'),
      this.i18n.t('csv.urgent')], rows), `balagh-statistiques-${today()}.csv`);
  }
}
