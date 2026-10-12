import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { LabelPipe } from '../core/i18n/pipes';
import { IncidentStatus, MissionStatus, Priority } from '../core/models';
import { missionColor, statusColor } from '../core/ui';

/** Badges d'un incident : URGENT (si ouvert) + statut. */
@Component({
  selector: 'app-incident-status',
  imports: [LabelPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (urgent()) {
      <span class="badge urgent">{{ 'URGENT' | label: 'priority' }}</span>
    }
    <span class="badge" [style.--c]="color()">{{ status() | label: 'status' }}</span>
  `,
  styles: `:host { display: inline-flex; gap: 6px; flex-wrap: wrap; align-items: center; }`,
})
export class IncidentStatusComponent {
  readonly status = input.required<IncidentStatus>();
  readonly priority = input<Priority>('NORMAL');
  protected readonly urgent = computed(() =>
    this.priority() === 'URGENT' && this.status() !== 'RESOLVED' && this.status() !== 'REJECTED');
  protected readonly color = computed(() => statusColor(this.status(), 'NORMAL'));
}

@Component({
  selector: 'app-mission-status',
  imports: [LabelPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [style.--c]="color()">{{ status() | label: 'mission' }}</span>`,
})
export class MissionStatusComponent {
  readonly status = input.required<MissionStatus>();
  protected readonly color = computed(() => missionColor(this.status()));
}

/** Tuile chiffre clé (tableau de bord, statistiques) : libellé + valeur, accent facultatif. */
@Component({
  selector: 'app-kpi',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="label">
      @if (accent()) {
        <span class="dot" [style.background]="accent()"></span>
      }
      {{ label() }}
    </div>
    <div class="value">{{ value() }}</div>
    @if (hint()) {
      <div class="hint">{{ hint() }}</div>
    }
  `,
  styles: `
    :host { display: block; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; }
    .label { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; }
    .value { font-size: 28px; font-weight: 600; margin-top: 4px; }
    .hint { color: var(--muted); font-size: 12px; margin-top: 2px; }
  `,
})
export class KpiComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly accent = input<string | null>(null);
  readonly hint = input<string | null>(null);
}
