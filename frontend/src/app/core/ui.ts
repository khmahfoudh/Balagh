import { HttpErrorResponse } from '@angular/common/http';

import { I18nService } from './i18n/i18n.service';
import { ApiErrorBody, Category, IncidentStatus, MissionStatus, Priority } from './models';

/**
 * Couleurs d'état (le rouge est réservé à l'urgence). Jeu vérifié pour le daltonisme sur toutes les paires
 * (validateur dataviz : ΔE CVD ≥ 10,8, vision normale ≥ 17,5). L'ambre « nouveau » est peu contrasté sur blanc :
 * le texte reste en encre foncée, la couleur ne sert qu'aux marques (pastilles, points, barres).
 */
export const COLORS = {
  urgent: '#C0392B',
  new: '#D68C00',
  progress: '#2F6FD6',
  resolved: '#0F766E',
  muted: '#6B7280',
};

/** Encre lisible (blanc ou foncé) sur un fond coloré, selon sa luminance. */
export function inkOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (1.05) / (luminance + 0.05) >= 4.5 ? '#ffffff' : '#1f2933';
}

/** Couleur d'un incident : urgent = rouge, nouveau = ambre, en cours = bleu, résolu = vert-bleu. */
export function statusColor(status: IncidentStatus, priority: Priority = 'NORMAL'): string {
  if (priority === 'URGENT' && status !== 'RESOLVED' && status !== 'REJECTED') return COLORS.urgent;
  switch (status) {
    case 'NEW':
    case 'REOPENED':
      return COLORS.new;
    case 'CONFIRMED':
    case 'ASSIGNED':
    case 'EN_ROUTE':
    case 'ON_SITE':
      return COLORS.progress;
    case 'RESOLVED':
      return COLORS.resolved;
    default:
      return COLORS.muted;
  }
}

export function missionColor(status: MissionStatus): string {
  switch (status) {
    case 'DONE':
      return COLORS.resolved;
    case 'CANCELLED':
      return COLORS.muted;
    default:
      return COLORS.progress;
  }
}

/** Icônes Material Symbols par catégorie. */
export const CATEGORY_ICONS: Record<Category, string> = {
  WASTE: 'delete',
  STAGNANT_WATER: 'water_drop',
  ROAD_HOLE: 'construction',
};

/** Statuts « ouverts » (incident non clos). */
export const OPEN_STATUSES: IncidentStatus[] = ['NEW', 'CONFIRMED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'REOPENED'];

/** Message lisible d'une erreur d'API ({code, message, details}) ou réseau. */
export function errorMessage(error: unknown, i18n: I18nService): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return i18n.t('errors.network');
    const body = error.error as Partial<ApiErrorBody> | null;
    if (body && typeof body === 'object' && body.message) return body.message;
    return i18n.t('errors.http', { status: error.status });
  }
  return error instanceof Error ? error.message : i18n.t('errors.unknown');
}

/** Téléchargement d'un fichier généré dans le navigateur ou reçu du backend. */
export function saveFile(content: Blob | string, filename: string, type = 'text/csv;charset=utf-8'): void {
  const blob = content instanceof Blob ? content : new Blob(['﻿' + content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV avec séparateur « ; » (Excel en français), valeurs échappées. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [header, ...rows].map((row) => row.map(cell).join(';')).join('\r\n');
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
