import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N_PIPES } from '../../core/i18n/pipes';
import { CATEGORIES, Category, Coverage, Organization } from '../../core/models';
import { errorMessage } from '../../core/ui';

/** Zones d'intervention de tous les organismes ; l'admin libère ou transfère une zone en cas de litige. */
@Component({
  selector: 'app-coverage-page',
  imports: [FormsModule, MatTableModule, MatButtonModule, MatFormFieldModule, MatSelectModule, MatInputModule, ...I18N_PIPES],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'nav.coverage' | t }}</h1>
          <p class="subtitle">{{ 'coverage.subtitle' | t }}</p>
        </div>
      </div>
      <div class="filters">
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

      @if (editing(); as c) {
        <section class="card panel">
          <h2>{{ 'coverage.manage' | t }} : {{ c.organizationName }} · {{ c.category | label: 'category' }} ·
            {{ c.commune ?? c.moughataa ?? c.wilaya }}</h2>
          <div class="filters">
            <mat-form-field class="wide">
              <mat-label>{{ 'coverage.reason' | t }}</mat-label>
              <input matInput [(ngModel)]="reason" required />
            </mat-form-field>
            <button mat-stroked-button (click)="release(c)" [disabled]="busy() || !reason.trim()">{{ 'coverage.release' | t }}</button>
            <mat-form-field>
              <mat-label>{{ 'coverage.transferTo' | t }}</mat-label>
              <mat-select [(ngModel)]="target">
                @for (o of organizations(); track o.id) {
                  @if (o.id !== c.organizationId && o.status === 'ACTIVE') {
                    <mat-option [value]="o.id">{{ o.name }}</mat-option>
                  }
                }
              </mat-select>
            </mat-form-field>
            <button mat-flat-button (click)="transfer(c)" [disabled]="busy() || !reason.trim() || !target">{{ 'coverage.transfer' | t }}</button>
            <button mat-button (click)="editing.set(null)">{{ 'common.cancel' | t }}</button>
          </div>
        </section>
      }

      <section class="card table-card">
        <div class="table-wrap">
          <table mat-table [dataSource]="rows()">
            <ng-container matColumnDef="organization">
              <th mat-header-cell *matHeaderCellDef>{{ 'incidents.organization' | t }}</th>
              <td mat-cell *matCellDef="let c"><strong>{{ c.organizationName }}</strong></td>
            </ng-container>
            <ng-container matColumnDef="category">
              <th mat-header-cell *matHeaderCellDef>{{ 'filters.category' | t }}</th>
              <td mat-cell *matCellDef="let c">{{ c.category | label: 'category' }}</td>
            </ng-container>
            <ng-container matColumnDef="zone">
              <th mat-header-cell *matHeaderCellDef>{{ 'filters.zone' | t }}</th>
              <td mat-cell *matCellDef="let c">{{ c.wilaya }}@if (c.moughataa) { › {{ c.moughataa }} }@if (c.commune) { › {{ c.commune }} }</td>
            </ng-container>
            <ng-container matColumnDef="since">
              <th mat-header-cell *matHeaderCellDef>{{ 'coverage.since' | t }}</th>
              <td mat-cell *matCellDef="let c">{{ c.createdAt | dateTime }}</td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>{{ 'filters.status' | t }}</th>
              <td mat-cell *matCellDef="let c">
                <span class="badge" [style.--c]="c.active ? 'var(--resolved)' : 'var(--muted)'">{{ (c.active ? 'zones.active' : 'zones.released') | t }}</span>
                @if (c.releaseReason) { <div class="muted small">{{ c.releaseReason }}</div> }
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let c">
                @if (admin && c.active) {
                  <button mat-button (click)="edit(c)">{{ 'coverage.manage' | t }}</button>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        @if (rows().length === 0) {
          <p class="empty">{{ 'zones.none' | t }}</p>
        }
      </section>
    </div>
  `,
  styles: `
    .panel { margin-bottom: 16px; }
    .wide { width: 320px !important; }
    .table-card { padding: 0; overflow: hidden; }
  `,
})
export class CoveragePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);
  protected readonly admin = inject(AuthService).hasRole('ADMIN');

  protected readonly categories = CATEGORIES;
  protected readonly columns = ['organization', 'category', 'zone', 'since', 'status', 'actions'];
  protected readonly rows = signal<Coverage[]>([]);
  protected readonly organizations = signal<Organization[]>([]);
  protected readonly editing = signal<Coverage | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected category: Category | null = null;
  protected reason = '';
  protected target: string | null = null;

  ngOnInit(): void {
    void this.load();
    if (this.admin) void this.api.organizations().then((list) => this.organizations.set(list)).catch(() => undefined);
  }

  protected async load(): Promise<void> {
    try {
      this.rows.set(await this.api.allCoverage(this.category));
      this.error.set(null);
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    }
  }

  protected edit(c: Coverage): void {
    this.editing.set(c);
    this.reason = '';
    this.target = null;
  }

  protected release(c: Coverage): Promise<void> {
    return this.run(() => this.api.releaseCoverage(c.id, this.reason.trim()));
  }

  protected transfer(c: Coverage): Promise<void> {
    return this.run(() => this.api.transferCoverage(c.id, this.target!, this.reason.trim()));
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.editing.set(null);
      await this.load();
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    } finally {
      this.busy.set(false);
    }
  }
}
