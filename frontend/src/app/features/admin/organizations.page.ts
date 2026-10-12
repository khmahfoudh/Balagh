import { Clipboard } from '@angular/cdk/clipboard';
import { Component, inject, OnInit, signal } from '@angular/core';
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
import { CATEGORIES, Category, CreateOrganizationResponse, Organization, OrgStatus, OrgType } from '../../core/models';
import { COLORS, errorMessage } from '../../core/ui';

const STATUS_COLORS: Record<OrgStatus, string> = { ACTIVE: COLORS.resolved, INVITED: COLORS.new, SUSPENDED: COLORS.urgent };

/**
 * Organismes (cahier des charges §5) : l'admin crée l'organisme et invite son responsable (statut INVITÉ,
 * puis ACTIF à l'activation), peut le suspendre (ses zones sont libérées) ou le réactiver. L'État consulte.
 */
@Component({
  selector: 'app-organizations-page',
  imports: [FormsModule, MatTableModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, ...I18N_PIPES],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'nav.organizations' | t }}</h1>
          <p class="subtitle">{{ 'orgs.subtitle' | t }}</p>
        </div>
        <span class="spacer"></span>
        @if (admin) {
          <button mat-flat-button (click)="showForm.set(!showForm())"><mat-icon>add</mat-icon>{{ 'orgs.new' | t }}</button>
        }
      </div>
      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      @if (showForm()) {
        <section class="card form-card">
          <h2>{{ 'orgs.new' | t }}</h2>
          <form (ngSubmit)="create()">
            <div class="filters">
              <mat-form-field class="wide">
                <mat-label>{{ 'orgs.name' | t }}</mat-label>
                <input matInput name="name" [(ngModel)]="form.name" required maxlength="120" />
              </mat-form-field>
              <mat-form-field>
                <mat-label>{{ 'orgs.type' | t }}</mat-label>
                <mat-select name="type" [(ngModel)]="form.type">
                  @for (t of types; track t) {
                    <mat-option [value]="t">{{ t | label: 'orgType' }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field>
                <mat-label>{{ 'orgs.categories' | t }}</mat-label>
                <mat-select name="categories" [(ngModel)]="form.categories" multiple>
                  @for (c of categories; track c) {
                    <mat-option [value]="c">{{ c | label: 'category' }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field>
                <mat-label>{{ 'orgs.contactPhone' | t }}</mat-label>
                <input matInput name="contactPhone" [(ngModel)]="form.contactPhone" inputmode="tel" />
              </mat-form-field>
              <mat-form-field>
                <mat-label>{{ 'orgs.contactEmail' | t }}</mat-label>
                <input matInput name="contactEmail" type="email" [(ngModel)]="form.contactEmail" />
              </mat-form-field>
              <mat-form-field>
                <mat-label>{{ 'orgs.contract' | t }}</mat-label>
                <input matInput name="contract" [(ngModel)]="form.contractReference" />
              </mat-form-field>
            </div>
            <h3>{{ 'orgs.manager' | t }}</h3>
            <div class="filters">
              <mat-form-field>
                <mat-label>{{ 'users.firstName' | t }}</mat-label>
                <input matInput name="mFirst" [(ngModel)]="form.manager.firstName" required />
              </mat-form-field>
              <mat-form-field>
                <mat-label>{{ 'users.lastName' | t }}</mat-label>
                <input matInput name="mLast" [(ngModel)]="form.manager.lastName" required />
              </mat-form-field>
              <mat-form-field>
                <mat-label>{{ 'login.phone' | t }}</mat-label>
                <input matInput name="mPhone" [(ngModel)]="form.manager.phone" required inputmode="tel" />
              </mat-form-field>
              <mat-form-field>
                <mat-label>{{ 'users.email' | t }}</mat-label>
                <input matInput name="mEmail" type="email" [(ngModel)]="form.manager.email" />
              </mat-form-field>
            </div>
            <button mat-flat-button type="submit" [disabled]="busy() || !valid()">{{ 'orgs.createAndInvite' | t }}</button>
          </form>
        </section>
      }

      @if (created(); as c) {
        <div class="info-banner">
          {{ 'orgs.created' | t: { name: c.organization.name } }}
          <div class="link">
            <span class="mono">{{ c.managerInvitation.activationLink }}</span>
            <button mat-button (click)="copy(c.managerInvitation.activationLink)"><mat-icon>content_copy</mat-icon>{{ 'common.copy' | t }}</button>
          </div>
        </div>
      }

      <section class="card table-card">
        <div class="table-wrap">
          <table mat-table [dataSource]="organizations()">
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>{{ 'orgs.name' | t }}</th>
              <td mat-cell *matCellDef="let o"><strong>{{ o.name }}</strong><div class="muted small">{{ o.contractReference ?? '' }}</div></td>
            </ng-container>
            <ng-container matColumnDef="type">
              <th mat-header-cell *matHeaderCellDef>{{ 'orgs.type' | t }}</th>
              <td mat-cell *matCellDef="let o">{{ o.type | label: 'orgType' }}</td>
            </ng-container>
            <ng-container matColumnDef="categories">
              <th mat-header-cell *matHeaderCellDef>{{ 'orgs.categories' | t }}</th>
              <td mat-cell *matCellDef="let o">
                {{ categoryNames(o) }}
              </td>
            </ng-container>
            <ng-container matColumnDef="contact">
              <th mat-header-cell *matHeaderCellDef>{{ 'orgs.contact' | t }}</th>
              <td mat-cell *matCellDef="let o">{{ o.contactPhone ?? '—' }}<div class="muted small">{{ o.contactEmail ?? '' }}</div></td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>{{ 'filters.status' | t }}</th>
              <td mat-cell *matCellDef="let o"><span class="badge" [style.--c]="color(o.status)">{{ o.status | label: 'orgStatus' }}</span></td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let o">
                @if (admin && o.status === 'ACTIVE') {
                  <button mat-button (click)="setStatus(o, 'SUSPENDED')" [disabled]="busy()">{{ 'orgs.suspend' | t }}</button>
                }
                @if (admin && o.status === 'SUSPENDED') {
                  <button mat-button (click)="setStatus(o, 'ACTIVE')" [disabled]="busy()">{{ 'orgs.reactivate' | t }}</button>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
      </section>
    </div>
  `,
  styles: `
    .form-card { margin-bottom: 16px; }
    .form-card h3 { font-size: 14px; margin: 8px 0; }
    .wide { width: 320px !important; }
    .link { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
    .table-card { padding: 0; overflow: hidden; }
  `,
})
export class OrganizationsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly clipboard = inject(Clipboard);
  private readonly i18n = inject(I18nService);
  protected readonly admin = inject(AuthService).hasRole('ADMIN');

  protected readonly types: OrgType[] = ['CLEANING', 'SANITATION', 'ROADS', 'OTHER'];
  protected readonly categories = CATEGORIES;
  protected readonly columns = ['name', 'type', 'categories', 'contact', 'status', 'actions'];
  protected readonly organizations = signal<Organization[]>([]);
  protected readonly created = signal<CreateOrganizationResponse | null>(null);
  protected readonly showForm = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected form = this.emptyForm();

  ngOnInit(): void {
    void this.load();
  }

  protected categoryNames(o: Organization): string {
    return o.categories.map((c) => this.i18n.label('category', c)).join(', ');
  }

  protected color(status: OrgStatus): string {
    return STATUS_COLORS[status];
  }

  protected valid(): boolean {
    const f = this.form;
    return !!f.name.trim() && f.categories.length > 0 && !!f.manager.firstName.trim() && !!f.manager.lastName.trim()
      && !!f.manager.phone.trim();
  }

  protected async load(): Promise<void> {
    try {
      this.organizations.set(await this.api.organizations());
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    }
  }

  protected async create(): Promise<void> {
    const f = this.form;
    await this.run(async () => {
      this.created.set(await this.api.createOrganization({
        name: f.name.trim(), type: f.type, categories: f.categories, contactPhone: f.contactPhone.trim() || null,
        contactEmail: f.contactEmail.trim() || null, contractReference: f.contractReference.trim() || null,
        manager: { firstName: f.manager.firstName.trim(), lastName: f.manager.lastName.trim(), phone: f.manager.phone.trim(),
          email: f.manager.email.trim() || null },
      }));
      this.form = this.emptyForm();
      this.showForm.set(false);
      await this.load();
    });
  }

  protected async setStatus(o: Organization, status: OrgStatus): Promise<void> {
    let reason: string | null = null;
    if (status === 'SUSPENDED') {
      reason = prompt(this.i18n.t('orgs.suspendReason', { name: o.name }));
      if (!reason?.trim()) return;
    }
    await this.run(async () => {
      await this.api.setOrganizationStatus(o.id, status, reason);
      await this.load();
    });
  }

  protected copy(text: string): void {
    this.clipboard.copy(text);
    this.snackBar.open(this.i18n.t('common.copied'), undefined, { duration: 2000, direction: this.i18n.dir });
  }

  private emptyForm() {
    return {
      name: '', type: 'CLEANING' as OrgType, categories: [] as Category[], contactPhone: '', contactEmail: '',
      contractReference: '', manager: { firstName: '', lastName: '', phone: '', email: '' },
    };
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
