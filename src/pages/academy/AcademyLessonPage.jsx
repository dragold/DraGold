// /academy/:slug — Academy MVP (Task 4), FASE 3+4. Standalone route (main.jsx),
// same pattern as AcademyPage.jsx. Progress is per-user via Supabase
// (academy_progress, RLS owner-only) — signed-out visitors can read the
// lesson, "Mark as completed" sends them to /login instead of failing silently.
import { useState, useEffect } from "react";
import { useAuth } from "../../lib/auth.js";
import { Icon } from "../../components/shared/Icon.jsx";
import { listAcademyProgress, markLessonComplete } from "../../supabase.js";
import { getLesson, getAdjacentLessons, getCategory } from "./academyContent.js";

function Header() {
  return (
    <header className="hdr">
      <div className="hdr-in">
        <a className="brand" href="/">
          <img src="/logo192.png" alt="DraGold" style={{ height: 30, width: 30, borderRadius: 7, flexShrink: 0 }} />
          <span className="logo-txt font-syne">DraGold</span>
        </a>
      </div>
    </header>
  );
}

export default function AcademyLessonPage({ slug }) {
  const { isAuthed, status } = useAuth();
  const lesson = getLesson(slug);
  const { prev, next } = lesson ? getAdjacentLessons(slug) : { prev: null, next: null };
  const category = lesson ? getCategory(lesson.category) : null;

  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    document.title = lesson ? `${lesson.title} — DraGold Academy` : "Lesson not found — DraGold Academy";
  }, [lesson]);

  useEffect(() => {
    setCompleted(false);
    setErr(false);
    if (status === "loading" || !lesson || !isAuthed) return;
    let cancelled = false;
    listAcademyProgress().then(rows => {
      if (!cancelled) setCompleted(rows.some(r => r.lesson_slug === lesson.slug));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthed, status, lesson]);

  const markComplete = async () => {
    if (!isAuthed) { window.location.href = "/login"; return; }
    if (busy || completed) return;
    setBusy(true);
    setErr(false);
    const res = await markLessonComplete(lesson.slug);
    setBusy(false);
    if (res?.error) { setErr(true); return; }
    setCompleted(true);
  };

  if (!lesson) {
    return (
      <div className="app">
        <Header />
        <main className="main">
          <div className="empty">
            <div className="empty-title">Lesson not found</div>
            <div className="empty-sub">This Academy lesson doesn't exist, or has moved.</div>
            <a className="btn btn-primary" href="/academy">Back to Academy</a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <Header />
      <main className="main acad-lesson-main">
        <a className="acad-back" href="/academy">
          <span style={{ transform: "rotate(180deg)", display: "flex" }}><Icon name="chevron" size={16} /></span>
          Academy
        </a>

        <div className="acad-lesson-cat-pill">{category?.label || lesson.category}</div>
        <h1 className="acad-lesson-h1">{lesson.title}</h1>

        <article className="acad-lesson-content">
          {lesson.body.map((b, i) => {
            if (b.type === "h3") return <h3 key={i}>{b.text}</h3>;
            if (b.type === "ul") return <ul key={i}>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>;
            return <p key={i}>{b.text}</p>;
          })}
        </article>

        {lesson.links?.length > 0 && (
          <div className="acad-lesson-links">
            {lesson.links.map(l => (
              <a key={l.href} className="btn btn-ghost btn-sm" href={l.href}>{l.label} →</a>
            ))}
          </div>
        )}

        <div className="acad-complete-row">
          <button
            className={`btn ${completed ? "btn-ghost" : "btn-primary"}`}
            onClick={markComplete}
            disabled={busy || completed}
          >
            {completed
              ? (<><Icon name="trophy" size={16} /> Completed</>)
              : busy ? "…" : !isAuthed ? "Sign in to mark as completed" : "Mark as completed"}
          </button>
          {err && <span className="acad-complete-err">Couldn't save progress — try again.</span>}
        </div>

        <div className="acad-lesson-nav">
          {prev ? (
            <a className="acad-nav-btn" href={`/academy/${prev.slug}`}>
              <span style={{ transform: "rotate(180deg)", display: "flex" }}><Icon name="chevron" size={16} /></span>
              <span className="acad-nav-txt"><span className="acad-nav-lbl">Previous</span><span className="acad-nav-t">{prev.title}</span></span>
            </a>
          ) : <span />}
          {next ? (
            <a className="acad-nav-btn next" href={`/academy/${next.slug}`}>
              <span className="acad-nav-txt"><span className="acad-nav-lbl">Next</span><span className="acad-nav-t">{next.title}</span></span>
              <Icon name="chevron" size={16} />
            </a>
          ) : <span />}
        </div>
      </main>
    </div>
  );
}
