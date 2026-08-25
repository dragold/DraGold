// /academy — Academy MVP (Task 4), FASE 1. Standalone route, same pattern as
// /account (main.jsx pre-mount pathname match) rather than a DraGold shell
// tab: keeps this additive (no changes to DraGold.jsx's tab/routing state
// machine) while still giving lessons real, directly-loadable URLs.
// Reads progress from Supabase when signed in (listAcademyProgress);
// unauthenticated visitors can read everything, just can't save progress.
import { useState, useEffect } from "react";
import { useAuth } from "../../lib/auth.js";
import { Icon } from "../../components/shared/Icon.jsx";
import { listAcademyProgress } from "../../supabase.js";
import { ACADEMY_CATEGORIES, ACADEMY_LESSONS, getCategory } from "./academyContent.js";

export default function AcademyPage() {
  const { isAuthed, status } = useAuth();
  const [completed, setCompleted] = useState(new Set());

  useEffect(() => {
    if (status === "loading") return;
    if (!isAuthed) { setCompleted(new Set()); return; }
    let cancelled = false;
    listAcademyProgress().then(rows => {
      if (!cancelled) setCompleted(new Set(rows.map(r => r.lesson_slug)));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthed, status]);

  const total = ACADEMY_LESSONS.length;
  const done = ACADEMY_LESSONS.filter(l => completed.has(l.slug)).length;

  return (
    <div className="app">
      <header className="hdr">
        <div className="hdr-in">
          <a className="brand" href="/">
            <img src="/logo192.png" alt="DraGold" style={{ height: 30, width: 30, borderRadius: 7, flexShrink: 0 }} />
            <span className="logo-txt font-syne">DraGold</span>
          </a>
          <a className="btn btn-ghost btn-sm" href="/" style={{ marginLeft: "auto" }}>← Back to DraGold</a>
        </div>
      </header>

      <main className="main">
        <section className="acad-hero">
          <span className="acad-hero-ic"><Icon name="spark" size={22} /></span>
          <h1 className="acad-hero-t">DraGold Academy</h1>
          <p className="acad-hero-sub">
            Short, focused lessons on how TCG collecting actually works — reading a card,
            telling rarities and variants apart, and understanding what you're building when
            you start a collection.
          </p>
          {status !== "loading" && (
            isAuthed ? (
              <div className="acad-progress">
                <div className="acad-progress-bar">
                  <div className="acad-progress-fill" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                </div>
                <span className="acad-progress-txt">{done} of {total} lessons completed</span>
              </div>
            ) : (
              <a className="acad-progress-cta" href="/login">Sign in to save your progress →</a>
            )
          )}
        </section>

        <section className="view">
          <div className="view-h"><h2 className="view-t">Paths</h2></div>
          <div className="acad-cat-grid">
            {ACADEMY_CATEGORIES.map(c => {
              const lesson = ACADEMY_LESSONS.find(l => l.category === c.id);
              const isDone = !!lesson && completed.has(lesson.slug);
              return (
                <a key={c.id} className="acad-cat-card" href={lesson ? `/academy/${lesson.slug}` : "/academy"}>
                  <span className="acad-cat-ic"><Icon name={c.icon} size={18} /></span>
                  <span className="acad-cat-label">{c.label}</span>
                  {isDone && <span className="acad-cat-done"><Icon name="trophy" size={12} /> Done</span>}
                </a>
              );
            })}
          </div>
        </section>

        <section className="view">
          <div className="view-h"><h2 className="view-t">Lessons</h2></div>
          <div className="acad-lesson-list">
            {ACADEMY_LESSONS.map(l => {
              const cat = getCategory(l.category);
              const isDone = completed.has(l.slug);
              return (
                <a key={l.slug} className="acad-lesson-row" href={`/academy/${l.slug}`}>
                  <span className={`acad-lesson-status${isDone ? " done" : ""}`}>
                    {isDone && <Icon name="trophy" size={14} />}
                  </span>
                  <span className="acad-lesson-body">
                    <span className="acad-lesson-cat">{cat?.label || l.category}</span>
                    <span className="acad-lesson-title">{l.title}</span>
                    <span className="acad-lesson-summary">{l.summary}</span>
                  </span>
                  <span className="acad-lesson-meta">
                    {l.minutes} min
                    <Icon name="chevron" size={14} />
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
