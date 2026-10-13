import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MatIconRegistry } from '@angular/material/icon';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { AuthService } from './core/auth.service';
import { ConfigService } from './core/config.service';
import { I18nService } from './core/i18n/i18n.service';
import { PaginatorIntl } from './core/i18n/paginator-intl';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideNativeDateAdapter(),
    { provide: MAT_DATE_LOCALE, useFactory: () => inject(I18nService).locale },
    { provide: MatPaginatorIntl, useClass: PaginatorIntl },
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline', subscriptSizing: 'dynamic' } },
    // Lit public/config.json (adresse du backend, fond de carte) puis restaure la session
    provideAppInitializer(async () => {
      // inject() n'est permis qu'avant le premier await
      inject(I18nService);
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
      const config = inject(ConfigService);
      const auth = inject(AuthService);
      await config.load();
      await auth.restore();
    }),
  ],
};
