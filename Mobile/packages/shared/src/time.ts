import type { StringKey } from './i18n/strings';

type T = (key: StringKey, params?: Record<string, string | number>) => string;

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
