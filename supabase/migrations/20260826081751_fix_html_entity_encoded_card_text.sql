-- Alpha Blocker fix (E2E Verification Gate follow-up, commit 9d393a8 base):
-- P1.1 — 172 public.cards rows (One Piece only, verified via live query) have
-- literal HTML entities stored in name/name_en/set_name instead of the real
-- characters, e.g. "Chaka &amp; Pell" instead of "Chaka & Pell", "Kin&#039;emon"
-- instead of "Kin'emon". Verified live that the ONLY entities present across
-- the affected rows are exactly these 4 (&#039; &quot; &amp; &apos;), no other
-- entity forms exist, and none of them are double-encoded (no "&amp;#039;" /
-- "&amp;amp;" pattern found) — so a plain literal string replace, applied only
-- to rows that actually match the entity pattern, is safe: it cannot touch or
-- corrupt any row/text that doesn't contain one of these 4 literal substrings.
-- Order doesn't matter (no nesting), but &amp; is decoded last for safety
-- (standard HTML-decode convention) in case any future data ever nests entities.
-- Applied live against project pimwkmwrduqkaydyvxqz on 2026-08-26; this file
-- makes that change reproducible/versioned in the repo (idempotent: WHERE
-- clause matches zero rows once already applied).
update public.cards
set name = replace(replace(replace(replace(name, '&#039;', ''''), '&apos;', ''''), '&quot;', '"'), '&amp;', '&')
where name ~ '&#039;|&apos;|&quot;|&amp;';

update public.cards
set name_en = replace(replace(replace(replace(name_en, '&#039;', ''''), '&apos;', ''''), '&quot;', '"'), '&amp;', '&')
where name_en ~ '&#039;|&apos;|&quot;|&amp;';

update public.cards
set set_name = replace(replace(replace(replace(set_name, '&#039;', ''''), '&apos;', ''''), '&quot;', '"'), '&amp;', '&')
where set_name ~ '&#039;|&apos;|&quot;|&amp;';
