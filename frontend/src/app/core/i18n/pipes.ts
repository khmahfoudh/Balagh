import { inject, Pipe, PipeTransform } from '@angular/core';

import { TranslationKey } from './fr';
import { I18nService, LabelGroup } from './i18n.service';

// Pipes « purs » : la langue ne change pas sans recharger la page (voir I18nService).

/** {{ 'nav.dashboard' | t }} ou {{ 'incident.citizens' | t: { n: 6 } }} */
@Pipe({ name: 't' })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: TranslationKey, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }
}

/** {{ incident.status | label: 'status' }} */
@Pipe({ name: 'label' })
export class LabelPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(value: string | null | undefined, group: LabelGroup): string {
    return this.i18n.label(group, value);
  }
}

/** {{ incident.firstReportedAt | ago }} → « il y a 3 j ». Recalculé quand la ligne est redessinée. */
@Pipe({ name: 'ago', pure: false })
export class AgoPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(iso: string | null | undefined): string {
    return this.i18n.ago(iso);
  }
}

@Pipe({ name: 'dateTime' })
export class DateTimePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(iso: string | null | undefined): string {
    return this.i18n.dateTime(iso);
  }
}

@Pipe({ name: 'hours' })
export class HoursPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(value: number | null | undefined): string {
    return this.i18n.hours(value);
  }
}

@Pipe({ name: 'pct' })
export class PercentPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(rate: number | null | undefined): string {
    return this.i18n.percent(rate);
  }
}

export const I18N_PIPES = [TranslatePipe, LabelPipe, AgoPipe, DateTimePipe, HoursPipe, PercentPipe] as const;
