import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N_PIPES } from '../../core/i18n/pipes';
import { Category, Coverage, ZoneAvailability } from '../../core/models';
import { errorMessage } from '../../core/ui';

/**
 * Mes zones d'intervention (maquette 19-A) : listes en cascade wilaya → moughataa → commune.
 * « Premier arrivé, premier verrouillé » par catégorie : les zones prises par un autre organisme sont grisées.
 * Le responsable ajoute ou retire ; l'agent consulte.
 */
@Component({
  selector: 'app-my-zones-page',
  imports: [FormsModule, MatFormFieldModule, MatSelectModule, MatButtonModule, MatIconModule, MatTableModule, ...I18N_PIPES],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'zones.title' | t }}</h1>
          <p class="subtitle">{{ auth.user()?.organization?.name }}</p>
        </div>
      </div>
      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      @if (auth.hasRole('MANAGER')) {
        <section class="card add">
          <h2>{{ 'zones.add' | t }}</h2>
          <div class="filters">
            <mat-form-field>
              <mat-label>{{ 'filters.category' | t }}</mat-label>
              <mat-select [(ngModel)]="category" (selectionChange)="loadWilayas()">
                @for (c of categories(); track c) {
                  <mat-option [value]="c">{{ c | label: 'category' }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'level.WILAYA' | t }}</mat-label>
              <mat-select [(ngModel)]="wilaya" (selectionChange)="loadMoughataas()" [disabled]="!category">
                @for (z of wilayas(); track z.id) {
                  <mat-option [value]="z" [disabled]="z.status === 'TAKEN' || z.status === 'MINE'">
                    {{ name(z) }}{{ suffix(z) }}
                  </mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'level.MOUGHATAA' | t }}</mat-label>
              <mat-select [(ngModel)]="moughataa" (selectionChange)="loadCommunes()" [disabled]="!wilaya">
                <mat-option [value]="null">{{ 'zones.whole' | t }}</mat-option>
                @for (z of moughataas(); track z.id) {
                  <mat-option [value]="z" [disabled]="z.status === 'TAKEN' || z.status === 'MINE'">
                    {{ name(z) }}{{ suffix(z) }}
                  </mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'level.COMMUNE' | t }}</mat-label>
              <mat-select [(ngModel)]="commune" [disabled]="!moughataa">
                <mat-option [value]="null">{{ 'zones.whole' | t }}</mat-option>
                @for (z of communes(); track z.id) {
                  <mat-option [value]="z" [disabled]="z.status !== 'FREE'">{{ name(z) }}{{ suffix(z) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <button mat-flat-button (click)="add()" [disabled]="busy() || !canAdd()">{{ 'zones.addButton' | t }}</button>
          </div>
          <p class="muted small">{{ 'zones.rule' | t }}</p>
          @if (selected()?.status === 'PARTIAL') {
            <p class="info-banner">{{ 'zones.partial' | t }}</p>
          }
        </section>
      }

      <section class="card table-card">
        <h2 class="pad">{{ 'zones.current' | t: { n: activeCount() } }}</h2>
        <div class="table-wrap">
          <table mat-table [dataSource]="coverage()">
            <ng-container matColumnDef="category">
              <th mat-header-cell *matHeaderCellDef>{{ 'filters.category' | t }}</th>
              <td mat-cell *matCellDef="let c">{{ c.category | label: 'category' }}</td>
            </ng-container>
            <ng-container matColumnDef="wilaya">
              <th mat-header-cell *matHeaderCellDef>{{ 'level.WILAYA' | t }}</th>
              <td mat-cell *matCellDef="let c">{{ c.wilaya ?? '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="moughataa">
              <th mat-header-cell *matHeaderCellDef>{{ 'level.MOUGHATAA' | t }}</th>
              <td mat-cell *matCellDef="let c">{{ c.moughataa ?? ('zones.all' | t) }}</td>
            </ng-container>
            <ng-container matColumnDef="commune">
              <th mat-header-cell *matHeaderCellDef>{{ 'level.COMMUNE' | t }}</th>
              <td mat-cell *matCellDef="let c">{{ c.commune ?? ('zones.all' | t) }}</td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>{{ 'filters.status' | t }}</th>
              <td mat-cell *matCellDef="let c">
                <span class="badge" [style.--c]="c.active ? 'var(--resolved)' : 'var(--muted)'">
                  {{ (c.active ? 'zones.active' : 'zones.released') | t }}</span>
                @if (!c.active && c.releaseReason) {
                  <span class="muted small"> {{ c.releaseReason }}</span>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let c">
                @if (auth.hasRole('MANAGER') && c.active) {
                  <button mat-button (click)="remove(c)" [disabled]="busy()">{{ 'zones.remove' | t }}</button>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        @if (coverage().length === 0) {
          <p class="empty">{{ 'zones.none' | t }}</p>
        }
        <p class="muted small pad">{{ 'zones.audit' | t }}</p>
      </section>
    </div>
  `,
  styles: `
    .add { margin-bottom: 16px; }
    .table-card { padding: 0; overflow: hidden; }
    .pad { padding: 16px 16px 0; }
    p.pad { padding-bottom: 12px; }
  `,
})
export class MyZonesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);

  protected readonly columns = ['category', 'wilaya', 'moughataa', 'commune', 'status', 'actions'];
  protected readonly categories = computed<Category[]>(() => this.auth.user()?.organization?.categories ?? []);
  protected readonly coverage = signal<Coverage[]>([]);
  protected readonly activeCount = computed(() => this.coverage().filter((c) => c.active).length);
  protected readonly wilayas = signal<ZoneAvailability[]>([]);
  protected readonly moughataas = signal<ZoneAvailability[]>([]);
  protected readonly communes = signal<ZoneAvailability[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly selected = signal<ZoneAvailability | null>(null);

  protected category: Category | null = null;
  protected wilaya: ZoneAvailability | null = null;
  protected moughataa: ZoneAvailability | null = null;
  protected commune: ZoneAvailability | null = null;

  ngOnInit(): void {
    void this.loadCoverage();
    const categories = this.categories();
    if (categories.length === 1 && this.auth.hasRole('MANAGER')) {
      this.category = categories[0];
      void this.loadWilayas();
    }
  }

  protected name(z: ZoneAvailability): string {
    return this.i18n.lang === 'ar' ? z.nameAr : z.nameFr;
  }

  protected suffix(z: ZoneAvailability): string {
    return z.status === 'FREE' ? '' : ` (${this.i18n.label('zoneStatus', z.status)})`;
  }

  /** Zone la plus précise choisie : commune, sinon moughataa entière, sinon wilaya entière. */
  private target(): ZoneAvailability | null {
    return this.commune ?? this.moughataa ?? this.wilaya;
  }

  protected canAdd(): boolean {
    return !!this.category && this.target()?.status === 'FREE';
  }

  protected async loadWilayas(): Promise<void> {
    this.wilaya = this.moughataa = this.commune = null;
    this.moughataas.set([]);
    this.communes.set([]);
    this.selected.set(null);
    if (!this.category) return;
    await this.guard(async () => this.wilayas.set(await this.api.coverageAvailability(this.category!)));
  }

  protected async loadMoughataas(): Promise<void> {
    this.moughataa = this.commune = null;
    this.communes.set([]);
    this.selected.set(this.wilaya);
    if (!this.wilaya || !this.category) return;
    await this.guard(async () => this.moughataas.set(await this.api.coverageAvailability(this.category!, this.wilaya!.id)));
  }

  protected async loadCommunes(): Promise<void> {
    this.commune = null;
    this.selected.set(this.target());
    if (!this.moughataa || !this.category) return;
    await this.guard(async () => this.communes.set(await this.api.coverageAvailability(this.category!, this.moughataa!.id)));
  }

  protected async add(): Promise<void> {
    const target = this.target();
    if (!target || !this.category) return;
    this.busy.set(true);
    try {
      const result = await this.api.addCoverage(this.category, target.id);
      this.snackBar.open(this.i18n.t('zones.added', { n: result.routedIncidents }), undefined,
        { duration: 5000, direction: this.i18n.dir });
      await Promise.all([this.loadCoverage(), this.loadWilayas()]);
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(c: Coverage): Promise<void> {
    if (!confirm(this.i18n.t('zones.confirmRemove'))) return;
    this.busy.set(true);
    try {
      await this.api.removeCoverage(c.id);
      await Promise.all([this.loadCoverage(), this.category ? this.loadWilayas() : Promise.resolve()]);
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    } finally {
      this.busy.set(false);
    }
  }

  private async loadCoverage(): Promise<void> {
    await this.guard(async () => this.coverage.set(await this.api.myCoverage()));
  }

  private async guard(action: () => Promise<void>): Promise<void> {
    try {
      await action();
      this.error.set(null);
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    }
  }
}
