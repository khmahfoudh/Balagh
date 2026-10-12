import { inject, Injectable, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';

import { ApiService } from './api.service';
import { I18nService } from './i18n/i18n.service';
import { IncidentChanged } from './models';
import { RealtimeService } from './realtime.service';

export interface UrgentAlert {
  incidentId: string;
  message: string;
  at: string;
}

const SOUND_KEY = 'balagh.dashboard.sound';

/**
 * Alerte sonore et visuelle dès qu'un incident passe URGENT, sans recharger la page (cahier des charges §7.3).
 * Le navigateur n'autorise le son qu'après un clic : bouton « Activer le son » dans la barre du haut.
 */
@Injectable({ providedIn: 'root' })
export class AlertService {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private audio: AudioContext | null = null;

  /** Préférence mémorisée ; le son ne sort réellement qu'une fois le contexte audio débloqué par un clic. */
  readonly soundWanted = signal(this.readPreference());
  readonly soundReady = signal(false);
  readonly alerts = signal<UrgentAlert[]>([]);

  constructor() {
    inject(RealtimeService).incidentChanges.subscribe((event) => {
      if (event.type === 'PRIORITY_URGENT') void this.urgent(event);
    });
  }

  /** Appelé depuis un clic : débloque l'audio du navigateur. */
  async enableSound(): Promise<void> {
    this.audio ??= new AudioContext();
    await this.audio.resume();
    this.soundReady.set(this.audio.state === 'running');
    this.setPreference(true);
    this.beep();
  }

  disableSound(): void {
    this.setPreference(false);
  }

  private async urgent(event: IncidentChanged): Promise<void> {
    let message = this.i18n.t('alert.urgentGeneric', { category: this.i18n.label('category', event.category) });
    try {
      const detail = await this.api.incident(event.incidentId);
      message = this.i18n.t('alert.urgent', {
        n: detail.incident.reportersCount,
        place: detail.incident.place ?? this.i18n.label('category', event.category),
      });
    } catch {
      // message générique
    }
    this.alerts.update((list) => [{ incidentId: event.incidentId, message, at: event.at }, ...list].slice(0, 5));
    if (this.soundWanted()) this.beep();
    this.snackBar.open(message, this.i18n.t('common.open'), {
      duration: 15000, panelClass: 'urgent-snack', direction: this.i18n.dir,
    }).onAction().subscribe(() => void this.router.navigate(['/incidents', event.incidentId]));
  }

  /** Deux bips courts (pas de fichier audio à charger). */
  private beep(): void {
    const ctx = this.audio;
    if (!ctx || ctx.state !== 'running') return;
    [0, 0.3].forEach((offset, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = index === 0 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.25);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(ctx.currentTime + offset);
      oscillator.stop(ctx.currentTime + offset + 0.26);
    });
  }

  private readPreference(): boolean {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'off';
    } catch {
      return true;
    }
  }

  private setPreference(on: boolean): void {
    this.soundWanted.set(on);
    try {
      localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
    } catch {
      // préférence gardée pour cette session
    }
  }
}
