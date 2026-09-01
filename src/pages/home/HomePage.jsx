import "./home.css";

// Placeholder — the seven Atlas strata land in Tasks 12–13.
// Props already wired from DraGold.jsx: home (useHomeData), onOpenSearch,
// onOpenCard, onOpenSet, onNavCollection.
export function HomePage({ onOpenSearch }) {
  return (
    <div className="home">
      <section className="home-placeholder shell-wrap">
        <h1 className="font-syne">Every card is a door.</h1>
        <p>The Atlas strata land next. This is the shell working.</p>
        <button className="btn btn-primary" onClick={onOpenSearch}>Search</button>
      </section>
    </div>
  );
}
