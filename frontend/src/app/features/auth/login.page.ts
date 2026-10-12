import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N_PIPES } from '../../core/i18n/pipes';
import { errorMessage } from '../../core/ui';

/** Connexion au dashboard : téléphone + mot de passe (agents, responsables, admin, État). */
@Component({
  selector: 'app-login-page',
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, ...I18N_PIPES],
  templateUrl: './auth.page.html',
  styleUrl: './auth.page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);

  protected phone = '';
  protected password = '';
  protected readonly hide = signal(true);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (!this.phone.trim() || !this.password) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.login(this.phone.trim(), this.password);
      await this.router.navigateByUrl('/tableau-de-bord');
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    } finally {
      this.loading.set(false);
    }
  }
}
