import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { debounceTime, merge } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N_PIPES } from '../../core/i18n/pipes';
import { TeamMember, Vehicle } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';
import { COLORS, errorMessage } from '../../core/ui';

const AVAILABILITY_COLORS: Record<string, string> = {
  DISPONIBLE: COLORS.resolved,
  EN_MISSION: COLORS.progress,
  BLOQUE: COLORS.muted,
  HORS_SERVICE: COLORS.urgent,
  INACTIF: COLORS.muted,
};

/** Équipes et véhicules (cahier des charges §7.3) : chauffeurs, disponibilité, missions en cours, véhicules. */
@Component({
  selector: 'app-teams-page',
  imports: [
    FormsModule, RouterLink, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSlideToggleModule,
    ...I18N_PIPES,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'nav.teams' | t }}</h1>
          <p class="subtitle">{{ 'teams.subtitle' | t }}</p>
        </div>
      </div>
      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      <div class="grid">
        <section class="card">
          <h2>{{ 'teams.drivers' | t: { n: drivers().length } }}</h2>
          @for (d of drivers(); track d.id) {
            <div class="item">
              <span class="material-symbols-outlined avatar" aria-hidden="true">person</span>
              <div class="grow">
                <div class="name">{{ d.name }}</div>
                <div class="muted small">{{ d.phone }}</div>
                @if (d.currentMission; as m) {
                  <a class="small" [routerLink]="['/incidents', m.incidentId]">
                    {{ m.category | label: 'category' }} · {{ m.place ?? '—' }} · {{ m.status | label: 'mission' }}
                  </a>
                  @if (d.activeMissions > 1) {
                    <div class="muted small">{{ 'teams.moreMissions' | t: { n: d.activeMissions - 1 } }}</div>
                  }
                }
              </div>
              <span class="badge" [style.--c]="color(d.availability)">{{ d.availability | label: 'availability' }}</span>
            </div>
          } @empty {
            <p class="empty">{{ 'teams.noDrivers' | t }}</p>
          }
          @if (auth.hasRole('MANAGER', 'AGENT')) {
            <a mat-button routerLink="/utilisateurs"><mat-icon>person_add</mat-icon>{{ 'teams.inviteDriver' | t }}</a>
          }
        </section>

        <section class="card">
          <h2>{{ 'teams.vehicles' | t: { n: vehicles().length } }}</h2>
          @for (v of vehicles(); track v.id) {
            <div class="item">
              <span class="material-symbols-outlined avatar" aria-hidden="true">local_shipping</span>
              <div class="grow">
                <div class="name">{{ v.plate }}</div>
                <div class="muted small">{{ v.type }}</div>
              </div>
              @if (auth.hasRole('MANAGER') && v.active) {
                <mat-slide-toggle [checked]="!v.outOfService" (change)="toggleService(v, !$event.checked)">
                  {{ 'teams.inService' | t }}
                </mat-slide-toggle>
              }
              <span class="badge" [style.--c]="color(v.availability)">{{ v.availability | label: 'vehicle' }}</span>
            </div>
          } @empty {
            <p class="empty">{{ 'teams.noVehicles' | t }}</p>
          }
          @if (auth.hasRole('MANAGER')) {
            <form class="add" (ngSubmit)="addVehicle()">
              <mat-form-field>
                <mat-label>{{ 'teams.plate' | t }}</mat-label>
                <input matInput name="plate" [(ngModel)]="plate" maxlength="20" required placeholder="NKC-1234" />
              </mat-form-field>
              <mat-form-field>
                <mat-label>{{ 'teams.type' | t }}</mat-label>
                <input matInput name="type" [(ngModel)]="type" maxlength="20" required [placeholder]="'teams.typeHint' | t" />
              </mat-form-field>
              <button mat-flat-button type="submit" [disabled]="busy() || !plate.trim() || !type.trim()">
                {{ 'teams.addVehicle' | t }}
              </button>
            </form>
          }
        </section>
      </div>
    </div>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; align-items: start; }
    .item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .avatar { color: var(--muted); background: var(--bg); border-radius: 50%; padding: 6px; }
    .name { font-weight: 600; }
    .add { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 12px; }
    .add mat-form-field { width: 150px; }
  `,
})
export class TeamsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);

  protected readonly drivers = signal<TeamMember[]>([]);
  protected readonly vehicles = signal<Vehicle[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected plate = '';
  protected type = '';

  ngOnInit(): void {
    void this.load();
    merge(this.realtime.incidentChanges, this.realtime.reconnected)
      .pipe(debounceTime(800), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.load());
  }

  protected color(availability: string): string {
    return AVAILABILITY_COLORS[availability] ?? COLORS.muted;
  }

  protected async load(): Promise<void> {
    try {
      const [drivers, vehicles] = await Promise.all([this.api.drivers(), this.api.vehicles()]);
      this.drivers.set(drivers);
      this.vehicles.set(vehicles);
      this.error.set(null);
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    }
  }

  protected async addVehicle(): Promise<void> {
    await this.run(async () => {
      await this.api.addVehicle(this.plate.trim().toUpperCase(), this.type.trim());
      this.plate = this.type = '';
    }, 'teams.vehicleAdded');
  }

  protected async toggleService(v: Vehicle, outOfService: boolean): Promise<void> {
    await this.run(() => this.api.updateVehicle(v.id, { outOfService }), 'common.saved');
  }

  private async run(action: () => Promise<unknown>, success: 'teams.vehicleAdded' | 'common.saved'): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.snackBar.open(this.i18n.t(success), undefined, { duration: 3000, direction: this.i18n.dir });
    } catch (e) {
      this.snackBar.open(errorMessage(e, this.i18n), this.i18n.t('common.close'), { duration: 8000, direction: this.i18n.dir });
    } finally {
      this.busy.set(false);
      await this.load();
    }
  }
}
