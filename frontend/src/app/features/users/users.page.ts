import { Clipboard } from '@angular/cdk/clipboard';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
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
import { InvitationResponse, Organization, Role, UserSummary } from '../../core/models';
import { COLORS, errorMessage } from '../../core/ui';

/** Rôles rattachés à un organisme (les autres n'en ont pas : contrainte en base). */
const ORG_ROLES: Role[] = ['MANAGER', 'AGENT', 'DRIVER'];

interface UserForm {
  role: Role;
  organizationId: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  mode: 'INVITE' | 'PASSWORD';
  password: string;
}

interface EditForm {
  user: UserSummary;
  firstName: string;
  lastName: string;
  phone: string;
  role: Role;
  organizationId: string | null;
  password: string;
}

/**
 * Utilisateurs :
 * - admin national : crée un compte (invitation SMS ou mot de passe initial), modifie (nom, téléphone, rôle,
 *   organisme, mot de passe), suspend ou réactive, et peut afficher un NNI (action journalisée) ;
 * - responsable : invite et suspend ses agents et chauffeurs ;
 * - agent : invite et suspend les chauffeurs de son organisme.
 */
@Component({
  selector: 'app-users-page',
  imports: [
    FormsModule, MatTableModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, ...I18N_PIPES,
  ],
  templateUrl: './users.page.html',
  styles: `
    .panel { margin-bottom: 16px; }
    .panel h3 { font-size: 14px; margin: 4px 0 8px; }
    .link { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 6px 0; }
    .table-card { padding: 0; overflow: hidden; }
    .low { color: var(--red); font-weight: 600; }
    .actions { white-space: nowrap; }
    .mode { margin: 4px 0 12px; }
    .search { width: 260px !important; }
  `,
})
export class UsersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly clipboard = inject(Clipboard);
  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);

  protected readonly COLORS = COLORS;
  protected readonly admin = this.auth.hasRole('ADMIN');
  protected readonly manager = this.auth.hasRole('MANAGER');
  protected readonly agent = this.auth.hasRole('AGENT');
  protected readonly orgStaff = this.manager || this.agent;
  protected readonly filterRoles: Role[] = ['CITIZEN', 'DRIVER', 'AGENT', 'MANAGER', 'AUTHORITY', 'ADMIN'];
  /** Rôles qu'on peut créer ou inviter selon qui est connecté (les citoyens s'inscrivent seuls). */
  protected readonly creatableRoles: Role[] = this.admin ? ['AGENT', 'MANAGER', 'DRIVER', 'AUTHORITY', 'ADMIN']
    : this.manager ? ['DRIVER', 'AGENT'] : ['DRIVER'];
  protected readonly staffRoles: Role[] = ['AGENT', 'MANAGER', 'DRIVER', 'AUTHORITY', 'ADMIN'];
  protected readonly columns = this.orgStaff
    ? ['name', 'role', 'phone', 'status', 'actions']
    : ['name', 'role', 'phone', 'organization', 'trust', 'status', 'actions'];

  protected readonly users = signal<UserSummary[]>([]);
  protected readonly organizations = signal<Organization[]>([]);
  protected readonly invitation = signal<InvitationResponse | null>(null);
  protected readonly nni = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly showCreate = signal(!this.admin);
  protected readonly editing = signal<EditForm | null>(null);
  protected readonly search = signal('');
  protected readonly orgFilter = signal<string | null>(null);
  protected roleFilter: Role | null = null;
  protected form: UserForm = this.emptyForm();

  protected readonly me = computed(() => this.auth.user()?.id);
  /** Organismes où l'on peut rattacher un compte (pas les suspendus). */
  protected readonly assignableOrgs = computed(() => this.organizations().filter((o) => o.status !== 'SUSPENDED'));
  protected readonly visibleUsers = computed(() => {
    const query = this.search().trim().toLowerCase();
    const org = this.orgFilter();
    return this.users().filter((u) => (!org || u.organizationId === org)
      && (!query || `${u.firstName} ${u.lastName} ${u.phone}`.toLowerCase().includes(query)));
  });

  ngOnInit(): void {
    void this.load();
    if (this.admin) void this.api.organizations().then((list) => this.organizations.set(list)).catch(() => undefined);
  }

  protected needsOrg(role: Role): boolean {
    return ORG_ROLES.includes(role);
  }

  /** Les admins ne peuvent pas suspendre un autre admin (règle du backend), ni personne soi-même. */
  protected canBlock(u: UserSummary): boolean {
    if (u.id === this.me()) return false;
    if (this.agent) return u.role === 'DRIVER';
    if (this.manager) return u.role === 'AGENT' || u.role === 'DRIVER';
    return u.role !== 'ADMIN';
  }

  protected formValid(): boolean {
    const f = this.form;
    const base = !!f.firstName.trim() && !!f.lastName.trim() && !!f.phone.trim();
    if (!this.admin) return base;
    return base && (!this.needsOrg(f.role) || !!f.organizationId) && (f.mode === 'INVITE' || f.password.length >= 8);
  }

  protected async load(): Promise<void> {
    try {
      // Agent : seulement les chauffeurs ; responsable : toute son équipe ; admin : filtre par rôle
      this.users.set(await this.api.users(this.agent ? 'DRIVER' : this.manager ? null : this.roleFilter));
      this.error.set(null);
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    }
  }

  protected async submit(): Promise<void> {
    const f = this.form;
    const person = { firstName: f.firstName.trim(), lastName: f.lastName.trim(), phone: f.phone.trim(), email: f.email.trim() || null };
    await this.run(async () => {
      this.invitation.set(null);
      if (!this.admin) {
        this.invitation.set(await this.api.invite({ ...person, role: f.role }));
      } else {
        const result = await this.api.adminCreateUser({
          ...person, role: f.role, organizationId: this.needsOrg(f.role) ? f.organizationId : null,
          password: f.mode === 'PASSWORD' ? f.password : null,
        });
        if (result.invitation) this.invitation.set(result.invitation);
        if (result.user) this.toast(this.i18n.t('users.created', { name: `${person.firstName} ${person.lastName}` }));
        await this.load();
      }
      this.form = { ...this.emptyForm(), role: f.role, organizationId: f.organizationId, mode: f.mode };
    });
  }

  protected edit(u: UserSummary): void {
    this.editing.set({ user: u, firstName: u.firstName, lastName: u.lastName, phone: u.phone, role: u.role,
      organizationId: u.organizationId, password: '' });
    this.showCreate.set(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** N'envoie que ce qui a changé (null = inchangé côté backend). */
  protected async saveEdit(e: EditForm): Promise<void> {
    const u = e.user;
    const changed = <T>(value: T, before: T) => (value !== before ? value : null);
    const roleChanged = e.role !== u.role;
    const orgChanged = this.needsOrg(e.role) && e.organizationId !== u.organizationId;
    await this.run(async () => {
      await this.api.adminUpdateUser(u.id, {
        firstName: changed(e.firstName.trim(), u.firstName),
        lastName: changed(e.lastName.trim(), u.lastName),
        phone: changed(e.phone.trim(), u.phone),
        role: roleChanged ? e.role : null,
        organizationId: roleChanged || orgChanged ? (this.needsOrg(e.role) ? e.organizationId : null) : null,
        password: e.password ? e.password : null,
      });
      this.editing.set(null);
      this.toast(this.i18n.t('users.updated'));
      await this.load();
    });
  }

  protected editValid(e: EditForm): boolean {
    return !!e.firstName.trim() && !!e.lastName.trim() && !!e.phone.trim()
      && (!this.needsOrg(e.role) || !!e.organizationId) && (!e.password || e.password.length >= 8);
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
    this.toast(this.i18n.t('common.copied'));
  }

  private toast(message: string): void {
    this.snackBar.open(message, undefined, { duration: 4000, direction: this.i18n.dir });
  }

  private emptyForm(): UserForm {
    return { role: this.creatableRoles[0], organizationId: null, firstName: '', lastName: '', phone: '', email: '',
      mode: 'INVITE', password: '' };
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
