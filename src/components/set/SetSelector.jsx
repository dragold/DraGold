import { useState, useEffect, useMemo, createElement as h } from 'react';
import { supabase } from '../../supabase.js';
import { loadTcgSets, loadLangSets } from '../../lib/tcgSets.js';
import { buildSetSlug, parseSetSlug } from '../../lib/setSlug.js';
import { getTcgHub } from '../../lib/tcgConfig.js';
import { useAuth } from '../../lib/auth.js';
import { Icon } from '../../components/shared/Icon.jsx';

const MVP_SET_SLUGS = [
  'onepiece-op-01', 'onepiece-op-02', 'onepiece-eb-01', 'onepiece-eb-02',
  'pokemon-sv07', 'pokemon-sv08'
];

const MVP_SET_IDS = {
  'onepiece-op-01': { tcg: 'onepiece', setId: 'OP-01', label: 'OP-01' },
  'onepiece-op-02': { tcg: 'onepiece', setId: 'OP-02', label: 'OP-02' },
  'onepiece-eb-01': { tcg: 'onepiece', setId: 'EB-01', label: 'EB-01' },
  'onepiece-eb-02': { tcg: 'onepiece', setId: 'EB-02', label: 'EB-02' },
  'pokemon-sv07': { tcg: 'pokemon', setId: 'SV07', label: 'SV07' },
  'pokemon-sv08': { tcg: 'pokemon', setId: 'SV08', label: 'SV08' },
};

export function SetSelector({ onSelectSet, selectedSlug, className = '' }) {
  const { status: authStatus } = useAuth();
  const isAuthed = authStatus === 'authenticated';
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedTcg, setExpandedTcg] = useState(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        // Load all TCG sets (cached via lib/tcgSets.js)
        const [{ sets: pokeSets }, { sets: opSets }] = await Promise.all([
          loadTcgSets('pokemon'),
          loadTcgSets('onepiece'),
        ]);

        if (!alive) return;

        // Filter to MVP sets + add a few recent ones for context
        const mvpSlugs = new Set(MVP_SET_SLUGS);
        const all = [...(pokeSets || []), ...(opSets || [])];
        const mvp = all.filter(s => mvpSlugs.has(s.slug));

        // Add recent sets for context (last 4 per TCG)
        const recent = all
          .filter(s => !mvpSlugs.has(s.slug) && s.releaseDate)
          .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate))
          .slice(0, 8);

        setSets([...mvp, ...recent]);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  const grouped = useMemo(() => {
    const groups = { pokemon: [], onepiece: [], other: [] };
    for (const s of sets) {
      if (groups[s.tcg]) groups[s.tcg].push(s);
      else groups.other.push(s);
    }
    return groups;
  }, [sets]);

  const tcgOrder = ['pokemon', 'onepiece'];
  const hub = getTcgHub;

  if (loading) {
    return h('div', { className: 'dg-set-selector ' + className, style: styles.container },
      h('div', { style: styles.skeletonRow }, Array.from({ length: 6 }).map((_, i) =>
        h('div', { key: i, style: styles.skeletonCard })
      ))
    );
  }

  if (error) {
    return h('div', { className: 'dg-set-selector ' + className, style: styles.container },
      h('p', { style: styles.error }, 'Failed to load sets: ' + error)
    );
  }

  return h('div', { className: 'dg-set-selector ' + className, style: styles.container },
    h('div', { style: styles.header },
      h('h3', { style: styles.title }, 'Pick a Set'),
      h('p', { style: styles.subtitle }, 'MVP sets first — then recent releases')
    ),
    tcgOrder.map(tcgId => {
      const tcgSets = grouped[tcgId] || [];
      if (!tcgSets.length) return null;
      const tcg = hub(tcgId);
      const isExpanded = expandedTcg === tcgId;

      return h('div', { key: tcgId, style: styles.tcgSection },
        h('button', {
          type: 'button',
          style: { ...styles.tcgHeader, borderColor: tcg?.color || '#4b3cff' },
          onClick: () => setExpandedTcg(isExpanded ? null : tcgId),
          'aria-expanded': isExpanded,
        },
          h('img', { src: tcg?.logo, alt: '', style: { ...styles.tcgLogo, borderColor: tcg?.color || '#4b3cff' } }),
          h('span', { style: { ...styles.tcgLabel, color: tcg?.color || '#4b3cff' } }, tcg?.label || tcgId),
          h('span', { style: styles.tcgCount }, tcgSets.length + ' sets'),
          h(Icon, { name: 'chevron', size: 16, style: { ...styles.chevron, transform: isExpanded ? 'rotate(180deg)' : '' } })
        ),
        isExpanded && h('div', { style: styles.setGrid }, tcgSets.map(s => {
          const isMVP = MVP_SET_SLUGS.includes(s.slug);
          const isSelected = selectedSlug === s.slug;

          return h('button', {
            key: s.slug,
            type: 'button',
            style: {
              ...styles.setCard,
              borderColor: isSelected ? (tcg?.color || '#4b3cff') : '#2a2a3a',
              background: isSelected ? (tcg?.color || '#4b3cff') + '22' : '#0f0f18',
              boxShadow: isSelected ? '0 0 0 1px ' + (tcg?.color || '#4b3cff') : 'none',
            },
            onClick: () => onSelectSet(s.slug),
            'aria-current': isSelected ? 'true' : 'false',
          },
            h('div', { style: styles.setCardLogo },
              s.logoUrl ? h('img', { src: s.logoUrl, alt: '', style: styles.setLogo, loading: 'lazy' }) :
                h('div', { style: { ...styles.setLogoFallback, color: tcg?.color || '#4b3cff' } }, s.setId)
            ),
            h('div', { style: styles.setCardInfo },
              h('div', { style: styles.setCardName }, s.setName),
              h('div', { style: styles.setCardMeta },
                h('span', null, s.setId),
                s.releaseYear && h('span', null, '·', s.releaseYear),
                h('span', null, s.cardCount + ' cards')
              ),
              isMVP && h('span', { style: styles.mvpBadge }, 'MVP')
            )
          );
        }))
      );
    }),
    grouped.other.length && h('div', { style: styles.tcgSection },
      h('div', { style: styles.tcgHeader },
        h('span', { style: styles.tcgLabel }, 'Other TCGs'),
        h('span', { style: styles.tcgCount }, grouped.other.length + ' sets')
      ),
      h('div', { style: styles.setGrid }, grouped.other.map(s => {
        const tcg = hub(s.tcg);
        return h('button', {
          key: s.slug,
          type: 'button',
          style: styles.setCard,
          onClick: () => onSelectSet(s.slug),
        },
          h('div', { style: styles.setCardLogo },
            s.logoUrl ? h('img', { src: s.logoUrl, alt: '', style: styles.setLogo, loading: 'lazy' }) :
              h('div', { style: { ...styles.setLogoFallback, color: tcg?.color || '#4b3cff' } }, s.setId)
          ),
          h('div', { style: styles.setCardInfo },
            h('div', { style: styles.setCardName }, s.setName),
            h('div', { style: styles.setCardMeta },
              h('span', null, s.setId),
              s.releaseYear && h('span', null, '·', s.releaseYear)
            )
          )
        );
      }))
    )
  );
}

const styles = {
  container: { background: '#020208', borderRadius: 12, padding: 16, border: '1px solid #1a1a28' },
  header: { marginBottom: 16 },
  title: { margin: '0 0 4px', fontSize: 16, fontWeight: 700 },
  subtitle: { margin: 0, fontSize: 12, color: '#777' },
  skeletonRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 },
  skeletonCard: { height: 100, background: '#14141f', borderRadius: 8 },
  error: { color: '#f87171', fontSize: 13 },
  tcgSection: { marginBottom: 16 },
  tcgHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', background: '#0a0a12', borderRadius: 8,
    border: '1px solid', cursor: 'pointer', width: '100%', textAlign: 'left'
  },
  tcgLogo: { height: 20, width: 20, borderRadius: 4, borderWidth: 1, borderStyle: 'solid' },
  tcgLabel: { fontSize: 13, fontWeight: 600, flex: 1 },
  tcgCount: { fontSize: 11, color: '#777', padding: '2px 8px', background: '#1a1a28', borderRadius: 10 },
  chevron: { transition: 'transform 0.15s', color: '#777' },
  setGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginTop: 10 },
  setCard: {
    display: 'flex', flexDirection: 'column', gap: 8,
    padding: 12, background: '#0f0f18', border: '1px solid', borderRadius: 10,
    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s'
  },
  setCardLogo: { height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  setLogo: { maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', borderRadius: 4 },
  setLogoFallback: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', fontSize: 11, fontWeight: 700, border: '1px dashed currentColor', borderRadius: 6, padding: '0 8px' },
  setCardInfo: { display: 'flex', flexDirection: 'column', gap: 4 },
  setCardName: { fontSize: 12, fontWeight: 600, lineHeight: 1.3 },
  setCardMeta: { display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 10, color: '#777' },
  mvpBadge: { fontSize: 9, fontWeight: 700, color: '#fbbf24', background: '#4b3c1a', border: '1px solid #6b5c00', borderRadius: 4, padding: '1px 6px', width: 'fit-content' },
};