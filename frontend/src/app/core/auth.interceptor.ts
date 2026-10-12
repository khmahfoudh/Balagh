import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { AuthService } from './auth.service';

const withToken = (req: HttpRequest<unknown>, token: string | null) =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

/** Ajoute le JWT ; sur 401, renouvelle le jeton une fois puis rejoue la requête, sinon retour à la connexion. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (req.url.includes('/auth/')) {
    return next(req);
  }
  return next(withToken(req, auth.accessToken)).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      return from(auth.refresh()).pipe(
        switchMap((ok) => {
          if (ok) return next(withToken(req, auth.accessToken));
          auth.clear();
          router.navigateByUrl('/login');
          return throwError(() => error);
        }),
      );
    }),
  );
};
