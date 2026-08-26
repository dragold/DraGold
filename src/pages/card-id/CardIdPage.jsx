// DraGold Card ID — microproduct verticale (sprint 2026-08-26).
// Thin layer sopra il catalogo/Knowledge Graph esistente: nessun secondo
// motore di ricerca (riusa lib/search.js searchCards, gia' usato da
// SearchView.jsx), nessuna seconda Card Page (il click su un risultato apre
// il deep link /card/{id} gia' esistente, gestito da DraGold.jsx), nessuna
// seconda collection (Add to Collection resta dentro quella pagina). L'unica
// superficie nuova qui e' la ricerca dedicata "identificazione" + il flusso
// di missing-card contribution (sez. 8/9 del task).
import { useState, useCallback, useEffect } from "react";
import { Icon } from "../../components/shared/Icon.jsx";
import { SearchResults } from "../../components/search/SearchResults.jsx";
import { Sheet } from "../../components/shared/Sheet.jsx";
import { searchCards } from "../../lib/search.js";
import { isOfficialImageUrl } from "../../lib/cardId.js";
import { submitCardContribution, getMyContributorLevel } from "../../supabase.js";
import { useAuth } from "../../lib/auth.js";
import { TCG_LIST, CARD_LANGS } from "../../DraGold.jsx";

const EXAMPLES = ["Pikachu 173", "Charizard 151", "SVP 001"];
// CARD_LANGS in DraGold.jsx ha voci duplicate (stesso codice lingua ripetuto
// piu' volte per via di un array letterale con copia-incolla storico) — qui
// serve un select con un'opzione per lingua, quindi si deduplica per codice
// invece di introdurre una seconda lista lingue.
const LANGUAGE_OPTIONS = CARD_LANGS.filter((l, i) => CARD_LANGS.findIndex(x => x.c === l.c) === i);

function MissingCardSheet({ initialName, onClose }) {
  const { isAuthed } = useAuth();
  const [game, setGame] = useState("pokemon");
  const [name, setName] = useState(initialName || "");
  const [setNameVal, setSetNameVal] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [language, setLanguage] = useState("en");
  const [rarity, setRarity] = useState("");
  const [variant, setVariant] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [level, setLevel] = useState(null);

  // Data quality (sez. 15 del task): prima di poter inviare, un check reale di
  // duplicati sugli stessi campi che il DB usa davvero (nome + card_number +
  // lingua), riusando lo stesso motore di ricerca del resto del prodotto —
  // nessuna euristica nuova, nessuna query fuzzy aggiuntiva.
  const [dupChecked, setDupChecked] = useState(false);
  const [dupMatches, setDupMatches] = useState([]);
  const [dupBusy, setDupBusy] = useState(false);

  const invalidateDupCheck = () => setDupChecked(false);

  async function checkDuplicates() {
    setDupBusy(true);
    try {
      const q = cardNumber.trim() ? `${name} ${cardNumber}` : name;
      const found = await searchCards(q);
      const matches = found.filter(c =>
        (c.card_number || "").toLowerCase() === cardNumber.trim().toLowerCase() &&
        (c.lang || "").toLowerCase() === language
      ).slice(0, 5);
      setDupMatches(matches);
    } catch { /* best-effort: un check fallito non deve bloccare l'invio */ }
    setDupChecked(true);
    setDupBusy(false);
  }

  async function submit(e) {
    e.preventDefault();
    if (busy || dupBusy) return;
    if (!name.trim() || !setNameVal.trim() || !cardNumber.trim() || !language) {
      setErr("Fill in card name, set, number and language.");
      return;
    }
    if (imageUrl.trim() && !isOfficialImageUrl(imageUrl)) {
      setErr("Please use an image URL from an approved official source.");
      return;
    }
    if (!isAuthed) { window.location.href = "/login"; return; }
    if (!dupChecked) { setErr(""); await checkDuplicates(); return; }
    setBusy(true); setErr("");
    const res = await submitCardContribution({
      game, name: name.trim(), setName: setNameVal.trim(), cardNumber: cardNumber.trim(),
      language, rarity: rarity.trim() || null, variant: variant.trim() || null,
      imageUrl: imageUrl.trim() || null, notes: notes.trim() || null, sourceUrl: sourceUrl.trim() || null,
    });
    setBusy(false);
    if (res?.error) { setErr(res.error.message || "Could not submit. Please try again."); return; }
    setDone(true);
    getMyContributorLevel().then(setLevel).catch(() => {});
  }

  if (done) {
    return (
      <Sheet title="Thanks!" onClose={onClose}>
        <p className="auth-p">Your submission was sent for review. We'll add it to the catalog once verified.</p>
        {level && <p className="hint-center">Contributor level: <b>{level.level}</b> ({level.approved_count} approved)</p>}
        <button type="button" className="btn btn-primary btn-block" onClick={onClose}>Done</button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Add missing card" onClose={onClose}>
      <form onSubmit={submit} className="sheet-form">
        {!isAuthed && <p className="auth-p">Sign in to submit a card to DraGold — takes less than a minute.</p>}
        <label className="field-lbl">Game</label>
        <select className="input" value={game} onChange={e => { setGame(e.target.value); invalidateDupCheck(); }}>
          {TCG_LIST.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <label className="field-lbl">Card name</label>
        <input className="input" value={name} onChange={e => { setName(e.target.value); invalidateDupCheck(); }} placeholder="e.g. Pikachu" autoFocus />
        <label className="field-lbl">Set</label>
        <input className="input" value={setNameVal} onChange={e => { setSetNameVal(e.target.value); invalidateDupCheck(); }} placeholder="e.g. Scarlet & Violet — 151" />
        <label className="field-lbl">Card number</label>
        <input className="input" value={cardNumber} onChange={e => { setCardNumber(e.target.value); invalidateDupCheck(); }} placeholder="e.g. 173/165" />
        <label className="field-lbl">Language</label>
        <select className="input" value={language} onChange={e => { setLanguage(e.target.value); invalidateDupCheck(); }}>
          {LANGUAGE_OPTIONS.map(l => <option key={l.c} value={l.c}>{l.flag} {l.label}</option>)}
        </select>
        <label className="field-lbl">Rarity (optional)</label>
        <input className="input" value={rarity} onChange={e => setRarity(e.target.value)} placeholder="e.g. Illustration Rare" />
        <label className="field-lbl">Variant / finish (optional)</label>
        <input className="input" value={variant} onChange={e => setVariant(e.target.value)} placeholder="e.g. Reverse holo" />
        <label className="field-lbl">Card image (optional)</label>
        <p className="auth-p" style={{ fontSize: 13, margin: "-2px 0 8px" }}>
          Use an image URL from an official source only. Official sources: Pokémon, One Piece, or other approved official sources. Do not submit images from marketplaces, social media, Google Images, or other third-party websites.
        </p>
        <input className="input" value={imageUrl} onChange={e => { setImageUrl(e.target.value); if (err) setErr(""); }} placeholder="https://…" />
        <label className="field-lbl">Notes (optional)</label>
        <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything else that helps us verify it" />
        <label className="field-lbl">Source / reference (optional)</label>
        <input className="input" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="Link to a listing, scan, or official source" />

        {dupBusy && <p className="hint-center">Checking for duplicates…</p>}
        {dupChecked && dupMatches.length > 0 && (
          <div className="auth-err" style={{ color: "var(--text)" }}>
            <strong>Possible duplicate</strong> — this card might already be in DraGold:
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {dupMatches.map(m => (
                <li key={m.id}>
                  <a href={`/card/${encodeURIComponent(m.id)}`} target="_blank" rel="noreferrer">
                    {m.name} — {m.set_name} #{m.card_number}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {err && <div className="auth-err">{err}</div>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || dupBusy}>
          {busy ? "Submitting…" : dupChecked ? (dupMatches.length > 0 ? "Submit anyway" : "Submit") : "Check & continue"}
        </button>
      </form>
    </Sheet>
  );
}

export default function CardIdPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [term, setTerm] = useState("");
  const [error, setError] = useState(null);
  const [missingOpen, setMissingOpen] = useState(false);
  const [missingSeed, setMissingSeed] = useState("");

  useEffect(() => { document.title = "DraGold Card ID — Identify Pokémon & TCG Cards"; }, []);

  const runSearch = useCallback(async (query) => {
    const trimmed = (query || "").trim();
    if (!trimmed) return;
    setLoading(true); setError(null); setSearched(true); setTerm(trimmed);
    try {
      const cards = await searchCards(trimmed);
      setResults(cards);
    } catch (e) {
      setError(e.message || "Unknown error.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Aprire una carta identificata = navigare al deep link /card/{id} gia'
  // esistente (DraGold.jsx, sez. 4/7 del task): stessa AssetView con
  // Add to Collection, niente Card Page nuova/duplicata.
  const onOpen = useCallback((card) => {
    if (card?.id) window.location.href = `/card/${encodeURIComponent(card.id)}`;
  }, []);

  const onSubmit = (e) => { e.preventDefault(); runSearch(q); };
  const openMissing = useCallback(() => { setMissingSeed(term || q); setMissingOpen(true); }, [term, q]);

  return (
    <div className="app">
      <main className="main">
        <a href="/" className="chip" style={{ display: "inline-block", marginBottom: 18 }}>← DraGold</a>
        <section className="view">
          <div className="hero">
            <h1 className="hero-t">Identify any card.</h1>
            <p className="hero-s">
              Find the exact set, number, language and variant — then add it to your collection
              or copy a ready-to-use listing description.
            </p>
          </div>

          <form className="search" onSubmit={onSubmit}>
            <span className="search-ic"><Icon name="search" size={20} /></span>
            <input
              className="search-in"
              placeholder="Search by name, number or set…"
              value={q} onChange={e => setQ(e.target.value)}
              enterKeyHint="search" autoComplete="off"
            />
            <button type="submit" className="search-go">Search</button>
          </form>

          {!searched && (
            <p className="hint-center" style={{ textAlign: "left" }}>
              Try:{" "}
              {EXAMPLES.map(ex => (
                <button key={ex} type="button" className="chip" style={{ marginRight: 6 }}
                  onClick={() => { setQ(ex); runSearch(ex); }}>
                  {ex}
                </button>
              ))}
            </p>
          )}

          {searched && (
            <SearchResults
              loading={loading} results={results} priceMap={{}} error={error} term={term}
              country="IT" cur="EUR" eurRate={0.92}
              onRetry={() => runSearch(term)} onOpen={onOpen} setsMap={null}
              hasMore={false} totalCount={results.length}
              onMissingCard={openMissing}
              identifyMode
            />
          )}

          {searched && !loading && results.length > 0 && (
            <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 16 }} onClick={openMissing}>
              Can't find your exact version? Add missing card →
            </button>
          )}
        </section>
      </main>
      {missingOpen && <MissingCardSheet initialName={missingSeed} onClose={() => setMissingOpen(false)} />}
    </div>
  );
}
