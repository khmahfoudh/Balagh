// Types alignés sur les DTO du backend (backend/src/main/java/com/example/backend/web/dto)

export type Role = 'CITIZEN' | 'DRIVER' | 'AGENT' | 'MANAGER' | 'AUTHORITY' | 'ADMIN';
export type Category = 'WASTE' | 'STAGNANT_WATER' | 'ROAD_HOLE';
export type IncidentStatus = 'NEW' | 'CONFIRMED' | 'ASSIGNED' | 'EN_ROUTE' | 'ON_SITE' | 'RESOLVED' | 'REJECTED' | 'REOPENED';
export type Priority = 'NORMAL' | 'URGENT';
export type MissionStatus = 'ASSIGNED' | 'EN_ROUTE' | 'ON_SITE' | 'DONE' | 'CANCELLED';
export type RejectionReason = 'OFF_TOPIC' | 'FAKE' | 'ALREADY_DONE';
export type OrgType = 'CLEANING' | 'SANITATION' | 'ROADS' | 'OTHER';
export type OrgStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED';
export type IncidentEventType = 'CREATED' | 'REPORT_ADDED' | 'PRIORITY_URGENT' | 'ROUTED' | 'STATUS_CHANGED' | 'REJECTED'
  | 'MARKED_DUPLICATE' | 'MISSION_ASSIGNED' | 'MISSION_CANCELLED' | 'FEEDBACK' | 'REOPENED';
export type AdminLevel = 'WILAYA' | 'MOUGHATAA' | 'COMMUNE';

export const CATEGORIES: Category[] = ['WASTE', 'STAGNANT_WATER', 'ROAD_HOLE'];
export const MISSION_STATUSES: MissionStatus[] = ['ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'DONE', 'CANCELLED'];
export const ACTIVE_MISSION_STATUSES: MissionStatus[] = ['ASSIGNED', 'EN_ROUTE', 'ON_SITE'];
export const REJECTION_REASONS: RejectionReason[] = ['OFF_TOPIC', 'FAKE', 'ALREADY_DONE'];
export const STATUSES: IncidentStatus[] = ['NEW', 'CONFIRMED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'RESOLVED', 'REJECTED', 'REOPENED'];

export interface ApiErrorBody { code: string; message: string; details?: unknown; }

export interface OrganizationSummary { id: string; name: string; type: OrgType; categories: Category[]; status: OrgStatus; }

export interface Me {
  id: string; firstName: string; lastName: string; phone: string; role: Role;
  organization: OrganizationSummary | null; trustScore: number; preferredLang: 'fr' | 'ar';
}

export interface OtpSentResponse { phone: string; expiresInSeconds: number; devCode: string | null; }
export interface InvitationPreview {
  firstName: string; lastName: string; phoneMasked: string; role: Role; organizationName: string | null;
  passwordRequired: boolean; expiresAt: string;
}

export interface TokenResponse { accessToken: string; refreshToken: string; expiresIn: number; user: Me; }

export interface Page<T> { items: T[]; page: number; size: number; totalElements: number; totalPages: number; }

export interface IncidentSummary {
  id: string; category: Category; status: IncidentStatus; priority: Priority; latitude: number; longitude: number;
  reportersCount: number; radiusM: number; place: string | null; organizationId: string | null;
  organizationName: string | null; routingStatus: 'AUTO_ASSIGNED' | 'UNASSIGNED'; citizenCheck: string;
  firstReportedAt: string; lastReportedAt: string; resolvedAt: string | null;
}

export interface MapIncident {
  id: string; category: Category; status: IncidentStatus; priority: Priority;
  latitude: number; longitude: number; reportersCount: number; radiusM: number;
}

export interface MediaItem { id: string; type: 'PHOTO' | 'VIDEO'; url: string; capturedAt: string | null; latitude: number | null; longitude: number | null; }

export interface MissionSummary {
  id: string; incidentId: string; status: MissionStatus; category: Category; priority: Priority; reportersCount: number;
  latitude: number; longitude: number; place: string | null; distanceMeters: number | null; driverId: string;
  driverName: string; vehiclePlate: string | null; vehicleType: string | null; assignedAt: string;
  startedAt: string | null; arrivedAt: string | null; completedAt: string | null; dueAt: string | null;
  firstReportedAt: string; hasProof: boolean;
}

export interface IncidentDetail {
  incident: IncidentSummary;
  location: { commune: string | null; moughataa: string | null; wilaya: string | null };
  confirmationMode: 'AUTO' | 'MANUAL' | null; confirmedAt: string | null;
  rejectionReason: string | null; rejectionNote: string | null; duplicateOfId: string | null; reopenedCount: number;
  reports: { id: string; createdAt: string; source: 'NEW' | 'ME_TOO'; description: string | null; accuracyM: number | null;
    reporter: { id: string; name: string; phone: string; trustScore: number } | null }[];
  media: MediaItem[];
  timeline: { at: string; type: IncidentEventType; fromStatus: IncidentStatus | null; toStatus: IncidentStatus | null; actor: string; note: string | null }[];
  activeMission: MissionSummary | null; missions: MissionSummary[]; proof: MediaItem | null;
  feedback: { confirmations: number; disputes: number; closesAt: string } | null;
  actions: { confirm: boolean; reject: boolean; assign: boolean; markDuplicate: boolean; cancelMission: boolean };
}

export interface TeamMember { id: string; name: string; phone: string; availability: 'DISPONIBLE' | 'EN_MISSION' | 'BLOQUE'; currentMission: MissionSummary | null; activeMissions: number; }
export interface Vehicle { id: string; plate: string; type: string; active: boolean; outOfService: boolean; availability: 'DISPONIBLE' | 'EN_MISSION' | 'HORS_SERVICE' | 'INACTIF'; }

export interface StatsSummary {
  urgentOpen: number; newToVerify: number; inProgress: number; resolvedToday: number; unassigned: number;
  avgResolutionHours: number | null; avgUrgentResolutionHours: number | null;
  byCategory: Record<string, number>; byWeek: { period: string; count: number }[];
  byZone: { zone: string; incidents: number; urgent: number }[];
}

export interface ZoneAvailability { id: string; level: AdminLevel; nameFr: string; nameAr: string; status: 'FREE' | 'MINE' | 'TAKEN' | 'PARTIAL'; hasChildren: boolean; }
export interface Coverage {
  id: string; category: Category; adminUnitId: string; level: AdminLevel; wilaya: string | null; moughataa: string | null;
  commune: string | null; active: boolean; createdAt: string; releasedAt: string | null; releaseReason: string | null;
  organizationId: string; organizationName: string;
}

export interface OrgPerformance {
  organizationId: string; organizationName: string; received: number; resolved: number; resolutionRate: number | null;
  avgResolutionHours: number | null; avgUrgentResolutionHours: number | null; reopenedRate: number | null;
  citizenConfirmedRate: number | null; proofRate: number | null; urgentWithoutReaction: number;
}

export interface Organization {
  id: string; name: string; type: OrgType; contactPhone: string | null; contactEmail: string | null;
  contractReference: string | null; status: OrgStatus; categories: Category[]; createdAt: string;
}
export interface CreateOrganizationResponse { organization: Organization; managerInvitation: InvitationResponse; }

export interface Setting { key: string; category: Category | null; value: string; description: string | null; updatedAt: string; }
export interface InvitationResponse { id: string; phone: string; role: Role; firstName: string; lastName: string; expiresAt: string; activationLink: string; }

export interface UserSummary {
  id: string; firstName: string; lastName: string; phone: string; role: Role; organizationId: string | null;
  organizationName: string | null; status: 'ACTIVE' | 'BLOCKED'; trustScore: number; createdAt: string;
}
export interface NotificationItem {
  id: string; type: string; title: string; body: string | null; incidentId: string | null; missionId: string | null;
  readAt: string | null; createdAt: string;
}
export interface AuditItem { id: string; actorId: string | null; action: string; entityType: string; entityId: string | null; details: string | null; ip: string | null; createdAt: string; }
export interface HeatPoint { latitude: number; longitude: number; weight: number; }
export interface AdminUnit { id: string; level: AdminLevel; code: string; nameFr: string; nameAr: string; parentId: string | null; }

/** Message WebSocket : une ligne ajoutée à la chronologie d'un incident (backend RealtimeEvents.IncidentChanged). */
export interface IncidentChanged {
  incidentId: string; organizationId: string | null; category: Category; status: IncidentStatus; priority: Priority;
  type: IncidentEventType; at: string;
}
