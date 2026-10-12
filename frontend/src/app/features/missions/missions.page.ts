import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { debounceTime, merge } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N_PIPES } from '../../core/i18n/pipes';
import { ACTIVE_MISSION_STATUSES, MissionStatus, MissionSummary } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';
import { CATEGORY_ICONS, errorMessage } from '../../core/ui';
import { MissionStatusComponent } from '../../shared/status.component';

type Tab = 'ACTIVE' | 'DONE' | 'CANCELLED';
const TAB_STATUSES: Record<Tab, MissionStatus[]> = {
  ACTIVE: ACTIVE_MISSION_STATUSES,
  DONE: ['DONE'],
  CANCELLED: ['CANCELLED'],
};

/** Missions de l'organisme (toutes pour l'admin et l'État) : en cours, terminées, annulées. */
@Component({
  selector: 'app-missions-page',
  imports: [
    MatTableModule, MatPaginatorModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatTooltipModule,
    MissionStatusComponent, ...I18N_PIPES,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'nav.missions' | t }}</h1>
          <p class="subtitle">{{ 'missions.subtitle' | t }}</p>
        </div>
        <span class="spacer"></span>
        <mat-button-toggle-group [value]="tab()" (change)="setTab($event.value)" [attr.aria-label]="'nav.missions' | t">
          <mat-button-toggle value="ACTIVE">{{ 'missions.active' | t }}</mat-button-toggle>
          <mat-button-toggle value="DONE">{{ 'missions.done' | t }}</mat-button-toggle>
          <mat-button-toggle value="CANCELLED">{{ 'missions.cancelled' | t }}</mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      <div class="card table-card" [class.dim]="loading()">
        <div class="table-wrap">
          <table mat-table [dataSource]="rows()">
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>{{ 'filters.status' | t }}</th>
              <td mat-cell *matCellDef="let m">
                @if (m.priority === 'URGENT') {
                  <span class="badge urgent">{{ 'URGENT' | label: 'priority' }}</span>
                }
                <app-mission-status [status]="m.status" />
              </td>
            </ng-container>
            <ng-container matColumnDef="incident">
              <th mat-header-cell *matHeaderCellDef>{{ 'missions.incident' | t }}</th>
              <td mat-cell *matCellDef="let m">
                <span class="icon material-symbols-outlined" aria-hidden="true">{{ ICONS[m.category] }}</span>
                {{ m.category | label: 'category' }} · {{ m.place ?? '—' }}
                <span class="muted small"> · {{ 'detail.citizensShort' | t: { n: m.reportersCount } }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="driver">
              <th mat-header-cell *matHeaderCellDef>{{ 'detail.driver' | t }}</th>
              <td mat-cell *matCellDef="let m">{{ m.driverName }}</td>
            </ng-container>
            <ng-container matColumnDef="vehicle">
              <th mat-header-cell *matHeaderCellDef>{{ 'detail.vehicle' | t }}</th>
              <td mat-cell *matCellDef="let m">{{ m.vehiclePlate ?? '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="assigned">
              <th mat-header-cell *matHeaderCellDef>{{ 'missions.assigned' | t }}</th>
              <td mat-cell *matCellDef="let m" [title]="m.assignedAt | dateTime">{{ m.assignedAt | ago }}</td>
            </ng-container>
            <ng-container matColumnDef="due">
              <th mat-header-cell *matHeaderCellDef>{{ 'detail.due' | t }}</th>
              <td mat-cell *matCellDef="let m" [class.late]="isLate(m)">
                @if (m.dueAt) {
                  @if (isLate(m)) {
                    <span class="material-symbols-outlined late-icon" aria-hidden="true">schedule</span>
                  }
                  {{ m.dueAt | ago }}
                } @else {
                  —
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="end">
              <th mat-header-cell *matHeaderCellDef>{{ 'missions.finished' | t }}</th>
              <td mat-cell *matCellDef="let m">{{ m.completedAt | ago }}</td>
            </ng-container>
            <ng-container matColumnDef="proof">
              <th mat-header-cell *matHeaderCellDef>{{ 'missions.proof' | t }}</th>
              <td mat-cell *matCellDef="let m">
                @if (m.hasProof) {
                  <span class="material-symbols-outlined ok" [matTooltip]="'missions.proofOk' | t">photo_camera</span>
                } @else {
                  <span class="muted">—</span>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns()"></tr>
            <tr mat-row *matRowDef="let row; columns: columns()" class="clickable" tabindex="0"
                (click)="open(row)" (keydown.enter)="open(row)"></tr>
          </table>
        </div>
        @if (rows().length === 0 && !loading()) {
          <p class="empty">{{ 'missions.none' | t }}</p>
        }
        <mat-paginator [length]="total()" [pageIndex]="page" [pageSize]="size" [pageSizeOptions]="[20, 50]"
                       (page)="changePage($event)" />
      </div>
    </div>
  `,
  styles: `
    .table-card { padding: 0; overflow: hidden; }
    .table-card.dim { opacity: .6; }
    .icon { vertical-align: middle; color: var(--muted); font-size: 20px; }
    td .badge.urgent { margin-inline-end: 6px; }
    .late { color: var(--red); font-weight: 600; }
    .late-icon { font-size: 16px; vertical-align: middle; }
    .ok { color: var(--resolved); }
  `,
})
export class MissionsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);
  /** Indexé par la catégorie d'une ligne de table (typée any par mat-table). */
  protected readonly ICONS: Record<string, string> = CATEGORY_ICONS;

  protected readonly tab = signal<Tab>('ACTIVE');
  protected readonly rows = signal<MissionSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected page = 0;
  protected size = 20;

  protected readonly columns = signal<string[]>([]);

  ngOnInit(): void {
    this.setTab('ACTIVE');
    merge(this.realtime.incidentChanges, this.realtime.reconnected)
      .pipe(debounceTime(600), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.load());
  }

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
    this.page = 0;
    this.columns.set(tab === 'ACTIVE'
      ? ['status', 'incident', 'driver', 'vehicle', 'assigned', 'due']
      : ['status', 'incident', 'driver', 'vehicle', 'assigned', 'end', 'proof']);
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.api.missions(TAB_STATUSES[this.tab()], this.page, this.size);
      this.rows.set(result.items);
      this.total.set(result.totalElements);
      this.error.set(null);
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    } finally {
      this.loading.set(false);
    }
  }

  protected changePage(event: PageEvent): void {
    this.page = event.pageIndex;
    this.size = event.pageSize;
    void this.load();
  }

  protected isLate(m: MissionSummary): boolean {
    return !!m.dueAt && m.status !== 'DONE' && m.status !== 'CANCELLED' && new Date(m.dueAt).getTime() < Date.now();
  }

  /** L'annulation et le suivi se font depuis le détail de l'incident. */
  protected open(m: MissionSummary): void {
    void this.router.navigate(['/incidents', m.incidentId]);
  }
}
