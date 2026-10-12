import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N_PIPES } from '../../core/i18n/pipes';
import { InvitationPreview, OtpSentResponse } from '../../core/models';
import { errorMessage } from '../../core/ui';

/**
 * Activation d'un compte invité (lien reçu par SMS ou e-mail, cahier des charges §5) :
 * code SMS + mot de passe. L'activation du responsable active son organisme.
 */
@Component({
  selector: 'app-activation-page',
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, ...I18N_PIPES],
  template: `
    <div class="auth">
      <div class="panel">
        <div class="brand">
          <span class="logo" lang="ar">بلاغ</span>
          <div><div class="name">Balagh MR</div><div class="muted">{{ 'activation.title' | t }}</div></div>
        </div>
        @if (error()) {
          <div class="error-banner">{{ error() }}</div>
        }
        @if (done()) {
          <div class="info-banner">{{ 'activation.driverDone' | t }}</div>
        } @else if (preview(); as p) {
          <div class="steps">
            <p>{{ 'activation.hello' | t: { name: p.firstName } }}
              {{ 'activation.invitedAs' | t: { role: (p.role | label: 'role'), org: p.organizationName ?? '—' } }}</p>
            @if (!sent()) {
              <button mat-flat-button (click)="sendCode()" [disabled]="loading()">
                {{ 'activation.sendCode' | t: { phone: p.phoneMasked } }}
              </button>
            } @else {
              <p class="muted">{{ 'activation.codeSent' | t: { phone: sent()!.phone } }}</p>
              @if (sent()!.devCode) {
                <p class="small">{{ 'activation.devCode' | t }} <span class="code">{{ sent()!.devCode }}</span></p>
              }
              <form class="form" (ngSubmit)="activate(p)">
                <mat-form-field>
                  <mat-label>{{ 'activation.code' | t }}</mat-label>
                  <input matInput name="code" [(ngModel)]="code" inputmode="numeric" maxlength="6" required autocomplete="one-time-code" />
                </mat-form-field>
                @if (p.passwordRequired) {
                  <mat-form-field>
                    <mat-label>{{ 'activation.password' | t }}</mat-label>
                    <input matInput type="password" name="password" [(ngModel)]="password" minlength="8" required autocomplete="new-password" />
                    <mat-hint>{{ 'activation.passwordHint' | t }}</mat-hint>
                  </mat-form-field>
                }
                <button mat-flat-button type="submit"
                        [disabled]="loading() || code.length !== 6 || (p.passwordRequired && password.length < 8)">
                  {{ 'activation.submit' | t }}
                </button>
              </form>
            }
          </div>
        } @else if (!error()) {
          <p class="muted">{{ 'common.loading' | t }}</p>
        }
      </div>
    </div>
  `,
  styleUrl: './auth.page.scss',
})
export class ActivationPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  /** ?token=... du lien d'activation */
  readonly token = input<string>('');

  protected readonly preview = signal<InvitationPreview | null>(null);
  protected readonly sent = signal<OtpSentResponse | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal(false);
  protected code = '';
  protected password = '';

  async ngOnInit(): Promise<void> {
    if (!this.token()) {
      this.error.set(this.i18n.t('activation.noToken'));
      return;
    }
    await this.run(async () => this.preview.set(await this.api.invitation(this.token())));
  }

  protected sendCode(): Promise<void> {
    return this.run(async () => this.sent.set(await this.api.invitationOtp(this.token())));
  }

  protected activate(preview: InvitationPreview): Promise<void> {
    const driver = preview.role === 'DRIVER';
    return this.run(async () => {
      const res = await this.api.acceptInvitation(this.token(), this.code, driver ? null : this.password,
        driver ? 'DRIVER' : 'DASHBOARD');
      if (driver) {
        this.done.set(true);
      } else {
        this.auth.startSession(res);
        await this.router.navigateByUrl('/tableau-de-bord');
      }
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    } finally {
      this.loading.set(false);
    }
  }
}
