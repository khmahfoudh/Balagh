import { Routes } from '@angular/router';

import { ALL_STAFF, authGuard, guestGuard, NATIONAL, ORG_STAFF, roleGuard } from './core/guards';

/** Écrans du dashboard (maquettes 16 à 20 du cahier des charges), chargés à la demande. */
export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage) },
  { path: 'activation', loadComponent: () => import('./features/auth/activation.page').then((m) => m.ActivationPage) },
  {
    path: '',
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    canActivateChild: [roleGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tableau-de-bord' },
      { path: 'tableau-de-bord', data: { roles: ALL_STAFF },
        loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage) },
      { path: 'incidents', data: { roles: ALL_STAFF },
        loadComponent: () => import('./features/incidents/incident-list.page').then((m) => m.IncidentListPage) },
      { path: 'incidents/:id', data: { roles: ALL_STAFF },
        loadComponent: () => import('./features/incidents/incident-detail.page').then((m) => m.IncidentDetailPage) },
      { path: 'missions', data: { roles: ALL_STAFF },
        loadComponent: () => import('./features/missions/missions.page').then((m) => m.MissionsPage) },
      { path: 'equipes', data: { roles: ORG_STAFF },
        loadComponent: () => import('./features/teams/teams.page').then((m) => m.TeamsPage) },
      { path: 'statistiques', data: { roles: ALL_STAFF },
        loadComponent: () => import('./features/stats/stats.page').then((m) => m.StatsPage) },
      { path: 'mes-zones', data: { roles: ORG_STAFF },
        loadComponent: () => import('./features/zones/my-zones.page').then((m) => m.MyZonesPage) },
      { path: 'utilisateurs', data: { roles: ['MANAGER', 'AGENT', 'ADMIN'] },
        loadComponent: () => import('./features/users/users.page').then((m) => m.UsersPage) },
      { path: 'organismes', data: { roles: NATIONAL },
        loadComponent: () => import('./features/admin/organizations.page').then((m) => m.OrganizationsPage) },
      { path: 'zones', data: { roles: NATIONAL },
        loadComponent: () => import('./features/admin/coverage.page').then((m) => m.CoveragePage) },
      { path: 'parametres', data: { roles: ['ADMIN'] },
        loadComponent: () => import('./features/admin/settings.page').then((m) => m.SettingsPage) },
      { path: 'audit', data: { roles: ['ADMIN'] },
        loadComponent: () => import('./features/admin/audit.page').then((m) => m.AuditPage) },
      { path: 'etat/performance', data: { roles: NATIONAL },
        loadComponent: () => import('./features/state/performance.page').then((m) => m.PerformancePage) },
      { path: 'etat/exports', data: { roles: NATIONAL },
        loadComponent: () => import('./features/state/exports.page').then((m) => m.ExportsPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
