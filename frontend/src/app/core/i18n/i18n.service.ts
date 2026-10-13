import { Injectable } from '@angular/core';

import { AR } from './ar';
import { FR, TranslationKey } from './fr';

export type Lang = 'fr' | 'ar';

/** Groupes de libellés d'énumérations : label('status', 'NEW') lit la clé « status.NEW ». */
export type LabelGroup = 'category' | 'status' | 'priority' | 'mission' | 'role' | 'availability' | 'vehicle'
  | 'orgType' | 'orgStatus' | 'reason' | 'event' | 'level' | 'zoneStatus' | 'userStatus' | 'citizenCheck' | 'source'
  | 'statusGroup' | 'media' | 'due';

const STORAGE_KEY = 'balagh.dashboard.lang';

function storedLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'ar' ? 'ar' : 'fr';
  } catch {
    return 'fr';
  }
}

/**
 * Français / arabe (droite à gauche). La langue est fixée au chargement de la page : en changer recharge
 * le dashboard, pour que tout suive (composants Material, carte, dates).
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang: Lang = storedLang();
  readonly dir: 'ltr' | 'rtl' = this.lang === 'ar' ? 'rtl' : 'ltr';
  /** Chiffres latins en arabe aussi (numéros de téléphone, plaques). */
  readonly locale = this.lang === 'ar' ? 'ar-MR-u-nu-latn' : 'fr-FR';
  private readonly dictionary: Record<TranslationKey, string> = this.lang === 'ar' ? AR : FR;

  constructor() {
    document.documentElement.lang = this.lang;
    document.documentElement.dir = this.dir;
  }

  setLang(lang: Lang): void {
    if (lang === this.lang) return;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      return;
    }
    location.reload();
  }

  t(key: TranslationKey, params?: Record<string, string | number>): string {
    let text = this.dictionary[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  }

  label(group: LabelGroup, value: string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const key = `${group}.${value}` as TranslationKey;
    return this.dictionary[key] ?? value;
  }

  number(value: number | null | undefined, digits = 0): string {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat(this.locale, { maximumFractionDigits: digits }).format(value);
  }

  /** Taux entre 0 et 1 → « 64 % ». */
  percent(rate: number | null | undefined): string {
    if (rate === null || rate === undefined) return '—';
    return new Intl.NumberFormat(this.locale, { style: 'percent', maximumFractionDigits: 0 }).format(rate);
  }

  /** Durée en heures → « 3 h 10 ». */
  hours(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    const total = Math.round(value * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return this.t('format.hoursMinutes', { h, m: String(m).padStart(2, '0') });
  }

  dateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  }

  date(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium' }).format(new Date(iso));
  }

  /** « il y a 3 j », « dans 2 h ». */
  ago(iso: string | null | undefined): string {
    if (!iso) return '—';
    const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
    const format = new Intl.RelativeTimeFormat(this.locale, { numeric: 'auto', style: 'short' });
    const abs = Math.abs(seconds);
    if (abs < 60) return format.format(seconds, 'second');
    if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute');
    if (abs < 86400) return format.format(Math.round(seconds / 3600), 'hour');
    return format.format(Math.round(seconds / 86400), 'day');
  }
}
