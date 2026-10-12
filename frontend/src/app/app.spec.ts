import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';
import { AR } from './core/i18n/ar';
import { FR } from './core/i18n/fr';
import { I18nService } from './core/i18n/i18n.service';
import { COLORS, inkOn, statusColor, toCsv } from './core/ui';
import { ColumnChartComponent } from './shared/charts.component';

describe('App', () => {
  it('démarre avec le routeur, en français et de gauche à droite par défaut', async () => {
    await TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
    expect(document.documentElement.dir).toBe('ltr');
  });
});

describe('Couleurs d\'état', () => {
  it('rouge pour un urgent ouvert, couleur du statut une fois résolu', () => {
    expect(statusColor('ASSIGNED', 'URGENT')).toBe(COLORS.urgent);
    expect(statusColor('RESOLVED', 'URGENT')).toBe(COLORS.resolved);
    expect(statusColor('NEW')).toBe(COLORS.new);
    expect(statusColor('EN_ROUTE')).toBe(COLORS.progress);
    expect(statusColor('REJECTED')).toBe(COLORS.muted);
  });

  it('texte blanc sur le rouge, texte foncé sur l\'ambre (contraste)', () => {
    expect(inkOn(COLORS.urgent)).toBe('#ffffff');
    expect(inkOn(COLORS.progress)).toBe('#ffffff');
    expect(inkOn(COLORS.new)).toBe('#1f2933');
  });
});

describe('Export CSV', () => {
  it('sépare par « ; » et échappe guillemets, points-virgules et retours à la ligne', () => {
    const csv = toCsv(['lieu', 'note'], [['Ksar; rue 8', 'dit "urgent"'], ['Sebkha', null]]);
    expect(csv).toBe('lieu;note\r\n"Ksar; rue 8";"dit ""urgent"""\r\nSebkha;');
  });
});

describe('I18nService', () => {
  const i18n = () => TestBed.inject(I18nService);

  it('formate les durées et les libellés', () => {
    expect(i18n().hours(3 + 10 / 60)).toBe('3 h 10');
    expect(i18n().hours(0.75)).toBe('0 h 45');
    expect(i18n().hours(null)).toBe('—');
    expect(i18n().label('status', 'EN_ROUTE')).toBe('En route');
    expect(i18n().label('status', 'INCONNU')).toBe('INCONNU');
    expect(i18n().t('detail.citizens', { n: 6 })).toBe('6 citoyens distincts');
  });

  it('chaque texte arabe est rempli et garde les mêmes paramètres que le français', () => {
    for (const key of Object.keys(FR) as (keyof typeof FR)[]) {
      expect(AR[key].trim().length, key).toBeGreaterThan(0);
      const params = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(',');
      expect(params(AR[key]), key).toBe(params(FR[key]));
    }
  });
});

describe('ColumnChartComponent', () => {
  it('colonnes de 24 px au plus, valeurs écrites seulement sur le maximum et la dernière', async () => {
    const fixture = TestBed.createComponent(ColumnChartComponent);
    fixture.componentRef.setInput('data', [
      { label: 'S1', value: 2 }, { label: 'S2', value: 7 }, { label: 'S3', value: 0 }, { label: 'S4', value: 3 },
    ]);
    fixture.detectChanges();
    const svg = fixture.nativeElement as HTMLElement;
    const values = Array.from(svg.querySelectorAll('text.value')).map((t) => t.textContent?.trim());
    expect(values).toEqual(['7', '3']);
    expect(svg.querySelectorAll('path.mark').length).toBe(3); // pas de barre pour une semaine à 0
  });
});
