// Code commun aux applications Citoyen et Chauffeur
export * from './api/types';
export { ApiError, configureApi, devServerApiUrl, getApiConfig, getTokens, setTokens, type Tokens } from './api/client';
export { api, type NewReport } from './api/endpoints';
export { AuthProvider, useAuth } from './auth/AuthProvider';
export { I18nProvider, useI18n, type Lang } from './i18n/I18nProvider';
export type { StringKey } from './i18n/strings';
export { colors, radius, spacing, statusColor, categoryIcon } from './theme';
export { BalaghMap, NOUAKCHOTT, regionToBox, setMapOptions, type EdgePadding, type MapPoint, type Region } from './maps/BalaghMap';
export { fetchRoute, setRoutingUrl, type LatLng, type Route } from './maps/routing';
export { useRoute, type RouteState } from './maps/useRoute';
export { enqueue, flushQueue, getQueuedJobs, type QueuedJob } from './offline/queue';
export { OfflineQueueRunner, useQueuedJobs } from './offline/useOfflineQueue';
export { capture, distanceMeters, formatDistance, getGpsFix, newClientId } from './device';
export { formatDuration, timeAgo } from './time';
export * from './components/ui';
export { OtpStep, PhoneLogin } from './components/PhoneLogin';
