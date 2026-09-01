import { useEffect, useState } from "react";
import { supabase } from "../../supabase.js";
import { groupByCanonical } from "../../lib/search.js";
import { setIdCandidates } from "../set/SetDetailPage.jsx";
import { ACADEMY_LESSONS } from "../academy/academyContent.js";
import { selectFeatured } from "./selectFeatured.js";
import { pickLessons, shapeWorldCounts } from "./homeData.pure.js";

export { pickLessons, shapeWorldCounts };

const CARD_COLS =
  "id,tcg,lang,name,set_id,set_name,card_number,rarity,illustrator,image_url,image_url_hi,canonical_card_id,card_image_cache(cached_url,status)";

const EMPTY = {
  loading: true,
  featured: null,
  prints: [],
  set: null,
  setTotal: null,
  setOwned: null,
  siblings: [],
  timeline: [],
  lessons: [],
  worldCounts: null,
};

// Read-only query composition for the Atlas home. Anon-safe; the owned count
// is the only signed-in branch. One featured card, its canonical print group,
// its set (+ real total + your owned count), its set's siblings, the release
// timeline for that TCG, three Academy entry points, and the four world counts.
export function useHomeData({ isAuthed } = {}) {
  const [state, setState] = useState(EMPTY);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!supabase) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }

      try {
        // 1 — candidate pool for the featured card
        const today = new Date().toISOString().slice(0, 10);
        let candidates = [];
        const { data: hp } = await supabase
          .from("hot_picks")
          .select("card_id")
          .eq("computed_date", today)
          .limit(20);
        const hpIds = (hp || []).map((r) => r.card_id).filter(Boolean);
        if (hpIds.length) {
          const { data } = await supabase.from("cards").select(CARD_COLS).in("id", hpIds);
          candidates = data || [];
        }
        if (candidates.filter((c) => c.tcg === "pokemon").length < 3) {
          const { data } = await supabase
            .from("cards")
            .select(CARD_COLS)
            .eq("tcg", "pokemon")
            .in("lang", ["en", "ja"])
            .not("image_url", "is", null)
            .order("updated_at", { ascending: false })
            .limit(120);
          candidates = candidates.concat(data || []);
        }
        // A pool of visually striking cards for the hero (full-art / illustration
        // rares). ilike on a few rarity tokens — cheap, one query.
        const { data: heroPool } = await supabase
          .from("cards")
          .select(CARD_COLS)
          .eq("tcg", "pokemon")
          .in("lang", ["en", "ja"])
          .not("image_url", "is", null)
          .or(
            "rarity.ilike.%illustration rare%,rarity.ilike.%special art%,rarity.ilike.%full art%,rarity.ilike.%alt%art%,rarity.ilike.%secret%"
          )
          .limit(200);
        candidates = candidates.concat(heroPool || []);
        const featured = selectFeatured(candidates);

        // 2 — canonical print / language group
        let prints = [];
        if (featured?.canonical_card_id) {
          const { data } = await supabase
            .from("cards")
            .select(CARD_COLS)
            .eq("canonical_card_id", featured.canonical_card_id)
            .limit(12);
          prints = data || [];
        }

        // 3 — the set: identity + real total + siblings
        let set = null;
        let setTotal = null;
        let siblings = [];
        if (featured?.set_id) {
          const { data: sl } = await supabase
            .from("set_logos")
            .select("set_code,set_name,logo_url,symbol_url,release_date")
            .eq("tcg", featured.tcg)
            .eq("set_code", featured.set_id)
            .limit(1);
          if (sl && sl[0]) {
            set = {
              ...sl[0],
              release_year: sl[0].release_date ? new Date(sl[0].release_date).getFullYear() : null,
            };
          }

          const cand = setIdCandidates(featured.set_id);
          if (cand.length) {
            const { data: setCards } = await supabase
              .from("cards")
              .select("id,set_id,canonical_card_id,name,card_number,image_url,lang,rarity,tcg,set_name")
              .eq("tcg", featured.tcg)
              .eq("lang", featured.lang)
              .in("set_id", cand)
              .limit(4000);
            if (setCards) {
              setTotal = groupByCanonical(setCards).length;
              siblings = setCards
                .filter((c) => c.id !== featured.id && c.image_url && !/sample/i.test(c.image_url))
                .slice(0, 12);
            }
          }
        }

        // 4 — your owned count for that set (signed-in only)
        let setOwned = null;
        if (isAuthed && set?.set_name && featured?.tcg) {
          const { data: u } = await supabase.auth.getUser();
          if (u?.user?.id) {
            const { data: coll } = await supabase
              .from("collection")
              .select("quantity,set_name,tcg")
              .eq("user_id", u.user.id)
              .eq("tcg", featured.tcg)
              .eq("set_name", set.set_name);
            setOwned = (coll || []).reduce((n, r) => n + (r.quantity || 1), 0);
          }
        }

        // 5 — release timeline for this TCG (real dates: pokemon / one piece)
        let timeline = [];
        if (featured?.tcg) {
          const { data: tl } = await supabase
            .from("set_logos")
            .select("set_code,set_name,release_date")
            .eq("tcg", featured.tcg)
            .not("release_date", "is", null)
            .order("release_date", { ascending: true });
          timeline = (tl || []).map((s) => ({
            ...s,
            year: new Date(s.release_date).getFullYear(),
          }));
        }

        // 6 — academy entry points
        const lessons = pickLessons(ACADEMY_LESSONS, featured?.name);

        // 7 — world counts (four head:true count queries)
        const worlds = [
          ["pokemon", "en"],
          ["pokemon", "ja"],
          ["onepiece", "en"],
          ["onepiece", "ja"],
        ];
        const counts = await Promise.all(
          worlds.map(async ([tcg, lang]) => {
            const { count } = await supabase
              .from("cards")
              .select("id", { count: "exact", head: true })
              .eq("tcg", tcg)
              .eq("lang", lang);
            return { tcg, lang, n: typeof count === "number" ? count : null };
          })
        );

        if (cancelled) return;
        setState({
          loading: false,
          featured,
          prints,
          set,
          setTotal,
          setOwned,
          siblings,
          timeline,
          lessons,
          worldCounts: shapeWorldCounts(counts),
        });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthed]);

  return state;
}
