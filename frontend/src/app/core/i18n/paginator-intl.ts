import { inject, Injectable } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';

import { I18nService } from './i18n.service';

/** Textes de la pagination Material en français ou en arabe. */
@Injectable()
export class PaginatorIntl extends MatPaginatorIntl {
  private readonly i18n = inject(I18nService);

  override itemsPerPageLabel = this.i18n.t('paginator.perPage');
  override nextPageLabel = this.i18n.t('paginator.next');
  override previousPageLabel = this.i18n.t('paginator.previous');
  override firstPageLabel = this.i18n.t('paginator.first');
  override lastPageLabel = this.i18n.t('paginator.last');

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0) return this.i18n.t('paginator.range', { from: 0, to: 0, total: 0 });
    const from = page * pageSize + 1;
    const to = Math.min(length, (page + 1) * pageSize);
    return this.i18n.t('paginator.range', { from, to, total: length });
  };
}
