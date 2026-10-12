import { Dir } from '@angular/cdk/bidi';
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { I18nService } from './core/i18n/i18n.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Dir],
  template: `<div class="app-root" [dir]="i18n.dir"><router-outlet /></div>`,
  styles: `.app-root { min-height: 100vh; }`,
})
export class App {
  protected readonly i18n = inject(I18nService);
}
