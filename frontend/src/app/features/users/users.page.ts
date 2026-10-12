import { Clipboard } from '@angular/cdk/clipboard';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N_PIPES } from '../../core/i18n/pipes';
import { InvitationResponse, Role, UserSummary } from '../../core/models';
import { COLORS, errorMessage } from '../../core/ui';

/**
 * Utilisateurs :
 * - le responsable invite ses agents et chauffeurs (lien d'activation par SMS) et peut les bloquer ;
 * - l'admin national voit tous les comptes, les bloque, et peut afficher un NNI (action journalisée).
 */
@Component({
  selector: 'app-users-page',
  imports: [FormsModule, MatTableModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, ...I18N_PIPES],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'nav.users' | t }}</h1>
          <p class="subtitle">{{ (manager ? 'users.subtitleManager' : 'users.subtitleAdmin') | t }}</p>
        </div>
      </div>
      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      @if (manager) {
        <section class="card invite">
          <h2>{{ 'users.invite' | t }}</h2>
          <form class="filters" (ngSubmit)="invite()">
            <mat-form-field>
              <mat-label>{{ 'users.role' | t }}</mat-label>
              <mat-select name="role" [(ngModel)]="form.role">
                <mat-option value="DRIVER">{{ 'DRIVER' | label: 'role' }}</mat-option>
                <mat-option value="AGENT">{{ 'AGENT' | label: 'role' }}</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'users.firstName' | t }}</mat-label>
              <input matInput name="firstName" [(ngModel)]="form.firstName" required maxlength="60" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'users.lastName' | t }}</mat-label>
              <input matInput name="lastName" [(ngModel)]="form.lastName" required maxlength="60" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'login.phone' | t }}</mat-label>
              <input matInput name="phone" [(ngModel)]="form.phone" required inputmode="tel" [placeholder]="'login.phonePlaceholder' | t" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'users.email' | t }}</mat-label>
              <input matInput name="email" type="email" [(ngModel)]="form.email" />
            </mat-form-field>
            <button mat-flat-button type="submit" [disabled]="busy() || !form.firstName.trim() || !form.lastName.trim() || !form.phone.trim()">
              {{ 'users.send' | t }}
            </button>
          </form>
          @if (invitation(); as inv) {
            <div class="info-banner">
              {{ 'users.invited' | t: { name: inv.firstName + ' ' + inv.lastName, phone: inv.phone } }}
              <div class="link">
                <span class="mono">{{ inv.activationLink }}</span>
                <button mat-button type="button" (click)="copy(inv.activationLink)"><mat-icon>content_copy</mat-icon>{{ 'common.copy' | t }}</button>
              </div>
              <span class="small">{{ 'users.expires' | t: { date: (inv.expiresAt | dateTime) } }}</span>
            </div>
          }
        </section>
      } @else {
        <div class="filters">
          <mat-form-field>
            <mat-label>{{ 'users.role' | t }}</mat-label>
            <mat-select [(ngModel)]="roleFilter" (selectionChange)="load()">
              <mat-option [value]="null">{{ 'filters.all' | t }}</mat-option>
              @for (r of roles; track r) {
                <mat-option [value]="r">{{ r | label: 'role' }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
      }

      <section class="card table-card">
        <div class="table-wrap">
          <table mat-table [dataSource]="users()">
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>{{ 'users.name' | t }}</th>
              <td mat-cell *matCellDef="let u"><strong>{{ u.firstName }} {{ u.lastName }}</strong></td>
            </ng-container>
            <ng-container matColumnDef="role">
              <th mat-header-cell *matHeaderCellDef>{{ 'users.role' | t }}</th>
              <td mat-cell *matCellDef="let u">{{ u.role | label: 'role' }}</td>
            </ng-container>
            <ng-container matColumnDef="phone">
              <th mat-header-cell *matHeaderCellDef>{{ 'login.phone' | t }}</th>
              <td mat-cell *matCellDef="let u" class="mono">{{ u.phone }}</td>
            </ng-container>
            <ng-container matColumnDef="organization">
              <th mat-header-cell *matHeaderCellDef>{{ 'incidents.organization' | t }}</th>
              <td mat-cell *matCellDef="let u">{{ u.organizationName ?? '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="trust">
              <th mat-header-cell *matHeaderCellDef>{{ 'users.trust' | t }}</th>
              <td mat-cell *matCellDef="let u" [class.low]="u.role === 'CITIZEN' && u.trustScore < 50">
                {{ u.role === 'CITIZEN' ? u.trustScore : '—' }}
              </td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>{{ 'filters.status' | t }}</th>
              <td mat-cell *matCellDef="let u">
                <span class="badge" [style.--c]="u.status === 'ACTIVE' ? COLORS.resolved : COLORS.urgent">{{ u.status | label: 'userStatus' }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let u" class="actions">
                @if (canBlock(u)) {
                  <button mat-button (click)="toggle(u)" [disabled]="busy()">
                    {{ (u.status === 'ACTIVE' ? 'users.block' : 'users.unblock') | t }}
                  </button>
                }
                @if (!manager && u.role === 'CITIZEN') {
                  @if (nni()[u.id]; as value) {
                    <span class="mono">{{ value }}</span>
                  } @else {
                    <button mat-button (click)="showNni(u)">{{ 'users.showNni' | t }}</button>
                  }
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        @if (users().length === 0) {
          <p class="empty">{{ 'users.none' | t }}</p>
        }
      </section>
    </div>
  `,
  styles: `
    .invite { margin-bottom: 16px; }
    .link { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 6px 0; }
    .table-card { padding: 0; overflow: hidden; }
    .low { color: var(--red); font-weight: 600; }
    .actions { white-space: nowrap; }
  `,
})
export class UsersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly clipboard = inject(Clipboard);
  private readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);

  protected readonly COLORS = COLORS;
  protected readonly manager = this.auth.hasRole('MANAGER');
  protected readonly roles: Role[] = ['CITIZEN', 'DRIVER', 'AGENT', 'MANAGER', 'AUTHORITY', 'ADMIN'];
  protected readonly columns = this.manager
    ? ['name', 'role', 'phone', 'status', 'actions']
    : ['name', 'role', 'phone', 'organization', 'trust', 'status', 'actions'];

  protected readonly users = signal<UserSummary[]>([]);
  protected readonly invitation = signal<InvitationResponse | null>(null);
  protected readonly nni = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected roleFilter: Role | null = null;
  protected form = { role: 'DRIVER' as Role, firstName: '', lastName: '', phone: '', email: '' };

  protected readonly me = computed(() => this.auth.user()?.id);

  ngOnInit(): void {
    void this.load();
  }

  protected canBlock(u: UserSummary): boolean {
    if (u.id === this.me()) return false;
    return this.manager ? u.role === 'AGENT' || u.role === 'DRIVER' : true;
  }

  protected async load(): Promise<void> {
    try {
      this.users.set(await this.api.users(this.manager ? null : this.roleFilter));
      this.error.set(null);
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    }
  }

  protected async invite(): Promise<void> {
    await this.run(async () => {
      const inv = await this.api.invite({
        firstName: this.form.firstName.trim(), lastName: this.form.lastName.trim(), phone: this.form.phone.trim(),
        role: this.form.role, email: this.form.email.trim() || null,
      });
      this.invitation.set(inv);
      this.form = { role: this.form.role, firstName: '', lastName: '', phone: '', email: '' };
    });
  }

  protected async toggle(u: UserSummary): Promise<void> {
    const next = u.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
    if (next === 'BLOCKED' && !confirm(this.i18n.t('users.confirmBlock', { name: `${u.firstName} ${u.lastName}` }))) return;
    await this.run(async () => {
      await this.api.setUserStatus(u.id, next);
      await this.load();
    });
  }

  /** Le NNI n'est affiché qu'à l'admin, et chaque consultation est enregistrée dans le journal d'audit. */
  protected async showNni(u: UserSummary): Promise<void> {
    if (!confirm(this.i18n.t('users.nniWarning'))) return;
    await this.run(async () => {
      const { nni } = await this.api.userNni(u.id);
      this.nni.update((map) => ({ ...map, [u.id]: nni }));
    });
  }

  protected copy(text: string): void {
    this.clipboard.copy(text);
    this.snackBar.open(this.i18n.t('common.copied'), undefined, { duration: 2000, direction: this.i18n.dir });
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
