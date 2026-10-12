// Types alignés sur les DTO du backend (backend/src/main/java/com/example/backend/web/dto)

export type ClientApp = 'CITIZEN' | 'DRIVER' | 'DASHBOARD';
export type Role = 'CITIZEN' | 'DRIVER' | 'AGENT' | 'MANAGER' | 'AUTHORITY' | 'ADMIN';
export type Category = 'WASTE' | 'STAGNANT_WATER' | 'ROAD_HOLE';
export type IncidentStatus =
  | 'NEW' | 'CONFIRMED' | 'ASSIGNED' | 'EN_ROUTE' | 'ON_SITE' | 'RESOLVED' | 'REJECTED' | 'REOPENED';
export type Priority = 'NORMAL' | 'URGENT';
export type MissionStatus = 'ASSIGNED' | 'EN_ROUTE' | 'ON_SITE' | 'DONE' | 'CANCELLED';
export type MediaKind = 'PHOTO' | 'VIDEO';

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  type: string;
  categories: Category[];
  status: string;
}

export interface Me {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: Role;
  organization: OrganizationSummary | null;
  trustScore: number;
  preferredLang: 'fr' | 'ar';
  reportsCount: number | null;
  resolvedCount: number | null;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: Me;
}

export interface OtpSentResponse {
  phone: string;
  expiresInSeconds: number;
  /** Développement uniquement (backend OTP_EXPOSE_CODE=true) : le code, car aucun SMS n'est envoyé. */
  devCode: string | null;
}

export interface MapIncident {
  id: string;
  category: Category;
  status: IncidentStatus;
  priority: Priority;
  latitude: number;
  longitude: number;
  reportersCount: number;
  radiusM: number;
}

export interface ReportCreated {
  reportId: string;
  incidentId: string;
  newIncident: boolean;
  incidentStatus: IncidentStatus;
  priority: Priority;
  reportersCount: number;
  alreadyReceived: boolean;
}

export interface MyReport {
  reportId: string;
  createdAt: string;
  category: Category;
  description: string | null;
  source: 'NEW' | 'ME_TOO';
  incidentId: string;
  status: IncidentStatus;
  priority: Priority;
  reportersCount: number;
  place: string | null;
  resolvedAt: string | null;
  photoUrl: string | null;
  proofPhotoUrl: string | null;
  canGiveFeedback: boolean;
  myFeedback: boolean | null;
}

export interface MediaItem {
  id: string;
  type: MediaKind;
  url: string;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface MissionSummary {
  id: string;
  incidentId: string;
  status: MissionStatus;
  category: Category;
  priority: Priority;
  reportersCount: number;
  latitude: number;
  longitude: number;
  place: string | null;
  distanceMeters: number | null;
  driverId: string;
  driverName: string;
  vehiclePlate: string | null;
  vehicleType: string | null;
  assignedAt: string;
  startedAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  dueAt: string | null;
  firstReportedAt: string;
  hasProof: boolean;
}

export interface MissionDetail {
  mission: MissionSummary;
  citizenPhotos: MediaItem[];
  citizenDescriptions: string[];
  proof: MediaItem | null;
  googleMapsUrl: string;
  wazeUrl: string;
  driverNote: string | null;
  nextStatus: MissionStatus | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  incidentId: string | null;
  missionId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/** Fichier local (photo/vidéo) prêt à être envoyé en multipart. */
export interface LocalFile {
  uri: string;
  name: string;
  type: string;
}

export interface GpsFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}
