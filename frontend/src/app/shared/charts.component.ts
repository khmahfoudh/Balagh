import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { TranslatePipe } from '../core/i18n/pipes';

export interface ChartDatum {
  label: string;
  value: number;
  /** Texte secondaire affiché après la valeur (ex. « · 6 urgents »). */
  note?: string;
}

/** Graduation « propre » : 0, 2, 4... ou 0, 5, 10... */
function niceStep(max: number, ticks = 4): number {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  return Math.max(1, step);
}

const W = 640;
const H = 220;
const PAD = { top: 22, right: 8, bottom: 28, left: 36 };

/**
 * Colonnes d'une seule série dans le temps (incidents par semaine).
 * Règles dataviz : colonnes ≤ 24 px à bout arrondi, base carrée, grille fine, valeurs seulement sur le maximum
 * et la dernière colonne, info-bulle au survol ou au clavier, tableau des valeurs disponible.
 */
@Component({
  selector: 'app-column-chart',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart" [class.dim]="loading()">
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" [attr.aria-label]="ariaLabel()">
        @for (tick of geometry().ticks; track tick.value) {
          <line [attr.x1]="PAD.left" [attr.x2]="W - PAD.right" [attr.y1]="tick.y" [attr.y2]="tick.y" class="grid" />
          <text [attr.x]="PAD.left - 6" [attr.y]="tick.y + 4" class="tick" text-anchor="end">{{ tick.value }}</text>
        }
        @for (bar of geometry().bars; track bar.label; let i = $index) {
          <g class="bar" tabindex="0" [attr.aria-label]="bar.label + ' : ' + bar.value"
             (pointerenter)="hover.set(i)" (pointerleave)="hover.set(null)" (focus)="hover.set(i)" (blur)="hover.set(null)">
            <rect [attr.x]="bar.bandX" [attr.y]="PAD.top" [attr.width]="bar.bandW" [attr.height]="H - PAD.top - PAD.bottom" class="hit" />
            @if (bar.value > 0) {
              <path [attr.d]="bar.path" class="mark" [class.active]="hover() === i" />
            }
            @if (bar.labelled) {
              <text [attr.x]="bar.cx" [attr.y]="bar.top - 6" class="value" text-anchor="middle">{{ bar.value }}</text>
            }
            <text [attr.x]="bar.cx" [attr.y]="H - 8" class="tick" text-anchor="middle">{{ bar.label }}</text>
          </g>
        }
        <line [attr.x1]="PAD.left" [attr.x2]="W - PAD.right" [attr.y1]="H - PAD.bottom" [attr.y2]="H - PAD.bottom" class="axis" />
      </svg>
      @if (hover() !== null) {
        @let bar = geometry().bars[hover()!];
        <div class="tooltip" [style.left.%]="(bar.cx / W) * 100" [style.top.%]="(bar.top / H) * 100">
          <strong>{{ bar.value }}</strong>
          <span>{{ bar.label }}</span>
        </div>
      }
    </div>
    <button type="button" class="table-toggle" (click)="showTable.set(!showTable())">
      {{ (showTable() ? 'chart.hideTable' : 'chart.showTable') | t }}
    </button>
    @if (showTable()) {
      <table class="data-table">
        @for (d of data(); track d.label) {
          <tr><td>{{ d.label }}</td><td class="num">{{ d.value }}</td></tr>
        }
      </table>
    }
  `,
  styles: `
    .chart { position: relative; transition: opacity .2s; }
    .chart.dim { opacity: .55; }
    svg { width: 100%; height: auto; display: block; overflow: visible; }
    .grid { stroke: #e5e7eb; stroke-width: 1; }
    .axis { stroke: #cbd5e1; stroke-width: 1; }
    .tick { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
    .value { fill: var(--text); font-size: 12px; font-weight: 600; }
    .mark { fill: var(--green); transition: fill .15s; }
    .mark.active { fill: #138a64; }
    .hit { fill: transparent; }
    .bar { outline: none; cursor: default; }
    .bar:focus-visible .hit { stroke: var(--green); stroke-width: 1; }
    .tooltip {
      position: absolute; transform: translate(-50%, calc(-100% - 10px)); pointer-events: none;
      background: #1f2933; color: #fff; border-radius: 6px; padding: 6px 10px; font-size: 12px;
      display: flex; flex-direction: column; align-items: center; white-space: nowrap;
      strong { font-size: 14px; }
    }
    .table-toggle { border: none; background: none; color: var(--green); cursor: pointer; padding: 4px 0; font: inherit; font-size: 12px; }
    .data-table { border-collapse: collapse; font-size: 13px; margin-top: 4px; }
    .data-table td { padding: 3px 12px 3px 0; border-bottom: 1px solid var(--border); }
    .num { text-align: end; font-variant-numeric: tabular-nums; }
  `,
})
export class ColumnChartComponent {
  readonly data = input<ChartDatum[]>([]);
  readonly ariaLabel = input('');
  readonly loading = input(false);
  protected readonly hover = signal<number | null>(null);
  protected readonly showTable = signal(false);
  protected readonly W = W;
  protected readonly H = H;
  protected readonly PAD = PAD;

  protected readonly geometry = computed(() => {
    const data = this.data();
    const max = Math.max(0, ...data.map((d) => d.value));
    const step = niceStep(max);
    const top = Math.max(step, Math.ceil(max / step) * step);
    const plotH = H - PAD.top - PAD.bottom;
    const y = (v: number) => H - PAD.bottom - (v / top) * plotH;
    const ticks = [];
    for (let v = 0; v <= top; v += step) ticks.push({ value: v, y: y(v) });

    const bandW = (W - PAD.left - PAD.right) / Math.max(1, data.length);
    const barW = Math.min(24, bandW * 0.6);
    const maxIndex = data.findIndex((d) => d.value === max && max > 0);
    const bars = data.map((d, i) => {
      const cx = PAD.left + bandW * i + bandW / 2;
      const barTop = y(d.value);
      const x0 = cx - barW / 2;
      const x1 = cx + barW / 2;
      const base = H - PAD.bottom;
      const r = Math.min(4, (base - barTop) / 2, barW / 2);
      // Bout arrondi (4 px) en haut, base carrée sur l'axe
      const path = `M${x0},${base} V${barTop + r} Q${x0},${barTop} ${x0 + r},${barTop} H${x1 - r} Q${x1},${barTop} ${x1},${barTop + r} V${base} Z`;
      return {
        label: d.label, value: d.value, cx, top: barTop, path, bandX: PAD.left + bandW * i, bandW,
        labelled: d.value > 0 && (i === maxIndex || i === data.length - 1),
      };
    });
    return { ticks, bars };
  });
}

/**
 * Classement en barres horizontales (zones les plus touchées, catégories) : une seule teinte,
 * valeur écrite au bout de chaque barre (pas d'info-bulle nécessaire).
 */
@Component({
  selector: 'app-bar-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (row of rows(); track row.label) {
      <div class="row">
        <span class="name" [title]="row.label">{{ row.label }}</span>
        <span class="track"><span class="bar" [style.width.%]="row.width"></span></span>
        <span class="value"><strong>{{ row.value }}</strong>@if (row.note) {<span class="note"> {{ row.note }}</span>}</span>
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 10px; }
    .row { display: grid; grid-template-columns: minmax(90px, 30%) 1fr auto; align-items: center; gap: 10px; }
    .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .track { height: 14px; display: block; }
    .bar { display: block; height: 100%; min-width: 2px; background: var(--green); border-start-end-radius: 4px; border-end-end-radius: 4px; }
    .value { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .note { color: var(--muted); font-size: 12px; }
  `,
})
export class BarListComponent {
  readonly data = input<ChartDatum[]>([]);
  protected readonly rows = computed(() => {
    const max = Math.max(1, ...this.data().map((d) => d.value));
    return this.data().map((d) => ({ ...d, width: (d.value / max) * 100 }));
  });
}
