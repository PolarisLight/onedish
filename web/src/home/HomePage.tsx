import { useNavigate } from "react-router";
import { DailyContextForm } from "../context/DailyContextForm";
import { startDemo } from "../demo/fixtures";

export function HomePage() {
  const navigate = useNavigate();
  async function choose() {
    const record = await startDemo();
    navigate(`/choose/${record.decision.decision_id}`);
  }
  return (
    <main className="home">
      <section className="hero">
        <div className="hero-copy">
          <p className="hero-kicker">Dinner without the feed</p>
          <h1>Stop browsing.<span>Eat this.</span></h1>
          <p className="hero-lede">One clear meal, chosen from your context, budget, safety needs, and recent history.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={choose}>Try the demo</button>
            <a className="secondary-button" href="#context" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Use my context</a>
          </div>
        </div>
        <div className="hero-visual" aria-label="Charred chicken rice bowl">
          <img className="hero-photo" src="/food/ember-bowl-charred-chicken-rice.webp" alt="Charred chicken rice bowl with grilled greens" fetchPriority="high" />
          <div className="decision-stamp"><div><strong>90→1</strong><small>auditable decision path</small></div></div>
        </div>
      </section>
      <section className="context-panel" id="context">
        <h2>Give it today&apos;s context.</h2>
        <p>Everything is optional. OneDish sends only the fields needed for this decision.</p>
        <DailyContextForm onSubmit={choose} />
      </section>
    </main>
  );
}
