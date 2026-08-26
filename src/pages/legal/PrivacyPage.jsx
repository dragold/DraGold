// /privacy — real Privacy Policy (Auth/Profile/Privacy GDPR feature).
// Describes the ACTUAL processors this app uses today (verified against the
// live codebase 2026-08-26): Supabase (auth/DB/storage, EU/Ireland), Vercel
// (hosting + cookieless Web Analytics), Google (OAuth sign-in, optional).
// Does NOT mention Resend — it is not integrated in this codebase (no
// dependency, no usage found); transactional email today is sent by
// Supabase Auth's own mailer. If Resend is added later, this page needs a
// matching update (CLAUDE.md §9 — don't invent unverified state).
import { LegalPage } from "./LegalPage.jsx";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This Privacy Policy explains what personal data DraGold ("we", "us") collects when you use
        dragold.org, why we collect it, where it is stored, and the rights you have over it under
        the EU General Data Protection Regulation (GDPR).
      </p>

      <h2>1. Data controller</h2>
      <p>
        DraGold is the data controller for the personal data described in this policy. You can
        reach us at <a href="mailto:hello@dragold.org" className="authpage-link">hello@dragold.org</a> for
        any question or request regarding your data.
      </p>

      <h2>2. What we collect</h2>
      <p><strong>Account data.</strong> If you register with email and password: your email address and a
        securely hashed password (we never see or store your password in plain text — this is
        handled entirely by our authentication provider, Supabase Auth). If you use "Continue with
        Google": your name, email address and profile photo, as shared by Google with your consent
        during sign-in.</p>
      <p><strong>Profile data.</strong> A username (chosen by you or auto-generated), and optionally a
        display name and a profile picture you upload.</p>
      <p><strong>Content you create.</strong> Your card Collection, Watchlist, price Alerts, Academy
        lesson progress, and any card-identification submissions you send us.</p>
      <p><strong>Usage data.</strong> We use Vercel Web Analytics, a cookie-less, privacy-preserving
        analytics service that reports aggregated page-view counts and does not store IP addresses
        or any data that identifies you individually. See our <a href="/cookie-policy" className="authpage-link">Cookie Policy</a> for
        details.</p>

      <h2>3. Why we process your data</h2>
      <p>
        To create and operate your account and let you use DraGold's features (performance of a
        contract, GDPR Art. 6(1)(b)); to keep the service secure and prevent abuse (legitimate
        interest, Art. 6(1)(f)); and, where you explicitly opt in, to send you price-alert emails
        or product updates (consent, Art. 6(1)(a)), which you can withdraw at any time from your
        account settings.
      </p>

      <h2>4. Where your data is stored</h2>
      <p>
        Your account, profile and content data are stored in a Supabase project hosted in the
        <strong> EU (Ireland)</strong> — this includes our database, authentication system and file
        storage (for uploaded profile pictures). The DraGold web app itself is hosted and served by
        <strong> Vercel</strong>, which also runs the small number of backend functions the app needs
        (e.g. account deletion). If you sign in with Google, Google processes your authentication
        under its own privacy policy, available at
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="authpage-link"> policies.google.com/privacy</a>.
      </p>
      <p>
        We do not sell your data, and we do not share it with third parties for advertising
        purposes.
      </p>

      <h2>5. How long we keep it</h2>
      <p>
        We keep your data for as long as your account exists. If you delete your account, your
        profile and every piece of content linked to it (Collection, Watchlist, Alerts, Academy
        progress, submissions, uploaded avatar) are permanently and immediately deleted — see
        "Deleting your account" below.
      </p>

      <h2>6. Your rights</h2>
      <p>Under the GDPR you have the right to:</p>
      <p>
        <strong>Access</strong> the personal data we hold about you — see "Download your data" below
        for instant self-service access.<br/>
        <strong>Rectify</strong> inaccurate data — update your username, display name and profile
        picture at any time from Account settings.<br/>
        <strong>Erase</strong> your data ("right to be forgotten", Art. 17) — see "Deleting your
        account" below.<br/>
        <strong>Restrict or object to</strong> certain processing, and <strong>withdraw consent</strong> for
        anything we asked it for.<br/>
        <strong>Port</strong> your data to another service (Art. 20) — see "Download your data" below.
      </p>
      <p>
        To exercise any right not covered by a self-service option in your account, email
        <a href="mailto:hello@dragold.org" className="authpage-link"> hello@dragold.org</a>. You also have
        the right to lodge a complaint with your local data protection authority.
      </p>

      <h2>7. Download your data (Art. 20)</h2>
      <p>
        From <a href="/account" className="authpage-link">Account settings</a>, the "Download my data"
        button generates a JSON file with your full profile and everything you've added to
        DraGold — Collection, Watchlist, Alerts and Academy progress — on demand, with no waiting
        period.
      </p>

      <h2>8. Deleting your account (Art. 17)</h2>
      <p>
        From <a href="/account" className="authpage-link">Account settings</a>, the Danger Zone lets you
        permanently delete your account. This immediately and irreversibly removes your
        authentication record, profile, uploaded avatar, and every row of content tied to your
        account across our database. This action cannot be undone and is not subject to a grace
        period — please download a copy of your data first if you want to keep it.
      </p>

      <h2>9. Children</h2>
      <p>
        DraGold is not directed at children under 16, and we do not knowingly collect personal data
        from them.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this policy as DraGold's features evolve. Material changes will be reflected
        by updating the "Last updated" date above.
      </p>

      <h2>11. Contact</h2>
      <p>Questions about this policy or your data: <a href="mailto:hello@dragold.org" className="authpage-link">hello@dragold.org</a>.</p>
    </LegalPage>
  );
}
