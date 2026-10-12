import { Component, inject, OnInit, signal } from '@angular/core';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';

import { ApiService } from '../../core/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N_PIPES } from '../../core/i18n/pipes';
import { AuditItem } from '../../core/models';
import { errorMessage } from '../../core/ui';

/** Journal d'audit : qui a fait quoi et quand (assignations, rejets, zones, NNI consultés...). */
@Component({
  selector: 'app-audit-page',
  imports: [MatTableModule, MatPaginatorModule, ...I18N_PIPES],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'nav.audit' | t }}</h1>
          <p class="subtitle">{{ 'audit.subtitle' | t }}</p>
        </div>
      </div>
      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }
      <section class="card table-card">
        <div class="table-wrap">
          <table mat-table [dataSource]="rows()">
            <ng-container matColumnDef="date">
              <th mat-header-cell *matHeaderCellDef>{{ 'audit.date' | t }}</th>
              <td mat-cell *matCellDef="let a" class="nowrap">{{ a.createdAt | dateTime }}</td>
            </ng-container>
            <ng-container matColumnDef="action">
              <th mat-header-cell *matHeaderCellDef>{{ 'audit.action' | t }}</th>
              <td mat-cell *matCellDef="let a"><strong class="mono">{{ a.action }}</strong></td>
            </ng-container>
            <ng-container matColumnDef="entity">
              <th mat-header-cell *matHeaderCellDef>{{ 'audit.entity' | t }}</th>
              <td mat-cell *matCellDef="let a">{{ a.entityType }}<div class="mono muted">{{ a.entityId ?? '' }}</div></td>
            </ng-container>
            <ng-container matColumnDef="actor">
              <th mat-header-cell *matHeaderCellDef>{{ 'audit.actor' | t }}</th>
              <td mat-cell *matCellDef="let a" class="mono">{{ a.actorId ?? ('audit.system' | t) }}</td>
            </ng-container>
            <ng-container matColumnDef="details">
              <th mat-header-cell *matHeaderCellDef>{{ 'audit.details' | t }}</th>
              <td mat-cell *matCellDef="let a">{{ a.details ?? '' }}</td>
            </ng-container>
            <ng-container matColumnDef="ip">
              <th mat-header-cell *matHeaderCellDef>IP</th>
              <td mat-cell *matCellDef="let a" class="mono">{{ a.ip ?? '' }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        <mat-paginator [length]="total()" [pageIndex]="page" [pageSize]="50" [pageSizeOptions]="[50, 100]" (page)="changePage($event)" />
      </section>
    </div>
  `,
  styles: `
    .table-card { padding: 0; overflow: hidden; }
    .nowrap { white-space: nowrap; }
  `,
})
export class AuditPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);

  protected readonly columns = ['date', 'action', 'entity', 'actor', 'details', 'ip'];
  protected readonly rows = signal<AuditItem[]>([]);
  protected readonly total = signal(0);
  protected readonly error = signal<string | null>(null);
  protected page = 0;
  private size = 50;

  ngOnInit(): void {
    void this.load();
  }

  protected changePage(event: PageEvent): void {
    this.page = event.pageIndex;
    this.size = event.pageSize;
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const result = await this.api.audit(this.page, this.size);
      this.rows.set(result.items);
      this.total.set(result.totalElements);
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    }
  }
}
