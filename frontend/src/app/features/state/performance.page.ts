import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';

import { ApiService } from '../../core/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N_PIPES } from '../../core/i18n/pipes';
import { CATEGORIES, Category, OrgPerformance } from '../../core/models';
import { COLORS, errorMessage, saveFile, toCsv, today } from '../../core/ui';

type Level = 'good' | 'warn' | 'bad';
const LEVEL_STYLE: Record<Level, { color: string; icon: string }> = {
  good: { color: COLORS.resolved, icon: 'check_circle' },
  warn: { color: COLORS.new, icon: 'warning' },
  bad: { color: COLORS.urgent, icon: 'error' },
};

/** Seuils indicatifs (maquette 20 : objectif 12 h, 10 % de réouvertures) : vert tenu, orange à surveiller, rouge non tenu. */
function level(value: number | null, good: number, warn: number, higherIsBetter: boolean): Level | null {
  if (value === null) return null;
  if (higherIsBetter) return value >= good ? 'good' : value >= warn ? 'warn' : 'bad';
  return value <= good ? 'good' : value <= warn ? 'warn' : 'bad';
}

/** Performance comparée des organismes (maquette 20, lecture seule) sur la même catégorie et la même période. */
@Component({
  selector: 'app-performance-page',
  imports: [FormsModule, MatTableModule, MatFormFieldModule, MatSelectModule, MatButtonModule, MatIconModule, ...I18N_PIPES],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'nav.performance' | t }}</h1>
          <p class="subtitle">{{ 'perf.subtitle' | t }}</p>
        </div>
        <span class="spacer"></span>
        <button mat-stroked-button (click)="exportCsv()" [disabled]="rows().length === 0">
          <mat-icon>download</mat-icon>{{ 'common.exportCsv' | t }}
        </button>
      </div>
      <div class="filters">
        <mat-form-field>
          <mat-label>{{ 'filters.period' | t }}</mat-label>
          <mat-select [(ngModel)]="days" (selectionChange)="load()">
            @for (d of periods; track d) {
              <mat-option [value]="d">{{ 'perf.lastDays' | t: { n: d } }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'filters.category' | t }}</mat-label>
          <mat-select [(ngModel)]="category" (selectionChange)="load()">
            <mat-option [value]="null">{{ 'filters.all' | t }}</mat-option>
            @for (c of categories; track c) {
              <mat-option [value]="c">{{ c | label: 'category' }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      <div class="layout">
        <section class="card table-card">
          <div class="table-wrap">
            <table mat-table [dataSource]="rows()">
              <ng-container matColumnDef="org">
                <th mat-header-cell *matHeaderCellDef>{{ 'incidents.organization' | t }}</th>
                <td mat-cell *matCellDef="let p"><strong>{{ p.organizationName }}</strong></td>
              </ng-container>
              <ng-container matColumnDef="received">
                <th mat-header-cell *matHeaderCellDef class="num">{{ 'perf.received' | t }}</th>
                <td mat-cell *matCellDef="let p" class="num">{{ p.received }}</td>
              </ng-container>
              <ng-container matColumnDef="resolved">
                <th mat-header-cell *matHeaderCellDef class="num">{{ 'perf.resolved' | t }}</th>
                <td mat-cell *matCellDef="let p" class="num">
                  <span class="metric">@if (mark(p, 'resolutionRate'); as m) {<span class="material-symbols-outlined" [style.color]="m.color" aria-hidden="true">{{ m.icon }}</span>}{{ p.resolutionRate | pct }}</span>
                </td>
              </ng-container>
              <ng-container matColumnDef="delay">
                <th mat-header-cell *matHeaderCellDef class="num">{{ 'perf.delay' | t }}</th>
                <td mat-cell *matCellDef="let p" class="num">
                  <span class="metric">@if (mark(p, 'avgResolutionHours'); as m) {<span class="material-symbols-outlined" [style.color]="m.color" aria-hidden="true">{{ m.icon }}</span>}{{ p.avgResolutionHours | hours }}</span>
                  <div class="muted small">{{ 'perf.urgent' | t }} {{ p.avgUrgentResolutionHours | hours }}</div>
                </td>
              </ng-container>
              <ng-container matColumnDef="reopened">
                <th mat-header-cell *matHeaderCellDef class="num">{{ 'perf.reopened' | t }}</th>
                <td mat-cell *matCellDef="let p" class="num">
                  <span class="metric">@if (mark(p, 'reopenedRate'); as m) {<span class="material-symbols-outlined" [style.color]="m.color" aria-hidden="true">{{ m.icon }}</span>}{{ p.reopenedRate | pct }}</span>
                </td>
              </ng-container>
              <ng-container matColumnDef="confirmed">
                <th mat-header-cell *matHeaderCellDef class="num">{{ 'perf.confirmed' | t }}</th>
                <td mat-cell *matCellDef="let p" class="num">
                  <span class="metric">@if (mark(p, 'citizenConfirmedRate'); as m) {<span class="material-symbols-outlined" [style.color]="m.color" aria-hidden="true">{{ m.icon }}</span>}{{ p.citizenConfirmedRate | pct }}</span>
                </td>
              </ng-container>
              <ng-container matColumnDef="proof">
                <th mat-header-cell *matHeaderCellDef class="num">{{ 'perf.proof' | t }}</th>
                <td mat-cell *matCellDef="let p" class="num">{{ p.proofRate | pct }}</td>
              </ng-container>
              <ng-container matColumnDef="urgentNoReaction">
                <th mat-header-cell *matHeaderCellDef class="num">{{ 'perf.noReaction' | t }}</th>
                <td mat-cell *matCellDef="let p" class="num">
                  <span class="metric">@if (mark(p, 'urgentWithoutReaction'); as m) {<span class="material-symbols-outlined" [style.color]="m.color" aria-hidden="true">{{ m.icon }}</span>}{{ p.urgentWithoutReaction }}</span>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let row; columns: columns"></tr>
            </table>
          </div>
          @if (rows().length === 0) {
            <p class="empty">{{ 'perf.none' | t }}</p>
          }
          <p class="muted small pad">{{ 'perf.legend' | t }}</p>
        </section>

        <aside class="card">
          <h2>{{ 'perf.alerts' | t }}</h2>
          @for (a of alerts(); track a.text) {
            <div class="alert" [class.bad]="a.kind === 'bad'">
              <strong>{{ (a.kind === 'bad' ? 'perf.alert' : 'perf.followUp') | t }} · {{ a.org }}</strong>
              <span>{{ a.text }}</span>
            </div>
          } @empty {
            <p class="muted small">{{ 'perf.noAlert' | t }}</p>
          }
        </aside>
      </div>
    </div>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
    .table-card { padding: 0; overflow: hidden; }
    .num { text-align: end !important; font-variant-numeric: tabular-nums; white-space: nowrap; }
    td.mat-column-org { min-width: 180px; }
    .metric { display: inline-flex; align-items: center; gap: 4px; }
    .metric .material-symbols-outlined { font-size: 16px; }
    .pad { padding: 0 16px 12px; }
    .alert { display: flex; flex-direction: column; gap: 2px; padding: 10px; border-radius: 8px; margin-bottom: 8px; background: #fff7e6; }
    .alert.bad { background: var(--red-light); }
    @media (max-width: 1100px) { .layout { grid-template-columns: 1fr; } }
  `,
})
export class PerformancePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);

  protected readonly categories = CATEGORIES;
  protected readonly periods = [30, 90, 180, 365];
  protected readonly columns = ['org', 'received', 'resolved', 'delay', 'reopened', 'confirmed', 'proof', 'urgentNoReaction'];
  protected readonly rows = signal<OrgPerformance[]>([]);
  protected readonly error = signal<string | null>(null);
  protected category: Category | null = null;
  protected days = 90;

  protected readonly alerts = computed(() => this.rows().flatMap((p) => {
    const list: { kind: 'bad' | 'warn'; org: string; text: string }[] = [];
    if (p.urgentWithoutReaction > 0) {
      list.push({ kind: 'bad', org: p.organizationName, text: this.i18n.t('perf.alertUrgent', { n: p.urgentWithoutReaction }) });
    }
    if (p.reopenedRate !== null && p.reopenedRate > 0.1) {
      list.push({ kind: 'warn', org: p.organizationName, text: this.i18n.t('perf.alertReopened', { rate: this.i18n.percent(p.reopenedRate) }) });
    }
    return list;
  }));

  ngOnInit(): void {
    void this.load();
  }

  protected mark(p: OrgPerformance, metric: 'resolutionRate' | 'avgResolutionHours' | 'reopenedRate'
    | 'citizenConfirmedRate' | 'urgentWithoutReaction'): { color: string; icon: string } | null {
    const result = {
      resolutionRate: () => level(p.resolutionRate, 0.8, 0.6, true),
      avgResolutionHours: () => level(p.avgResolutionHours, 12, 24, false),
      reopenedRate: () => level(p.reopenedRate, 0.1, 0.15, false),
      citizenConfirmedRate: () => level(p.citizenConfirmedRate, 0.8, 0.6, true),
      urgentWithoutReaction: () => level(p.urgentWithoutReaction, 0, 3, false),
    }[metric]();
    return result ? LEVEL_STYLE[result] : null;
  }

  protected async load(): Promise<void> {
    const to = new Date();
    const from = new Date(to.getTime() - this.days * 86_400_000);
    try {
      this.rows.set(await this.api.performance(this.category, from.toISOString(), to.toISOString()));
      this.error.set(null);
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    }
  }

  protected exportCsv(): void {
    const t = (key: Parameters<I18nService['t']>[0]) => this.i18n.t(key);
    saveFile(toCsv(
      [t('incidents.organization'), t('perf.received'), t('perf.resolved'), t('perf.delay'), t('perf.urgent'),
        t('perf.reopened'), t('perf.confirmed'), t('perf.proof'), t('perf.noReaction')],
      this.rows().map((p) => [p.organizationName, p.received, this.i18n.percent(p.resolutionRate),
        this.i18n.hours(p.avgResolutionHours), this.i18n.hours(p.avgUrgentResolutionHours), this.i18n.percent(p.reopenedRate),
        this.i18n.percent(p.citizenConfirmedRate), this.i18n.percent(p.proofRate), p.urgentWithoutReaction])),
    `balagh-performance-${today()}.csv`);
  }
}
