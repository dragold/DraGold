import { createElement as h } from 'react';
import './askDossier.css';

const CONF_LABEL = { high: 'High', medium: 'Medium', low: 'Low', none: 'Estimate pending' };
const REASON_EXPLAIN = {
  no_data_yet: "there aren't enough recent market observations for it yet",
  ja_not_covered: "the Japanese printing isn't in DraGold's price pipeline yet",
  set_not_covered: "this set isn't in DraGold's price pipeline yet",
  resolved_via_alias: 'a spelling-variant match was used',
};
const BASIS_LABEL = {
  self: 'this printing', same_canonical: 'same card (shared identity)',
  set_alias: 'curated set mapping', number_alias: 'curated card mapping',
  same_concept: 'same-language spelling variant',
};

function fmtDate(s) {
  if (!s) return null;
  try { return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return s; }
}
function fmtMoney(v, cur = 'EUR') {
  if (v == null) return '—';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(v); }
  catch { return `${v} ${cur}`; }
}
function cardHref(c) {
  return c.slug ? `/carta/${c.slug}${c.lang ? `?lang=${c.lang}` : ''}` : null;
}

// Renders the agent's prose with **FACT** / **INFERENCE** / **RECOMMENDATION**
// labels turned into chips.
function Answer({ text }) {
  const blocks = String(text || '').split(/\n{2,}/).filter(Boolean);
  return h('div', { className: 'ad-answer' }, blocks.map((b, i) => {
    const m = b.match(/^\*{0,2}(FACT|INFERENCE|RECOMMENDATION|CONCLUSION)\*{0,2}[:\s]*/i);
    if (m) {
      const kind = m[1].toLowerCase();
      return h('p', { key: i, className: `ad-block ad-${kind}` },
        h('span', { className: 'ad-tag' }, m[1].toUpperCase()),
        ' ', b.slice(m[0].length));
    }
    return h('p', { key: i, className: 'ad-block' }, b);
  }));
}

function CardsUsed({ cards }) {
  if (!cards?.length) return null;
  return h('section', { className: 'ad-sec' },
    h('h3', null, 'Cards referenced'),
    h('ul', { className: 'ad-cards' }, cards.slice(0, 12).map((c) => {
      const href = cardHref(c);
      const inner = [
        h('span', { className: 'ad-card-name', key: 'n' }, c.name || c.name_en || c.card_id),
        h('span', { className: 'ad-card-meta', key: 'm' },
          [c.tcg, c.set_name || c.set_id, c.card_number && `#${c.card_number}`, c.lang && c.lang.toUpperCase()]
            .filter(Boolean).join(' · ')),
      ];
      return h('li', { key: c.card_id },
        href ? h('a', { href, className: 'ad-card-link' }, inner) : h('span', { className: 'ad-card-link' }, inner));
    })));
}

function Versions({ versions }) {
  if (!versions?.length || versions.length < 2) return null;
  return h('section', { className: 'ad-sec ad-xlang' },
    h('h3', null, 'Cross-language / cross-region'),
    h('ul', { className: 'ad-cards' }, versions.map((v) => h('li', { key: v.card_id },
      h('span', { className: 'ad-card-name' }, `${(v.lang || '').toUpperCase()} · ${v.name || v.card_id}`),
      h('span', { className: 'ad-card-meta' }, `${v.set_id || ''} #${v.card_number || ''}`),
      h('span', { className: `ad-basis ad-basis-${v.link_basis}` }, BASIS_LABEL[v.link_basis] || v.link_basis),
      v.alias_note && h('span', { className: 'ad-note', title: v.alias_note }, v.alias_note),
    ))));
}

function Valuations({ valuations }) {
  if (!valuations?.length) return null;
  return h('section', { className: 'ad-sec' },
    h('h3', null, 'Market valuation'),
    valuations.map((v, i) => {
      if (v.available === false) {
        return h('div', { key: i, className: 'ad-val ad-val-pending' },
          h('div', { className: 'ad-val-top' },
            h('span', { className: 'ad-val-price ad-val-pending-label' }, 'Not yet valued'),
            h('span', { className: 'ad-conf' }, 'DraGold')),
          h('p', { className: 'ad-note' },
            "DraGold doesn't have a verified market value for this exact printing — " +
            (REASON_EXPLAIN[v.unavailable_reason] || `(${v.unavailable_reason || 'no data'})`) + '.'),
          h('p', { className: 'ad-disclaimer' },
            'This is a data-coverage gap, not an error. Rather than show an unreliable number, DraGold says it doesn’t know. Coverage grows as more market observations are collected.'));
      }
      const reason = v.confidence_reason && typeof v.confidence_reason === 'object'
        ? Object.entries(v.confidence_reason).map(([k, val]) => `${k}: ${val}`).join(' · ')
        : (v.confidence_reason || null);
      return h('div', { key: i, className: 'ad-val' },
        h('div', { className: 'ad-val-top' },
          h('span', { className: 'ad-val-price' }, fmtMoney(v.value, v.currency)),
          h('span', { className: `ad-conf ad-conf-${v.confidence}` }, CONF_LABEL[v.confidence] || v.confidence)),
        h('dl', { className: 'ad-val-grid' },
          v.range && h('div', { key: 'r' }, h('dt', null, 'Range'), h('dd', null,
            `${fmtMoney(v.range.low, v.currency)} – ${fmtMoney(v.range.high, v.currency)}`)),
          h('div', { key: 's' }, h('dt', null, 'Sources'), h('dd', null,
            (v.sources && v.sources.length ? v.sources.join(', ') : `${v.n_sources ?? '?'} source(s)`))),
          h('div', { key: 'o' }, h('dt', null, 'Observations'), h('dd', null, String(v.n_observations ?? '—'))),
          h('div', { key: 'd' }, h('dt', null, 'As of'), h('dd', null, fmtDate(v.as_of) || '—')),
          (v.trend_7d_pct != null || v.trend_30d_pct != null) && h('div', { key: 't' },
            h('dt', null, 'Trend'), h('dd', null,
              [v.trend_7d_pct != null && `7d ${v.trend_7d_pct > 0 ? '+' : ''}${v.trend_7d_pct}%`,
               v.trend_30d_pct != null && `30d ${v.trend_30d_pct > 0 ? '+' : ''}${v.trend_30d_pct}%`].filter(Boolean).join(' · '))),
        ),
        reason && h('p', { className: 'ad-note' }, `Confidence: ${reason}`),
        h('p', { className: 'ad-disclaimer' }, 'DraGold estimate aggregated from market sources — not a confirmed sale price.'));
    }));
}

function LiveMarket({ lm }) {
  if (!lm) return null;
  if (lm.available === false) {
    return h('section', { className: 'ad-sec' }, h('h3', null, 'Live market'),
      h('p', { className: 'ad-card-meta' }, `Not available (${lm.reason}).`));
  }
  return h('section', { className: 'ad-sec' }, h('h3', null, `Live market — ${lm.market || ''}`),
    h('p', { className: 'ad-card-meta' },
      `${lm.summary?.count ?? 0} active listings · from ${fmtMoney(lm.summary?.lowest, lm.summary?.currency)} · as of ${fmtDate(lm.as_of)}`),
    h('ul', { className: 'ad-listings' }, (lm.listings || []).slice(0, 5).map((l, i) =>
      h('li', { key: i }, h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' },
        `${fmtMoney(l.price, l.currency)} — ${l.title?.slice(0, 70)}`)))),
    h('p', { className: 'ad-disclaimer' }, 'Active asking prices, not sold data and not a DraGold valuation.'));
}

function KnowledgeGraph({ kg }) {
  if (!kg || kg.error) return null;
  const hasContent = (kg.same_illustrator?.length || kg.set_relationships?.length || kg.reprints_and_variants?.length);
  if (!hasContent) return null;
  return h('section', { className: 'ad-sec ad-kg' },
    h('h3', null, 'Knowledge Graph context'),
    kg.same_illustrator?.length ? h('div', { className: 'ad-kg-row' },
      h('span', { className: 'ad-kg-label' }, 'Same illustrator'),
      h('span', null, kg.same_illustrator.slice(0, 5).map(c => c.name).join(', '))) : null,
    kg.set_relationships?.length ? h('div', { className: 'ad-kg-row' },
      h('span', { className: 'ad-kg-label' }, 'Set relationships'),
      h('span', null, kg.set_relationships.map(s => `${s.alias_set_id}→${s.canonical_set_id} (${s.relation}/${s.confidence})`).join('; '))) : null,
    kg.reprints_and_variants?.length ? h('div', { className: 'ad-kg-row' },
      h('span', { className: 'ad-kg-label' }, 'Reprints / variants'),
      h('span', null, `${kg.reprints_and_variants.length} other printing(s) sharing this card's identity`)) : null,
    h('p', { className: 'ad-disclaimer' }, kg.roadmap_note));
}

function Collection({ c }) {
  if (!c) return null;
  if (c.available === false) {
    return h('section', { className: 'ad-sec' }, h('h3', null, 'Your collection'),
      h('p', { className: 'ad-card-meta' },
        c.reason === 'sign_in_required'
          ? 'Sign in to DraGold to include your collection in the answer.'
          : `Not available (${c.reason || 'unknown'}).`));
  }
  if (c.mode === 'set_completion') {
    return h('section', { className: 'ad-sec' }, h('h3', null, `Set completion — ${c.set_id}`),
      h('dl', { className: 'ad-val-grid' },
        h('div', { key: 'a' }, h('dt', null, 'Set size (EN)'), h('dd', null, String(c.total_cards_en ?? '—'))),
        h('div', { key: 'b' }, h('dt', null, 'You own (est.)'), h('dd', null, String(c.owned_estimate ?? '—'))),
        h('div', { key: 'c' }, h('dt', null, 'Missing (est.)'), h('dd', null, String(c.missing_estimate ?? '—')))),
      h('p', { className: 'ad-disclaimer' }, c.caveat));
  }
  return h('section', { className: 'ad-sec' }, h('h3', null, 'Your collection'),
    h('div', { className: 'ad-val' },
      h('div', { className: 'ad-val-top' },
        h('span', { className: 'ad-val-price' }, fmtMoney(c.estimated_total_eur, 'EUR')),
        h('span', { className: 'ad-conf' }, `${c.valued_cards}/${c.total_cards} valued`)),
      h('dl', { className: 'ad-val-grid' },
        h('div', { key: 'd' }, h('dt', null, 'Distinct cards'), h('dd', null, String(c.distinct_cards ?? '—'))),
        h('div', { key: 'u' }, h('dt', null, 'Not yet valued'), h('dd', null, String(c.unvalued_cards ?? '—'))),
        c.confidence_mix && h('div', { key: 'm' }, h('dt', null, 'Confidence'), h('dd', null,
          Object.entries(c.confidence_mix).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(' · ') || '—'))),
      h('p', { className: 'ad-disclaimer' }, c.disclaimer)));
}

export function AskDossier({ result }) {
  if (!result) return null;
  const { answer, meta = {}, evidence = {} } = result;
  return h('article', { className: 'ad' },
    h(Answer, { text: answer }),
    h(CardsUsed, { cards: evidence.cards }),
    h(Versions, { versions: evidence.versions }),
    h(Valuations, { valuations: evidence.valuations }),
    h(LiveMarket, { lm: evidence.live_market }),
    h(KnowledgeGraph, { kg: evidence.knowledge_graph }),
    h(Collection, { c: evidence.collection }),
    h('footer', { className: 'ad-meta' },
      `${meta.provider || '?'}/${meta.model || '?'} · ${meta.tools_used?.join(', ') || 'no tools'} · ${meta.latency_ms ? Math.round(meta.latency_ms / 100) / 10 + 's' : ''}` +
      (meta.outcome === 'insufficient_data' ? ' · flagged: insufficient data' : '')),
  );
}

export default AskDossier;
