import { getApiConfig, getTokens, request } from './client';
import type {
  Category, GpsFix, LocalFile, MapIncident, Me, MissionDetail, MissionStatus, MissionSummary, MediaItem,
  MyReport, NotificationItem, OtpSentResponse, Page, ReportCreated, TokenResponse,
} from './types';

/** Champs d'un nouveau signalement (POST /reports, multipart). */
export interface NewReport {
  category: Category;
  gps: GpsFix;
  description?: string;
  /** Identifiant généré sur le téléphone : un renvoi (file hors ligne) ne crée pas de doublon. */
  clientId: string;
  deviceId?: string;
}

function appendFile(form: FormData, field: string, file: LocalFile): void {
  // React Native accepte { uri, name, type } comme fichier dans un FormData
  form.append(field, { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
}

/** Toutes les routes utilisées par les applications mobiles (cahier des charges §10). */
export const api = {
  // ---------- Authentification ----------
  register: (body: { firstName: string; lastName: string; phone: string; nni: string; preferredLang?: string }) =>
    request<OtpSentResponse>('/auth/register', { method: 'POST', body, auth: false }),

  requestOtp: (phone: string) =>
    request<OtpSentResponse>('/auth/otp/request', { method: 'POST', body: { phone }, auth: false }),

  verifyOtp: (phone: string, code: string) =>
    request<TokenResponse>('/auth/otp/verify', {
      method: 'POST', body: { phone, code, app: getApiConfig().app }, auth: false,
    }),

  login: (phone: string, password: string) =>
    request<TokenResponse>('/auth/login', {
      method: 'POST', body: { phone, password, app: getApiConfig().app }, auth: false,
    }),

  logout: () => {
    const refreshToken = getTokens()?.refreshToken;
    return refreshToken
      ? request<void>('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false })
      : Promise.resolve();
  },

  me: () => request<Me>('/me'),

  updateLanguage: (preferredLang: 'fr' | 'ar') => request<Me>('/me', { method: 'PATCH', body: { preferredLang } }),

  // ---------- Citoyen ----------
  mapIncidents: (box: { minLat: number; minLng: number; maxLat: number; maxLng: number }, category?: Category) => {
    const params = `minLat=${box.minLat}&minLng=${box.minLng}&maxLat=${box.maxLat}&maxLng=${box.maxLng}`
      + (category ? `&category=${category}` : '');
    return request<MapIncident[]>(`/map/incidents?${params}`);
  },

  createReport: (report: NewReport, media: LocalFile[]) => {
    const form = new FormData();
    form.append('category', report.category);
    form.append('latitude', String(report.gps.latitude));
    form.append('longitude', String(report.gps.longitude));
    form.append('accuracyM', String(report.gps.accuracy));
    form.append('capturedAt', report.gps.capturedAt);
    form.append('clientId', report.clientId);
    if (report.description) form.append('description', report.description);
    if (report.deviceId) form.append('deviceId', report.deviceId);
    media.forEach((file) => appendFile(form, 'media', file));
    return request<ReportCreated>('/reports', { method: 'POST', form, timeoutMs: 120000 });
  },

  myReports: () => request<MyReport[]>('/reports/mine'),

  meToo: (incidentId: string, gps: GpsFix, clientId: string, photo?: LocalFile) => {
    const form = new FormData();
    form.append('latitude', String(gps.latitude));
    form.append('longitude', String(gps.longitude));
    form.append('accuracyM', String(gps.accuracy));
    form.append('capturedAt', gps.capturedAt);
    form.append('clientId', clientId);
    if (photo) appendFile(form, 'media', photo);
    return request<ReportCreated>(`/incidents/${incidentId}/me-too`, { method: 'POST', form, timeoutMs: 60000 });
  },

  feedback: (incidentId: string, resolved: boolean, comment?: string) =>
    request<unknown>(`/incidents/${incidentId}/feedback`, { method: 'POST', body: { resolved, comment } }),

  // ---------- Chauffeur ----------
  myMissions: (lat?: number, lng?: number) =>
    request<MissionSummary[]>('/missions/mine' + (lat != null && lng != null ? `?lat=${lat}&lng=${lng}` : '')),

  missionHistory: () => request<MissionSummary[]>('/missions/mine/history'),

  mission: (id: string, lat?: number, lng?: number) =>
    request<MissionDetail>(`/missions/${id}` + (lat != null && lng != null ? `?lat=${lat}&lng=${lng}` : '')),

  setMissionStatus: (id: string, status: MissionStatus, note?: string) =>
    request<MissionSummary>(`/missions/${id}/status`, { method: 'PATCH', body: { status, note } }),

  uploadProof: (id: string, photo: LocalFile, gps?: GpsFix) => {
    const form = new FormData();
    appendFile(form, 'photo', photo);
    if (gps) {
      form.append('latitude', String(gps.latitude));
      form.append('longitude', String(gps.longitude));
      form.append('capturedAt', gps.capturedAt);
    }
    return request<MediaItem>(`/missions/${id}/proof`, { method: 'POST', form, timeoutMs: 120000 });
  },

  // ---------- Notifications ----------
  notifications: () => request<Page<NotificationItem>>('/notifications?size=50'),
  unreadCount: () => request<{ unread: number }>('/notifications/unread-count'),
  markAllRead: () => request<void>('/notifications/read-all', { method: 'POST' }),
};
