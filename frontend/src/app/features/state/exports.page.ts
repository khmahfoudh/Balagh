import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';

import { ApiService } from '../../core/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N_PIPES } from '../../core/i18n/pipes';
import { CATEGORIES, Category } from '../../core/models';
import { errorMessage, saveFile, today } from '../../core/ui';

/** Exports de la vue État : incidents anonymisés (CSV, GeoJSON) et rapport de priorisation des routes. */
@Component({
  selector: 'app-exports-page',
  imports: [FormsModule, MatFormFieldModule, MatSelectModule, MatButtonModule, MatIconModule, ...I18N_PIPES],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'nav.exports' | t }}</h1>
          <p class="subtitle">{{ 'exports.subtitle' | t }}</p>
        </div>
      </div>
      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }
      <div class="grid">
        <section class="card">
          <h2>{{ 'exports.incidents' | t }}</h2>
          <p class="muted">{{ 'exports.incidentsHint' | t }}</p>
          <div class="filters">
            <mat-form-field>
              <mat-label>{{ 'filters.period' | t }}</mat-label>
              <mat-select [(ngModel)]="days">
                @for (d of periods; track d) {
                  <mat-option [value]="d">{{ 'perf.lastDays' | t: { n: d } }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'filters.category' | t }}</mat-label>
              <mat-select [(ngModel)]="category">
                <mat-option [value]="null">{{ 'filters.all' | t }}</mat-option>
                @for (c of categories; track c) {
                  <mat-option [value]="c">{{ c | label: 'category' }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
          <div class="row wrap">
            <button mat-flat-button (click)="exportIncidents('csv')" [disabled]="busy()"><mat-icon>download</mat-icon>CSV</button>
            <button mat-stroked-button (click)="exportIncidents('geojson')" [disabled]="busy()"><mat-icon>public</mat-icon>GeoJSON</button>
          </div>
        </section>
        <section class="card">
          <h2>{{ 'exports.roads' | t }}</h2>
          <p class="muted">{{ 'exports.roadsHint' | t }}</p>
          <button mat-flat-button (click)="exportRoads()" [disabled]="busy()"><mat-icon>download</mat-icon>CSV</button>
        </section>
      </div>
    </div>
  `,
  styles: `.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; align-items: start; }`,
})
export class ExportsPage {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);

  protected readonly categories = CATEGORIES;
  protected readonly periods = [30, 90, 180, 365];
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected category: Category | null = null;
  protected days = 90;

  protected exportIncidents(format: 'csv' | 'geojson'): Promise<void> {
    const to = new Date();
    const from = new Date(to.getTime() - this.days * 86_400_000);
    return this.run(async () => saveFile(
      await this.api.download('/authority/export', { format, category: this.category, from: from.toISOString(), to: to.toISOString() }),
      `balagh-incidents-${today()}.${format}`));
  }

  protected exportRoads(): Promise<void> {
    return this.run(async () => saveFile(await this.api.download('/authority/reports/road-priority', { format: 'csv' }),
      `balagh-routes-priorites-${today()}.csv`));
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.error.set(null);
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    } finally {
      this.busy.set(false);
    }
  }
}
