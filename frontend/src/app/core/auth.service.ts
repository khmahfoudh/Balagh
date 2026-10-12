import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ConfigService } from './config.service';
import { Me, Role, TokenResponse } from './models';

const STORAGE_KEY = 'balagh.dashboard.session';

interface Session { accessToken: string; refreshToken: string; }

/**
 * Session du dashboard : connexion téléphone + mot de passe (app = DASHBOARD).
 * Le backend refuse les comptes citoyen et chauffeur (WRONG_APP).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);
  private readonly router = inject(Router);

  private session: Session | null = null;
  private refreshing: Promise<boolean> | null = null;

  readonly user = signal<Me | null>(null);
  readonly role = computed<Role | null>(() => this.user()?.role ?? null);
  /** Agent ou responsable : limité à son organisme. */
  readonly isOrgStaff = computed(() => this.role() === 'AGENT' || this.role() === 'MANAGER');
  /** Admin national ou État : toutes catégories, tous organismes. */
  readonly isNational = computed(() => this.role() === 'ADMIN' || this.role() === 'AUTHORITY');

  get accessToken(): string | null {
    return this.session?.accessToken ?? null;
  }

  async restore(): Promise<void> {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      // stockage du navigateur indisponible : pas de session à restaurer
    }
    if (!raw) return;
    this.session = JSON.parse(raw) as Session;
    try {
      this.user.set(await firstValueFrom(this.http.get<Me>(`${this.config.apiUrl}/me`)));
    } catch {
      this.clear();
    }
  }

  async login(phone: string, password: string): Promise<void> {
    this.startSession(await firstValueFrom(this.http.post<TokenResponse>(`${this.config.apiUrl}/auth/login`,
      { phone, password, app: 'DASHBOARD' })));
  }

  /** Après connexion ou activation d'un compte invité. */
  startSession(res: TokenResponse): void {
    this.store({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    this.user.set(res.user);
  }

  async logout(): Promise<void> {
    const refreshToken = this.session?.refreshToken;
    if (refreshToken) {
      await firstValueFrom(this.http.post(`${this.config.apiUrl}/auth/logout`, { refreshToken })).catch(() => undefined);
    }
    this.clear();
    await this.router.navigateByUrl('/login');
  }

  /** Renouvelle le JWT (15 min) avec le refresh token ; un seul appel à la fois. */
  refresh(): Promise<boolean> {
    if (!this.session) return Promise.resolve(false);
    if (!this.refreshing) {
      const refreshToken = this.session.refreshToken;
      this.refreshing = firstValueFrom(this.http.post<TokenResponse>(`${this.config.apiUrl}/auth/refresh`, { refreshToken }))
        .then((res) => {
          this.store({ accessToken: res.accessToken, refreshToken: res.refreshToken });
          this.user.set(res.user);
          return true;
        })
        .catch(() => false)
        .finally(() => (this.refreshing = null));
    }
    return this.refreshing;
  }

  clear(): void {
    this.session = null;
    this.user.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignoré
    }
  }

  hasRole(...roles: Role[]): boolean {
    const role = this.role();
    return role !== null && roles.includes(role);
  }

  private store(session: Session): void {
    this.session = session;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // session gardée en mémoire seulement
    }
  }
}
