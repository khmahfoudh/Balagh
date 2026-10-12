import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { AlertService } from '../core/alert.service';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ALL_STAFF, NATIONAL, ORG_STAFF } from '../core/guards';
import { TranslationKey } from '../core/i18n/fr';
import { I18nService } from '../core/i18n/i18n.service';
import { I18N_PIPES } from '../core/i18n/pipes';
import { NotificationItem, Role } from '../core/models';
import { RealtimeService } from '../core/realtime.service';

interface NavItem {
  path: string;
  query?: Record<string, string>;
  icon: string;
  label: TranslationKey;
  roles: Role[];
}

/** Menu latéral (maquettes 16 à 20) : chaque rôle ne voit que ses écrans. */
const NAV: NavItem[] = [
  { path: '/tableau-de-bord', icon: 'dashboard', label: 'nav.dashboard', roles: ALL_STAFF },
  { path: '/incidents', icon: 'report', label: 'nav.incidents', roles: ALL_STAFF },
  { path: '/incidents', query: { category: 'ROAD_HOLE' }, icon: 'add_road', label: 'nav.roads', roles: NATIONAL },
  { path: '/missions', icon: 'local_shipping', label: 'nav.missions', roles: ALL_STAFF },
  { path: '/equipes', icon: 'groups', label: 'nav.teams', roles: ORG_STAFF },
  { path: '/statistiques', icon: 'bar_chart', label: 'nav.stats', roles: ALL_STAFF },
  { path: '/mes-zones', icon: 'map', label: 'nav.myZones', roles: ORG_STAFF },
  { path: '/etat/performance', icon: 'leaderboard', label: 'nav.performance', roles: NATIONAL },
  { path: '/etat/exports', icon: 'download', label: 'nav.exports', roles: NATIONAL },
  { path: '/organismes', icon: 'apartment', label: 'nav.organizations', roles: NATIONAL },
  { path: '/zones', icon: 'layers', label: 'nav.coverage', roles: NATIONAL },
  { path: '/utilisateurs', icon: 'manage_accounts', label: 'nav.users', roles: ['MANAGER', 'ADMIN'] },
  { path: '/parametres', icon: 'tune', label: 'nav.settings', roles: ['ADMIN'] },
  { path: '/audit', icon: 'history', label: 'nav.audit', roles: ['ADMIN'] },
];

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatButtonModule, MatIconModule, MatMenuModule,
    MatBadgeModule, MatTooltipModule, MatDividerModule, ...I18N_PIPES,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  protected readonly alerts = inject(AlertService);
  protected readonly realtime = inject(RealtimeService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly mobile = toSignal(
    inject(BreakpointObserver).observe('(max-width: 960px)').pipe(map((state) => state.matches)), { initialValue: false });
  protected readonly menuOpen = signal(false);
  protected readonly unread = signal(0);
  protected readonly notifications = signal<NotificationItem[]>([]);

  protected readonly nav = computed(() => NAV.filter((item) => this.auth.hasRole(...item.roles)));
  /** « ONAS · Eau stagnante » pour un organisme, « Vue nationale » pour l'admin et l'État. */
  protected readonly context = computed(() => {
    const user = this.auth.user();
    if (!user?.organization) return this.i18n.t('shell.national');
    const categories = user.organization.categories.map((c) => this.i18n.label('category', c)).join(', ');
    return `${user.organization.name} · ${categories}`;
  });

  ngOnInit(): void {
    this.realtime.start();
    void this.refreshUnread();
    this.realtime.notifications.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((notification) => {
      this.unread.update((n) => n + 1);
      this.notifications.update((list) => [notification, ...list].slice(0, 15));
    });
    this.realtime.reconnected.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => void this.refreshUnread());
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.menuOpen.set(false));
  }

  protected async loadNotifications(): Promise<void> {
    try {
      this.notifications.set((await this.api.notifications(0, 15)).items);
    } catch {
      // la liste reste celle reçue en temps réel
    }
  }

  protected async markAllRead(): Promise<void> {
    await this.api.markAllRead().catch(() => undefined);
    this.unread.set(0);
    this.notifications.update((list) => list.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  }

  protected openNotification(notification: NotificationItem): void {
    if (notification.incidentId) void this.router.navigate(['/incidents', notification.incidentId]);
  }

  protected toggleSound(): void {
    if (this.alerts.soundReady() && this.alerts.soundWanted()) {
      this.alerts.disableSound();
    } else {
      void this.alerts.enableSound();
    }
  }

  protected async logout(): Promise<void> {
    this.realtime.stop();
    await this.auth.logout();
  }

  private async refreshUnread(): Promise<void> {
    try {
      this.unread.set((await this.api.unreadCount()).unread);
    } catch {
      // compteur inchangé
    }
  }
}
