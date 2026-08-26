// /cookie-policy — new page (Auth/Profile/Privacy GDPR feature). Describes
// what's actually true of this codebase as of 2026-08-26: the Supabase JS
// client is initialized with default options (no custom `auth.storage`),
// so session/auth state lives in the browser's localStorage, NOT a cookie
// (verified: no `document.cookie` usage and no auth `storage:` override
// anywhere in src/). Vercel Web Analytics (@vercel/analytics/react, wired
// in src/main.jsx) is Vercel's cookie-less analytics product. No consent
// banner exists because nothing here currently requires opt-in consent —
// this page says so plainly instead of shipping a decorative banner.
import { LegalPage } from "./LegalPage.jsx";

export default function CookiePolicyPage() {
  return (
    <LegalPage title="Cookie Policy">
      <p>
        This page explains how DraGold uses cookies and similar technologies (like browser local
        storage) when you visit dragold.org.
      </p>

      <h2>1. Short version</h2>
      <p>
        DraGold does not use advertising, tracking or profiling cookies of any kind. We don't run
        ads, and we don't sell or share browsing data with advertisers. The only cookies that may
        be present come from our hosting infrastructure (see section 4) — not from DraGold's own
        code.
      </p>

      <h2>2. How we keep you signed in</h2>
      <p>
        When you sign in, DraGold stores your session token in your browser's <strong>local
        storage</strong> (a standard web technology, distinct from cookies) — not in a cookie. This
        is strictly necessary for the service to work: without it, you'd be signed out on every
        page load. It is never used to track you across other websites, and clearing your
        browser's site data for dragold.org will sign you out.
      </p>

      <h2>3. Analytics</h2>
      <p>
        We use <strong>Vercel Web Analytics</strong> to understand aggregate traffic to DraGold —
        how many people visit which pages. It is explicitly designed to be cookie-less: it does not
        set any cookie, does not use any persistent identifier, and does not store your IP address.
        We only ever see anonymized, aggregated counts — never anything that identifies you
        individually.
      </p>

      <h2>4. Infrastructure cookies outside our control</h2>
      <p>
        Our hosting provider, Vercel, may set a small number of strictly technical cookies as part
        of its infrastructure (for example, security and abuse-prevention systems) that are outside
        DraGold's own code and control. These are not used for tracking or advertising. See{" "}
        <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noreferrer" className="authpage-link">
          Vercel's Privacy Policy
        </a>{" "}
        for details.
      </p>

      <h2>5. Cookie preferences</h2>
      <p>
        Because DraGold does not use any cookie that legally requires your consent, there is
        currently no cookie-consent banner or preference toggle to manage — there is simply nothing
        to opt in or out of. If that ever changes (for example, if we introduce optional marketing
        cookies in the future), we will add a consent manager here and update this page and our{" "}
        <a href="/privacy" className="authpage-link">Privacy Policy</a> accordingly before doing so.
      </p>

      <h2>6. Changes to this policy</h2>
      <p>
        We may update this page as DraGold's infrastructure evolves. Material changes will be
        reflected by updating the "Last updated" date above.
      </p>

      <h2>7. Contact</h2>
      <p>Questions about cookies or this page: <a href="mailto:hello@dragold.org" className="authpage-link">hello@dragold.org</a>.</p>
    </LegalPage>
  );
}
