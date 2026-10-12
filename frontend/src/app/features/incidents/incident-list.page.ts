import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, merge } from 'rxjs';

import { ApiService, IncidentFilter } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N_PIPES } from '../../core/i18n/pipes';
import { AdminUnit, CATEGORIES, Category, IncidentStatus, IncidentSummary, Priority, STATUSES } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';
import { CATEGORY_ICONS, errorMessage, saveFile, toCsv, today } from '../../core/ui';
import { IncidentStatusComponent } from '../../shared/status.component';

/** Liste des incidents (cahier des charges §7.3) : table filtrable, tri URGENT d'abord, export CSV. */
@Component({
  selector: 'app-incident-list-page',
  imports: [
    FormsModule, MatTableModule, MatPaginatorModule, MatFormFieldModule, MatSelectModule, MatInputModule,
    MatDatepickerModule, MatSlideToggleModule, MatButtonModule, MatIconModule, IncidentStatusComponent, ...I18N_PIPES,
  ],
  templateUrl: './incident-list.page.html',
  styles: `
    .icon { vertical-align: middle; color: var(--muted); font-size: 20px; margin-inline-end: 6px; }
    .count { font-variant-numeric: tabular-nums; }
    .table-card { padding: 0; overflow: hidden; }
    .table-card.dim { opacity: .6; }
    .date-range { width: 260px !important; }
  `,
})
export class IncidentListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  /** Indexé par la catégorie d'une ligne de table (typée any par mat-table). */
  protected readonly ICONS: Record<string, string> = CATEGORY_ICONS;
  protected readonly STATUSES = STATUSES;
  protected readonly national = this.auth.hasRole('ADMIN', 'AUTHORITY');
  protected readonly columns = this.national
    ? ['status', 'category', 'place', 'reporters', 'organization', 'first', 'last']
    : ['status', 'category', 'place', 'reporters', 'first', 'last'];

  protected category: Category | null = null;
  protected statuses: IncidentStatus[] = [];
  protected priority: Priority | null = null;
  protected zone: string | null = null;
  protected from: Date | null = null;
  protected to: Date | null = null;
  protected unassigned = false;
  protected page = 0;
  protected size = 20;

  protected readonly categories = computed<Category[]>(() => this.auth.user()?.organization?.categories ?? CATEGORIES);
  protected readonly zones = signal<AdminUnit[]>([]);
  protected readonly rows = signal<IncidentSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly exporting = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.api.adminUnits('MOUGHATAA').then((list) => this.zones.set(list)).catch(() => undefined);
    // Liens du menu (?category=ROAD_HOLE) et du tableau de bord (?priority=URGENT)
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.category = (params.get('category') as Category) ?? null;
      this.priority = (params.get('priority') as Priority) ?? null;
      this.statuses = (params.get('status')?.split(',') ?? []) as IncidentStatus[];
      this.unassigned = params.get('unassigned') === 'true';
      this.page = 0;
      void this.load();
    });
    merge(this.realtime.incidentChanges, this.realtime.reconnected)
      .pipe(debounceTime(600), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.load());
  }

  private filter(): IncidentFilter {
    const end = this.to ? new Date(this.to.getTime() + 86_400_000) : null; // date de fin incluse
    return {
      status: this.statuses, priority: this.priority, category: this.category, zone: this.zone,
      from: this.from?.toISOString() ?? null, to: end?.toISOString() ?? null, unassigned: this.unassigned || null,
    };
  }

  protected applyFilters(): void {
    this.page = 0;
    void this.load();
  }

  protected reset(): void {
    this.category = this.priority = this.zone = this.from = this.to = null;
    this.statuses = [];
    this.unassigned = false;
    void this.router.navigate([], { queryParams: {} });
    this.applyFilters();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.api.incidents(this.filter(), this.page, this.size);
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

  protected open(row: IncidentSummary): void {
    void this.router.navigate(['/incidents', row.id]);
  }

  /** Export CSV de tous les incidents du filtre courant (par pages de 200, 5 000 au plus). */
  protected async exportCsv(): Promise<void> {
    this.exporting.set(true);
    try {
      const all: IncidentSummary[] = [];
      for (let page = 0; page < 25; page++) {
        const result = await this.api.incidents(this.filter(), page, 200);
        all.push(...result.items);
        if (page + 1 >= result.totalPages) break;
      }
      const t = (key: Parameters<I18nService['t']>[0]) => this.i18n.t(key);
      const csv = toCsv(
        ['id', t('csv.category'), t('csv.status'), t('csv.priority'), t('csv.place'), t('csv.reporters'),
          t('csv.organization'), 'latitude', 'longitude', t('csv.first'), t('csv.last'), t('csv.resolved')],
        all.map((i) => [i.id, this.i18n.label('category', i.category), this.i18n.label('status', i.status),
          this.i18n.label('priority', i.priority), i.place, i.reportersCount, i.organizationName, i.latitude, i.longitude,
          i.firstReportedAt, i.lastReportedAt, i.resolvedAt]));
      saveFile(csv, `balagh-incidents-${today()}.csv`);
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    } finally {
      this.exporting.set(false);
    }
  }
}
