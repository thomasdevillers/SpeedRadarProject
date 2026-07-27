import { Logo } from "@/components/logo";
import { AcceptInviteForm } from "@/components/accept-invite-form";

export const metadata = { title: "Accept invitation" };

export default function AcceptInvitePage() {
  return (
    <main id="main-content" className="login-shell">
      <section className="login-story">
        <Logo />
        <div className="login-story-copy">
          <span className="eyebrow">RoadSafe client access</span>
          <h1>One last<br /><em>secure step.</em></h1>
          <p>Create your password to activate the access prepared for your organisation.</p>
        </div>
        <div className="hazard-stripe" aria-hidden="true" />
      </section>
      <section className="login-panel">
        <AcceptInviteForm />
      </section>
    </main>
  );
}
