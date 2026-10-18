// src/pages/card/PricePulseChart.jsx
// DraGold Price Pulse — Chart nativo SVG reattivo per lo storico prezzi.
// Consuma market_observations e market_valuations. Nessuna libreria esterna.

import { useState, useId, createElement as h } from 'react';
import { buildPricePulseSeries } from '../../lib/pricePulse.pure.js';

export function PricePulseChart({ observations, valuation, tcg, lang }) {
  const [activePointIndex, setActivePointIndex] = useState(null);
  const gradientId = useId();

  // Verifica supporto TCG (attualmente abilitato e affidabile solo per Pokémon e One Piece)
  const isSupportedTcg = tcg === 'pokemon' || tcg === 'onepiece';
  if (!isSupportedTcg) {
    return h('div', { style: styles.emptyBox },
      h('div', { style: styles.emptyTitle }, 'Price Pulse non disponibile per questo gioco'),
      h('div', { style: styles.emptyText },
        'Lo storico continuativo Price Pulse è attualmente attivo per Pokémon e One Piece. Per questo TCG fare riferimento ai prezzi di mercato e alle inserzioni correnti.'
      )
    );
  }

  const series = buildPricePulseSeries(observations, { targetCurrency: 'EUR' });

  // Se lo storico non soddisfa i requisiti minimi (almeno 5 date distinte valide)
  if (!series.hasSufficientData) {
    return h('div', { style: styles.emptyBox },
      h('div', { style: styles.emptyBadge }, '📊 In fase di accumulo'),
      h('div', { style: styles.emptyTitle }, 'Storico prezzi insufficiente'),
      h('div', { style: styles.emptyText },
        `Richieste almeno 5 osservazioni giornaliere distinte per tracciare il trend (rilevate: ${series.count ?? (observations?.length || 0)}). I dati continuativi vengono aggiornati quotidianamente.`
      )
    );
  }

  const points = series.points;
  const summary = series.summary;
  const activePoint = activePointIndex != null ? points[activePointIndex] : points[points.length - 1];

  // Dimensioni SVG responsive
  const svgWidth = 600;
  const svgHeight = 220;
  const padLeft = 48;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 30;

  const chartWidth = svgWidth - padLeft - padRight;
  const chartHeight = svgHeight - padTop - padBottom;

  // Range min/max con padding per la scala Y
  let yMin = summary.minPrice;
  let yMax = summary.maxPrice;
  // Considera anche le bande low/high se presenti
  for (const pt of points) {
    if (pt.low != null && pt.low < yMin) yMin = pt.low;
    if (pt.high != null && pt.high > yMax) yMax = pt.high;
  }
  if (yMin === yMax) {
    yMin = Math.max(0, yMin * 0.9);
    yMax = yMax * 1.1 || 1.0;
  } else {
    const margin = (yMax - yMin) * 0.12;
    yMin = Math.max(0, yMin - margin);
    yMax = yMax + margin;
  }

  const getX = (index) => padLeft + (index / (points.length - 1)) * chartWidth;
  const getY = (val) => padTop + chartHeight - ((val - yMin) / (yMax - yMin)) * chartHeight;

  // Costruzione path linea principale
  const linePoints = points.map((p, i) => `${getX(i).toFixed(1)},${getY(p.price).toFixed(1)}`);
  const linePath = `M ${linePoints.join(' L ')}`;

  // Costruzione area di riempimento gradiente
  const areaPath = `M ${getX(0).toFixed(1)},${(padTop + chartHeight).toFixed(1)} L ${linePoints.join(' L ')} L ${getX(points.length - 1).toFixed(1)},${(padTop + chartHeight).toFixed(1)} Z`;

  // Costruzione banda Min/Max ombreggiata (se presente per almeno 3 punti)
  const bandPoints = points.filter((p) => p.low != null && p.high != null);
  let bandAreaPath = null;
  if (bandPoints.length >= 3 && bandPoints.length === points.length) {
    const topBand = points.map((p, i) => `${getX(i).toFixed(1)},${getY(p.high).toFixed(1)}`);
    const bottomBand = points.slice().reverse().map((p, i) => {
      const origIdx = points.length - 1 - i;
      return `${getX(origIdx).toFixed(1)},${getY(p.low).toFixed(1)}`;
    });
    bandAreaPath = `M ${topBand.join(' L ')} L ${bottomBand.join(' L ')} Z`;
  }

  // Grid line orizzontali (3 livelli: min, mid, max)
  const gridLevels = [
    { label: formatEur(yMax), y: getY(yMax) },
    { label: formatEur((yMin + yMax) / 2), y: getY((yMin + yMax) / 2) },
    { label: formatEur(yMin), y: getY(yMin) },
  ];

  const trendColor = summary.changePct > 0 ? '#10b981' : summary.changePct < 0 ? '#ef4444' : '#9ca3af';
  const trendSign = summary.changePct > 0 ? '+' : '';

  return h('div', { style: styles.container },
    // Header informativo
    h('div', { style: styles.header },
      h('div', null,
        h('div', { style: styles.titleRow },
          h('span', { style: styles.title }, 'DraGold Price Pulse'),
          h('span', { style: styles.badgeSource }, 'TCGplayer Market')
        ),
        h('div', { style: styles.subTitle },
          `Rilevazioni giornaliere continuative · Finish: ${points[0].subType}`
        )
      ),
      h('div', { style: styles.priceCol },
        h('div', { style: styles.headlinePrice }, formatEur(activePoint.price)),
        h('div', { style: { ...styles.trendBadge, color: trendColor } },
          `${trendSign}${summary.changePct.toFixed(1)}% (${summary.pointsCount} gg)`
        )
      )
    ),

    // Sezione Fair Value separata (se presente e validata)
    valuation && valuation.estimated_value != null && (
      h('div', { style: styles.fairValueBanner },
        h('div', { style: styles.fairValueInfo },
          h('span', { style: styles.fairValueLabel }, '⚖️ Stima Fair Value (Modello Quantitativo):'),
          h('span', { style: styles.fairValueAmount }, formatEur(valuation.estimated_value)),
          valuation.confidence && (
            h('span', { style: styles.confidenceTag }, `Affidabilità: ${valuation.confidence}`)
          )
        ),
        h('span', { style: styles.fairValueNote },
          'Mediana ponderata per anzianità con sconto ask 8% · Separata dai prezzi grezzi'
        )
      )
    ),

    // Grafico SVG nativo interattivo
    h('div', { style: styles.chartWrapper },
      h('svg', {
        viewBox: `0 0 ${svgWidth} ${svgHeight}`,
        style: styles.svg,
        onMouseLeave: () => setActivePointIndex(null),
      },
        h('defs', null,
          h('linearGradient', { id: `gradient-${gradientId}`, x1: '0', y1: '0', x2: '0', y2: '1' },
            h('stop', { offset: '0%', stopColor: '#6366f1', stopOpacity: '0.35' }),
            h('stop', { offset: '100%', stopColor: '#6366f1', stopOpacity: '0.0' })
          )
        ),

        // Griglia orizzontale e label Y
        gridLevels.map((lvl, idx) =>
          h('g', { key: idx },
            h('line', {
              x1: padLeft,
              y1: lvl.y,
              x2: svgWidth - padRight,
              y2: lvl.y,
              stroke: '#27273a',
              strokeDasharray: '3 3',
              strokeWidth: '1',
            }),
            h('text', {
              x: padLeft - 8,
              y: lvl.y + 4,
              fill: '#71717a',
              fontSize: '10',
              textAnchor: 'end',
              fontFamily: 'monospace',
            }, lvl.label)
          )
        ),

        // Banda min/max se presente
        bandAreaPath && h('path', {
          d: bandAreaPath,
          fill: '#818cf8',
          fillOpacity: '0.12',
        }),

        // Area sotto la curva
        h('path', {
          d: areaPath,
          fill: `url(#gradient-${gradientId})`,
        }),

        // Linea principale del prezzo
        h('path', {
          d: linePath,
          fill: 'none',
          stroke: '#818cf8',
          strokeWidth: '2.5',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),

        // Linea guida verticale attiva e punto evidenziato su hover
        activePointIndex != null && h('g', null,
          h('line', {
            x1: getX(activePointIndex),
            y1: padTop,
            x2: getX(activePointIndex),
            y2: padTop + chartHeight,
            stroke: '#fbbf24',
            strokeWidth: '1.5',
            strokeDasharray: '2 2',
          }),
          h('circle', {
            cx: getX(activePointIndex),
            cy: getY(points[activePointIndex].price),
            r: '5',
            fill: '#fbbf24',
            stroke: '#0f0f18',
            strokeWidth: '2',
          })
        ),

        // Date iniziali e finali sull'asse X
        h('text', {
          x: padLeft,
          y: svgHeight - 8,
          fill: '#71717a',
          fontSize: '11',
          textAnchor: 'start',
        }, summary.from),
        h('text', {
          x: svgWidth - padRight,
          y: svgHeight - 8,
          fill: '#71717a',
          fontSize: '11',
          textAnchor: 'end',
        }, summary.to),

        // Aree trasparenti per catturare hover interattivo per ciascun punto
        points.map((pt, i) => {
          const x = getX(i);
          const w = chartWidth / points.length;
          return h('rect', {
            key: i,
            x: x - w / 2,
            y: padTop,
            width: w,
            height: chartHeight,
            fill: 'transparent',
            style: { cursor: 'pointer' },
            onMouseEnter: () => setActivePointIndex(i),
            onTouchStart: () => setActivePointIndex(i),
          });
        })
      )
    ),

    // Dettaglio punto selezionato (tooltip/pill informativo)
    h('div', { style: styles.footerRow },
      h('div', { style: styles.pointDetails },
        h('span', { style: styles.pointDate }, `Data: ${activePoint.dateKey}`),
        h('span', { style: styles.pointPrice }, `Prezzo: ${formatEur(activePoint.price)}`),
        activePoint.low != null && activePoint.high != null && (
          h('span', { style: styles.pointBand }, `(Range: ${formatEur(activePoint.low)} - ${formatEur(activePoint.high)})`)
        )
      ),
      h('div', { style: styles.disclaimer },
        'Prezzi storici convertiti da USD al tasso ECB ufficiale della data di rilevazione.'
      )
    )
  );
}

function formatEur(val) {
  if (val == null || !Number.isFinite(val)) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
}

const styles = {
  container: {
    background: '#0d0d16',
    border: '1px solid #1f1f33',
    borderRadius: 14,
    padding: '18px 20px',
    marginBottom: 24,
    color: '#e4e4e7',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 12,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: '#f4f4f5',
  },
  badgeSource: {
    background: '#1e1e30',
    color: '#a1a1aa',
    border: '1px solid #2e2e44',
    borderRadius: 6,
    padding: '2px 7px',
    fontSize: 11,
    fontWeight: 500,
  },
  subTitle: {
    fontSize: 12,
    color: '#71717a',
  },
  priceCol: {
    textAlign: 'right',
  },
  headlinePrice: {
    fontSize: 22,
    fontWeight: 800,
    color: '#ffffff',
  },
  trendBadge: {
    fontSize: 12,
    fontWeight: 600,
  },
  fairValueBanner: {
    background: '#141424',
    border: '1px solid #2b2b48',
    borderRadius: 8,
    padding: '8px 12px',
    marginBottom: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  fairValueInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  fairValueLabel: {
    fontSize: 12,
    color: '#a1a1aa',
  },
  fairValueAmount: {
    fontSize: 14,
    fontWeight: 700,
    color: '#38bdf8',
  },
  confidenceTag: {
    fontSize: 11,
    background: '#0e2338',
    color: '#38bdf8',
    padding: '1px 6px',
    borderRadius: 4,
    border: '1px solid #164e63',
  },
  fairValueNote: {
    fontSize: 11,
    color: '#71717a',
  },
  chartWrapper: {
    width: '100%',
    overflow: 'hidden',
  },
  svg: {
    width: '100%',
    height: 'auto',
    display: 'block',
  },
  footerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    fontSize: 12,
    color: '#a1a1aa',
    flexWrap: 'wrap',
    gap: 8,
  },
  pointDetails: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 12,
    background: '#161624',
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid #27273f',
  },
  pointDate: {
    color: '#d4d4d8',
  },
  pointPrice: {
    color: '#fbbf24',
    fontWeight: 600,
  },
  pointBand: {
    color: '#a1a1aa',
    fontSize: 11,
  },
  disclaimer: {
    fontSize: 11,
    color: '#52525b',
  },
  emptyBox: {
    background: '#0d0d16',
    border: '1px dashed #27273a',
    borderRadius: 12,
    padding: '24px 20px',
    marginBottom: 24,
    textAlign: 'center',
  },
  emptyBadge: {
    fontSize: 13,
    color: '#818cf8',
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#d4d4d8',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 12,
    color: '#71717a',
    maxWidth: 520,
    margin: '0 auto',
    lineHeight: 1.5,
  },
};
