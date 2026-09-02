// DraGold — Portfolio Core (Fase 3)
// Collection intelligence: insight brevi, SOLO se supportate dai dati.
// Tono neutro/descrittivo — MAI consigli ("dovresti diversificare"). Puro.

/**
 * @param {object} portfolio - output di buildPortfolioValuation
 * @returns {Array<{kind:string, text:string, weight:number}>} ordinati per weight desc
 */
export function deriveInsights(portfolio) {
  if (!portfolio) return [];
  const out = [];
  const { totalEur, pricedCount, unvaluedCount, byTcg, bySet, concentration, movers } = portfolio;

  const eur = (n) => `€${Number(n).toFixed(2)}`;

  // concentrazione — solo con >=3 posizioni valutate
  if (pricedCount >= 3 && concentration.top10Pct >= 40) {
    const n = Math.min(10, pricedCount);
    out.push({
      kind: 'concentration',
      text: `Your ${n} most valuable card${n > 1 ? 's' : ''} account for ${concentration.top10Pct.toFixed(0)}% of your tracked value.`,
      weight: concentration.top10Pct,
    });
  }
  if (pricedCount >= 2 && concentration.top1Pct >= 50) {
    out.push({
      kind: 'top1',
      text: `One card is ${concentration.top1Pct.toFixed(0)}% of your tracked value.`,
      weight: concentration.top1Pct + 5,
    });
  }

  // set più prezioso
  if (bySet.length >= 2 && bySet[0].pct >= 25) {
    out.push({
      kind: 'top_set',
      text: `Your most valuable set is ${bySet[0].set} — ${eur(bySet[0].valueEur)} (${bySet[0].pct.toFixed(0)}%).`,
      weight: bySet[0].pct,
    });
  }

  // un solo TCG
  if (byTcg.length === 1 && pricedCount >= 3) {
    out.push({ kind: 'single_tcg', text: `Your tracked value is entirely ${labelTcg(byTcg[0].tcg)}.`, weight: 20 });
  }

  // biggest mover — solo se ci sono dati di trend
  if (movers.length) {
    const m = movers[0];
    const dir = m.trendPct >= 0 ? 'up' : 'down';
    out.push({
      kind: 'mover',
      text: `Biggest mover: ${m.name} ${dir} ${Math.abs(m.trendPct).toFixed(1)}% over ${m.window}.`,
      weight: Math.abs(m.trendPct),
    });
  }

  // carte non valutate — informativo, non allarmante
  if (unvaluedCount > 0 && totalEur > 0) {
    out.push({
      kind: 'unvalued',
      text: `${unvaluedCount} of your ${pricedCount + unvaluedCount} cards aren't valued yet (Japanese printings, uncovered sets).`,
      weight: 10,
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}

function labelTcg(id) {
  return ({ pokemon: 'Pokémon', onepiece: 'One Piece', mtg: 'Magic', ygo: 'Yu-Gi-Oh!' })[id] || id;
}
