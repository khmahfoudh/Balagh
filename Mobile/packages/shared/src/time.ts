import type { StringKey } from './i18n/strings';

type T = (key: StringKey, params?: Record<string, string | number>) => string;

/** Durée d'un trajet : « 12 min », « 1 h 05 » / « 12 د », « 1 س 05 د » */
export function formatDuration(seconds: number, t: T): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return t('common.duration.min', { n: minutes });
  return t('common.duration.hour', { h: Math.floor(minutes / 60), m: String(minutes % 60).padStart(2, '0') });
}

/** « il y a 3 h » / « منذ 3 ساعة » */
export function timeAgo(iso: string | null | undefined, t: T): string {
  if (!iso) return '';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return t('common.ago.now');
  if (minutes < 60) return t('common.ago.min', { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('common.ago.hour', { n: hours });
  return t('common.ago.day', { n: Math.round(hours / 24) });
}
