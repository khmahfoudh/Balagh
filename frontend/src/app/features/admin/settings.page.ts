import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ApiService } from '../../core/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N_PIPES } from '../../core/i18n/pipes';
import { Setting } from '../../core/models';
import { errorMessage } from '../../core/ui';

/** Paramètres métier (seuil d'urgence, fenêtre, rayons...) modifiables sans redéployer ; chaque changement est audité. */
@Component({
  selector: 'app-settings-page',
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, ...I18N_PIPES],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'nav.settings' | t }}</h1>
          <p class="subtitle">{{ 'settings.subtitle' | t }}</p>
        </div>
      </div>
      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }
      <section class="card">
        @for (s of settings(); track s.key + (s.category ?? '')) {
          <div class="setting">
            <div class="grow">
              <div class="key mono">{{ s.key }}@if (s.category) { · {{ s.category | label: 'category' }} }</div>
              <div>{{ s.description ?? '' }}</div>
              <div class="muted small">{{ 'settings.updated' | t: { date: (s.updatedAt | dateTime) } }}</div>
            </div>
            <mat-form-field class="value">
              <input matInput [(ngModel)]="values[s.key + '|' + (s.category ?? '')]" [attr.aria-label]="s.key" />
            </mat-form-field>
            <button mat-flat-button (click)="save(s)" [disabled]="busy() || values[s.key + '|' + (s.category ?? '')] === s.value">
              {{ 'common.save' | t }}
            </button>
          </div>
        }
      </section>
    </div>
  `,
  styles: `
    .setting { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .key { font-weight: 600; }
    .value { width: 140px; }
  `,
})
export class SettingsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly i18n = inject(I18nService);

  protected readonly settings = signal<Setting[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected values: Record<string, string> = {};

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const list = await this.api.settings();
      this.values = Object.fromEntries(list.map((s) => [`${s.key}|${s.category ?? ''}`, s.value]));
      this.settings.set(list);
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    }
  }

  protected async save(s: Setting): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.updateSetting(s.key, this.values[`${s.key}|${s.category ?? ''}`].trim(), s.category);
      this.snackBar.open(this.i18n.t('common.saved'), undefined, { duration: 3000, direction: this.i18n.dir });
      await this.load();
    } catch (e) {
      this.error.set(errorMessage(e, this.i18n));
    } finally {
      this.busy.set(false);
    }
  }
}
