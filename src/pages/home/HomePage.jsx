import { useRef, useState, useEffect, lazy, Suspense } from "react";
import { AtlasGrid } from "./AtlasGrid.jsx";
import { Stratum } from "./Stratum.jsx";
import { DoorRail } from "./DoorRail.jsx";
import { CardSpecimen } from "./CardSpecimen.jsx";
import { SpecimenTile } from "./SpecimenTile.jsx";
import { useAtlasChoreography } from "./useAtlasChoreography.js";
import { useAtlasScrollProgress } from "./webgl/useAtlasScrollProgress.js";
import { detectTier } from "./webgl/gpuTier.js";
import { webglImage } from "./webgl/webglImage.js";
import { WebGLBoundary } from "./webgl/WebGLBoundary.jsx";
import { Icon } from "../../components/shared/Icon.jsx";

const AtlasCanvas = lazy(() => import("./webgl/AtlasCanvas.jsx"));
import { slugifyIllustrator } from "../../lib/illustratorSlug.js";
import { buildSetSlug } from "../../lib/setSlug.js";
import { getCategory } from "../academy/academyContent.js";
import "./home.css";

const TCG_LABEL = { pokemon: "Pokémon", onepiece: "One Piece", mtg: "Magic", ygo: "Yu-Gi-Oh!" };

export function HomePage({ home, onOpenSearch, onOpenCard, onOpenSet, onNavCollection }) {
  const {
    loading,
    featured,
    prints = [],
    set,
    setTotal,
    setOwned,
    siblings = [],
    timeline = [],
    lessons = [],
  } = home || {};

  const stageRef = useRef(null);
  const specimenRef = useRef(null);

  // WebGL tier — decided once on mount. tier 0 → the CSS-3D Atlas (below).
  // webglFailed flips permanently if the 3D layer ever throws.
  const [tier, setTier] = useState(0);
  const [webglFailed, setWebglFailed] = useState(false);
  useEffect(() => {
    setTier(detectTier());
  }, []);
  const webglImg = featured ? webglImage(featured) : null;
  const webgl = tier > 0 && !webglFailed && !!webglImg;

  useAtlasChoreography(stageRef, specimenRef, { enabled: !webgl });
  useAtlasScrollProgress(stageRef);

  const otherPrints = prints.filter((p) => p.id !== featured?.id);
  const setSlug = set && featured ? buildSetSlug(featured.tcg, set.set_code) : null;
  const currentIdx = timeline.findIndex((s) => s.set_code === set?.set_code);

  const anchor = currentIdx >= 0 ? currentIdx : Math.max(0, timeline.length - 10);
  const tlStart = Math.max(0, anchor - 7);
  const tlEnd = Math.min(timeline.length, anchor + 9);
  const tlWindow = timeline.slice(tlStart, tlEnd);

  const specimenCaption = featured
    ? `${TCG_LABEL[featured.tcg] || featured.tcg} ${(featured.lang || "").toUpperCase()} · ${featured.set_name || ""} ${featured.card_number || ""}`.trim()
    : loading
      ? "Finding a card…"
      : null;

  return (
    <div className={`home${webgl ? " has-webgl" : ""}`}>
      {webgl && (
        <WebGLBoundary onFail={() => setWebglFailed(true)}>
          <Suspense fallback={null}>
            <AtlasCanvas tier={tier} src={webglImg} rarity={featured?.rarity || ""} icons={home?.icons || []} />
          </Suspense>
        </WebGLBoundary>
      )}
      <div className="atlas-stage" ref={stageRef}>
        {/* ── intro (threshold copy) ── */}
        <div className="atlas-intro">
          <AtlasGrid className="intro-grid">
            <div className="intro-copy">
              <p className="threshold-eyebrow">THE TCG KNOWLEDGE GRAPH</p>
              <h1 className="threshold-h font-syne">
                Every card<br />is a <span className="threshold-em">door</span>.
              </h1>
              <p className="threshold-sub">
                Search one card and follow it outward — through its prints, its
                language editions, its set, and the twenty years of releases
                standing behind it.
              </p>
              <button className="threshold-search" onClick={onOpenSearch}>
                <Icon name="search" size={18} />
                <span>Search a card, set or illustrator</span>
                <kbd>⌘K</kbd>
              </button>
              <button className="threshold-scroll" type="button" onClick={scrollToFirstStratum}>
                or follow this one down ↓
              </button>
            </div>
          </AtlasGrid>
        </div>

        {/* ── the card, riding the descent (sticky on desktop) ── */}
        <div className="atlas-aside">
          <div className="atlas-specimen">
            <CardSpecimen ref={specimenRef} card={featured} caption={specimenCaption} />
          </div>
        </div>

        {/* ── the strata ── */}
        <div className="strata">
          {/* 1 · Identity */}
          <Stratum edgeLabel="THE CARD" depth="01" voice="A card knows what it is." index={0} id="stratum-identity" card={featured}>
            {featured ? (
              <dl className="ledger">
                <Fact k="Name">{featured.name}</Fact>
                <Fact k="Number">{featured.card_number || "—"}</Fact>
                <Fact k="Rarity">{featured.rarity || "—"}</Fact>
                <Fact k="Illustrator">
                  {featured.illustrator ? (
                    <a href={`/illustrator/${slugifyIllustrator(featured.illustrator)}`}>{featured.illustrator}</a>
                  ) : (
                    "—"
                  )}
                </Fact>
                <Fact k="Set">{featured.set_name || "—"}</Fact>
                <Fact k="Language">{(featured.lang || "").toUpperCase() || "—"}</Fact>
              </dl>
            ) : (
              <LedgerSkeleton />
            )}
            <Doors>
              <a href="/card-id">Identify a card you're holding →</a>
              {featured?.illustrator && (
                <a href={`/illustrator/${slugifyIllustrator(featured.illustrator)}`}>
                  Every card {featured.illustrator} drew →
                </a>
              )}
            </Doors>
          </Stratum>

          {/* 2 · Set */}
          <Stratum edgeLabel="CARD → SET" depth="02" voice="And it belongs somewhere." index={0} id="stratum-set" card={featured}>
            {set ? (
              <>
                <div className="set-identity">
                  {set.logo_url ? (
                    <img className="set-identity-logo" src={set.logo_url} alt={set.set_name} />
                  ) : (
                    <span className="set-identity-logo set-identity-logo-fb">{set.set_name}</span>
                  )}
                  <div className="set-identity-meta">
                    <span className="font-syne set-identity-name">{set.set_name}</span>
                    <span className="set-identity-sub">
                      {[
                        typeof setTotal === "number" ? `${setTotal} cards` : null,
                        set.release_year ? `released ${set.release_year}` : null,
                        typeof setOwned === "number" && typeof setTotal === "number"
                          ? `${setOwned} in your collection`
                          : null,
                      ]
                        .filter(Boolean)
                        .join("  ·  ")}
                    </span>
                  </div>
                </div>
                {siblings.length > 0 && (
                  <DoorRail label={`Other cards from ${set.set_name}`}>
                    {siblings.map((c) => (
                      <SpecimenTile key={c.id} card={c} onOpen={onOpenCard} />
                    ))}
                  </DoorRail>
                )}
              </>
            ) : (
              <p className="stratum-note">{loading ? "Reading the set…" : "This card isn't linked to a set yet."}</p>
            )}
            <Doors>
              {setSlug && (
                <a
                  href={`/set/${setSlug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenSet?.({ tcg: featured.tcg, set_id: set.set_code, lang: featured.lang, set_name: set.set_name });
                  }}
                >
                  Open the full set →
                </a>
              )}
            </Doors>
          </Stratum>

          {/* 3 · Print / Language */}
          <Stratum
            edgeLabel="CARD → PRINT / LANGUAGE"
            depth="03"
            voice="The same card speaks more than one language."
            index={0}
            id="stratum-print"
            card={featured}
          >
            {otherPrints.length > 0 ? (
              <DoorRail label="Prints and language editions of this card">
                {featured && <SpecimenTile card={featured} onOpen={onOpenCard} />}
                {otherPrints.map((p) => (
                  <SpecimenTile key={p.id} card={p} relation={p.lang !== featured?.lang} onOpen={onOpenCard} />
                ))}
              </DoorRail>
            ) : (
              <p className="stratum-note">
                {loading ? "Looking for other prints…" : "One known print of this card in the catalog so far."}
              </p>
            )}
            <Doors>
              <a href="/academy/pokemon-en-jp">Why an EN card and its JP print aren't the same card →</a>
            </Doors>
          </Stratum>

          {/* 4 · History */}
          <Stratum edgeLabel="SET → RELEASE TIMELINE" depth="04" voice="It arrived at a moment." index={0} id="stratum-history" card={featured}>
            {tlWindow.length > 1 ? (
              <DoorRail label={`${TCG_LABEL[featured?.tcg] || "TCG"} sets in release order`}>
                {tlStart > 0 && <span className="tl-ellipsis">← {tlStart} earlier</span>}
                {tlWindow.map((s) => (
                  <a
                    key={s.set_code}
                    className={`tl-mark${s.set_code === set?.set_code ? " is-current" : ""}`}
                    href={`/set/${buildSetSlug(featured.tcg, s.set_code)}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onOpenSet?.({ tcg: featured.tcg, set_id: s.set_code, lang: featured.lang, set_name: s.set_name });
                    }}
                  >
                    <span className="tl-year">{s.year}</span>
                    <span className="tl-name">{s.set_name}</span>
                    {s.set_code === set?.set_code && <span className="tl-here">this card</span>}
                  </a>
                ))}
                {tlEnd < timeline.length && <span className="tl-ellipsis">{timeline.length - tlEnd} later →</span>}
              </DoorRail>
            ) : (
              <p className="stratum-note">Release dates for this line aren't complete yet.</p>
            )}
            {currentIdx >= 0 && timeline.length > 1 && (
              <p className="tl-caption">
                {set?.set_name} is release {currentIdx + 1} of {timeline.length} in {TCG_LABEL[featured?.tcg]}
                {featured?.lang ? ` ${featured.lang.toUpperCase()}` : ""}.
              </p>
            )}
            <Doors>
              <a href="/academy/tcg-basics">How sets, reprints and releases work →</a>
            </Doors>
          </Stratum>

          {/* 5 · Knowledge */}
          <Stratum
            edgeLabel="CARD → KNOWLEDGE"
            depth="05"
            voice={<>Don't just collect it. <span className="threshold-em">Know it.</span></>}
            index={0}
            id="stratum-knowledge"
            card={featured}
          >
            <p className="know-lead">
              Every card on DraGold opens onto something to read — how its rarity
              works, why its Japanese print differs, what the symbols on it mean.
            </p>
            <div className="know-grid">
              {lessons.map((l) => (
                <a className="know-card" href={`/academy/${l.slug}`} key={l.slug}>
                  <span className="know-cat">{getCategory(l.category)?.label || l.category}</span>
                  <span className="know-title font-syne">{l.title}</span>
                  <span className="know-sum">{l.summary}</span>
                  <span className="know-min">{l.minutes} min read</span>
                </a>
              ))}
            </div>
            <Doors>
              <a href="/academy">Everything in the Academy →</a>
            </Doors>
          </Stratum>

          {/* 6 · Collection */}
          <Stratum
            edgeLabel="CARD → COLLECTION"
            depth="06"
            voice="And then it's part of something you're building."
            index={0}
            id="stratum-collection"
            card={featured}
          >
            {typeof setOwned === "number" && typeof setTotal === "number" && setTotal > 0 ? (
              <div className="coll">
                <Ring owned={setOwned} total={setTotal} label={set?.set_name} />
                <p className="coll-copy">
                  Gold where you've been, ink where you haven't. Open your
                  collection to see every set laid out the same way.
                </p>
              </div>
            ) : (
              <div className="coll">
                <div className="coll-preview" aria-hidden="true">
                  {Array.from({ length: 32 }).map((_, i) => (
                    <span key={i} className={`coll-cell${[0, 1, 4, 8, 9, 12, 16, 17, 24].includes(i) ? " is-owned" : ""}`} />
                  ))}
                </div>
                <div className="coll-copy">
                  <p>
                    Track which cards you own in every set. Owned cards glow; the
                    gaps stay dark — a set you're close to finishing is obvious
                    at a glance.
                  </p>
                  <a className="btn btn-primary btn-sm" href="/register">Create a free account</a>
                </div>
              </div>
            )}
            <Doors>
              <button type="button" onClick={onNavCollection}>Open your collection →</button>
            </Doors>
          </Stratum>
        </div>
      </div>
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────────────────── */

function scrollToFirstStratum() {
  document.getElementById("stratum-identity")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Fact({ k, children }) {
  return (
    <div className="fact">
      <dt className="fact-k">{k}</dt>
      <dd className="fact-v">{children}</dd>
    </div>
  );
}

function LedgerSkeleton() {
  return (
    <dl className="ledger">
      {Array.from({ length: 6 }).map((_, i) => (
        <div className="fact fact-skel" key={i}>
          <dt className="fact-k">&nbsp;</dt>
          <dd className="fact-v">&nbsp;</dd>
        </div>
      ))}
    </dl>
  );
}

function Doors({ children }) {
  return <div className="stratum-doors">{children}</div>;
}

function Ring({ owned, total, label }) {
  const pct = Math.min(100, Math.round((owned / Math.max(1, total)) * 100));
  return (
    <div
      className="coll-ring"
      style={{ "--pct": `${pct}%` }}
      role="img"
      aria-label={`${owned} of ${total} cards from ${label || "this set"} in your collection`}
    >
      <span className="coll-ring-in">
        <b>{owned}</b>
        <small>/ {total}</small>
      </span>
    </div>
  );
}
