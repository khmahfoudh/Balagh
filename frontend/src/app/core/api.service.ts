import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ConfigService } from './config.service';
import {
  AdminCreateUserResponse, AdminUnit, AuditItem, Category, Coverage, CreateOrganizationResponse, HeatPoint, IncidentDetail, IncidentStatus,
  IncidentSummary, InvitationPreview, InvitationResponse, MissionStatus, MissionSummary, NotificationItem,
  Organization, OrgPerformance, OrgStatus, OrgType, OtpSentResponse, Page, Priority, RejectionReason, Role, Setting,
  StatsSummary, TeamMember, TokenResponse, UserSummary, Vehicle, ZoneAvailability,
} from './models';

export interface IncidentFilter {
  status?: IncidentStatus[];
  priority?: Priority | null;
  category?: Category | null;
  zone?: string | null;
  from?: string | null;
  to?: string | null;
  unassigned?: boolean | null;
}

type ParamValue = string | number | boolean | readonly string[] | null | undefined;

/** Construit les paramètres de requête en ignorant les valeurs vides (les listes deviennent ?a=1&a=2). */
function params(values: Record<string, ParamValue>): HttpParams {
  let result = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) result = result.append(key, item);
    } else {
      result = result.set(key, String(value));
    }
  }
  return result;
}

/** Toutes les routes du backend utilisées par le dashboard (cahier des charges §10). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);

  private get<T>(path: string, query: Record<string, ParamValue> = {}): Promise<T> {
    return firstValueFrom(this.http.get<T>(this.config.apiUrl + path, { params: params(query) }));
  }

  private send<T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body: unknown = null): Promise<T> {
    return firstValueFrom(this.http.request<T>(method, this.config.apiUrl + path, { body }));
  }

  /** Fichier (CSV, GeoJSON) téléchargé avec le jeton. */
  download(path: string, query: Record<string, ParamValue> = {}): Promise<Blob> {
    return firstValueFrom(this.http.get(this.config.apiUrl + path, { params: params(query), responseType: 'blob' }));
  }

  // ---------- Incidents ----------
  incidents(filter: IncidentFilter, page = 0, size = 20): Promise<Page<IncidentSummary>> {
    return this.get('/incidents', { ...filter, page, size });
  }
  incident(id: string): Promise<IncidentDetail> {
    return this.get(`/incidents/${id}`);
  }
  confirm(id: string): Promise<IncidentSummary> {
    return this.send('PATCH', `/incidents/${id}/confirm`);
  }
  reject(id: string, reason: RejectionReason, note: string | null): Promise<IncidentSummary> {
    return this.send('PATCH', `/incidents/${id}/reject`, { reason, note });
  }
  markDuplicate(id: string, duplicateOfId: string): Promise<IncidentSummary> {
    return this.send('PATCH', `/incidents/${id}/duplicate`, { duplicateOfId });
  }
  assign(id: string, driverId: string, vehicleId: string | null, dueAt: string | null): Promise<MissionSummary> {
    return this.send('POST', `/incidents/${id}/assign`, { driverId, vehicleId, dueAt });
  }

  // ---------- Missions ----------
  missions(status: MissionStatus[], page = 0, size = 20, driverId?: string): Promise<Page<MissionSummary>> {
    return this.get('/missions', { status, page, size, driverId });
  }
  cancelMission(id: string, reason: string): Promise<MissionSummary> {
    return this.send('POST', `/missions/${id}/cancel`, { reason });
  }

  // ---------- Équipes, véhicules, utilisateurs ----------
  drivers(): Promise<TeamMember[]> {
    return this.get('/teams/drivers');
  }
  vehicles(): Promise<Vehicle[]> {
    return this.get('/vehicles');
  }
  addVehicle(plate: string, type: string): Promise<Vehicle> {
    return this.send('POST', '/vehicles', { plate, type });
  }
  updateVehicle(id: string, changes: { type?: string; active?: boolean; outOfService?: boolean }): Promise<Vehicle> {
    return this.send('PATCH', `/vehicles/${id}`, changes);
  }
  users(role?: Role | null): Promise<UserSummary[]> {
    return this.get('/users', { role });
  }
  invite(body: { firstName: string; lastName: string; phone: string; role: Role; email: string | null }): Promise<InvitationResponse> {
    return this.send('POST', '/users/invite', body);
  }
  setUserStatus(id: string, status: 'ACTIVE' | 'BLOCKED'): Promise<UserSummary> {
    return this.send('PATCH', `/users/${id}/status`, { status });
  }
  /** Admin : sans mot de passe → invitation SMS ; avec → compte actif tout de suite. */
  adminCreateUser(body: {
    firstName: string; lastName: string; phone: string; role: Role; organizationId: string | null; email: string | null;
    password: string | null;
  }): Promise<AdminCreateUserResponse> {
    return this.send('POST', '/admin/users', body);
  }
  /** Admin : seuls les champs renseignés (non null) sont modifiés. */
  adminUpdateUser(id: string, changes: {
    firstName?: string | null; lastName?: string | null; phone?: string | null; role?: Role | null;
    organizationId?: string | null; password?: string | null;
  }): Promise<UserSummary> {
    return this.send('PATCH', `/admin/users/${id}`, changes);
  }
  userNni(id: string): Promise<{ nni: string }> {
    return this.get(`/users/${id}/nni`);
  }

  // ---------- Organismes ----------
  organizations(): Promise<Organization[]> {
    return this.get('/organizations');
  }
  createOrganization(body: {
    name: string; type: OrgType; contactPhone: string | null; contactEmail: string | null; contractReference: string | null;
    categories: Category[]; manager: { firstName: string; lastName: string; phone: string; email: string | null };
  }): Promise<CreateOrganizationResponse> {
    return this.send('POST', '/organizations', body);
  }
  setOrganizationStatus(id: string, status: OrgStatus, reason: string | null): Promise<Organization> {
    return this.send('PATCH', `/organizations/${id}/status`, { status, reason });
  }

  // ---------- Zones ----------
  adminUnits(level: 'WILAYA' | 'MOUGHATAA' | 'COMMUNE' | null, parent?: string | null): Promise<AdminUnit[]> {
    return this.get('/admin-units', { level, parent });
  }
  myCoverage(): Promise<Coverage[]> {
    return this.get('/organizations/me/coverage');
  }
  coverageAvailability(category: Category, parent?: string | null): Promise<ZoneAvailability[]> {
    return this.get('/organizations/me/coverage/availability', { category, parent });
  }
  addCoverage(category: Category, adminUnitId: string): Promise<{ coverage: Coverage; routedIncidents: number }> {
    return this.send('POST', '/organizations/me/coverage', { category, adminUnitId });
  }
  removeCoverage(id: string): Promise<void> {
    return this.send('DELETE', `/organizations/me/coverage/${id}`);
  }
  allCoverage(category?: Category | null): Promise<Coverage[]> {
    return this.get('/admin/coverage', { category });
  }
  releaseCoverage(id: string, reason: string): Promise<Coverage> {
    return this.send('POST', `/admin/coverage/${id}/release`, { reason });
  }
  transferCoverage(id: string, organizationId: string, reason: string): Promise<Coverage> {
    return this.send('POST', `/admin/coverage/${id}/transfer`, { organizationId, reason });
  }

  // ---------- Statistiques, vue État ----------
  stats(category?: Category | null): Promise<StatsSummary> {
    return this.get('/stats/summary', { category });
  }
  heatmap(category: Category | null, days = 30): Promise<HeatPoint[]> {
    return this.get('/stats/heatmap', { category, days });
  }
  performance(category: Category | null, from: string | null, to: string | null): Promise<OrgPerformance[]> {
    return this.get('/authority/organizations/performance', { category, from, to });
  }

  // ---------- Notifications, paramètres, audit ----------
  notifications(page = 0, size = 15): Promise<Page<NotificationItem>> {
    return this.get('/notifications', { page, size });
  }
  unreadCount(): Promise<{ unread: number }> {
    return this.get('/notifications/unread-count');
  }
  markAllRead(): Promise<void> {
    return this.send('POST', '/notifications/read-all');
  }
  settings(): Promise<Setting[]> {
    return this.get('/settings');
  }
  updateSetting(key: string, value: string, category: Category | null): Promise<Setting> {
    return this.send('PUT', `/settings/${encodeURIComponent(key)}`, { value, category });
  }
  audit(page = 0, size = 50): Promise<Page<AuditItem>> {
    return this.get('/admin/audit', { page, size });
  }

  // ---------- Activation d'un compte invité ----------
  invitation(token: string): Promise<InvitationPreview> {
    return this.get(`/auth/invitations/${encodeURIComponent(token)}`);
  }
  invitationOtp(token: string): Promise<OtpSentResponse> {
    return this.send('POST', `/auth/invitations/${encodeURIComponent(token)}/otp`);
  }
  acceptInvitation(token: string, code: string, password: string | null, app: 'DASHBOARD' | 'DRIVER'): Promise<TokenResponse> {
    return this.send('POST', '/auth/invitations/accept', { token, code, password, app });
  }
}
