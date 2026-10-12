import type { IncidentStatus, Priority } from './api/types';

/** Vert et or du drapeau ; le rouge est réservé à l'urgence (cahier des charges §14). */
export const colors = {
  green: '#0B6E4F',
  greenDark: '#08553D',
  greenLight: '#E4F2EC',
  gold: '#E9B824',
  goldDark: '#C79A12',
  red: '#C0392B',
  redLight: '#FDECEA',
  orange: '#E67E22',
  blue: '#2F80ED',
  resolved: '#27AE60',
  gray: '#6B7280',
  border: '#E2E8F0',
  background: '#F4F6F5',
  card: '#FFFFFF',
  text: '#1F2933',
  muted: '#64748B',
  white: '#FFFFFF',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };

/** Couleurs des marqueurs et badges : urgent = rouge, nouveau = orange, en cours = bleu, résolu = vert. */
export function statusColor(status: IncidentStatus, priority: Priority = 'NORMAL'): string {
  if (priority === 'URGENT' && status !== 'RESOLVED' && status !== 'REJECTED') return colors.red;
  switch (status) {
    case 'NEW':
    case 'REOPENED':
      return colors.orange;
    case 'CONFIRMED':
    case 'ASSIGNED':
    case 'EN_ROUTE':
    case 'ON_SITE':
      return colors.blue;
    case 'RESOLVED':
      return colors.resolved;
    default:
      return colors.gray;
  }
}

export const categoryIcon = { WASTE: '🗑️', STAGNANT_WATER: '💧', ROAD_HOLE: '🕳️' } as const;
