import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { Role } from './models';

/** Pages du dashboard : connexion obligatoire. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.user() ? true : inject(Router).createUrlTree(['/login']);
};

/** Page de connexion : déjà connecté → tableau de bord. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.user() ? inject(Router).createUrlTree(['/tableau-de-bord']) : true;
};

/** Accès par rôle (route data.roles). Le backend revérifie toujours : ceci ne fait que masquer les écrans. */
export const roleGuard: CanActivateFn = (route) => {
  const roles = (route.data['roles'] ?? []) as Role[];
  const auth = inject(AuthService);
  return roles.length === 0 || auth.hasRole(...roles) ? true : inject(Router).createUrlTree(['/tableau-de-bord']);
};

export const ORG_STAFF: Role[] = ['AGENT', 'MANAGER'];
export const NATIONAL: Role[] = ['ADMIN', 'AUTHORITY'];
export const ALL_STAFF: Role[] = ['AGENT', 'MANAGER', 'ADMIN', 'AUTHORITY'];
