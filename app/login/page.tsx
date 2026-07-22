import { ArrowRight, LockKeyhole, RadioTower, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { signIn } from "@/app/login/actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main id="main-content" className="login-shell">
      <section className="login-story">
        <Logo />
        <div className="login-story-copy"><span className="eyebrow">Private customer portal</span><h1>Your roads.<br /><em>Under watch.</em></h1><p>One secure operating picture for every RoadSafe radar, vehicle event and verified photograph.</p></div>
        <div className="login-status"><RadioTower /><div><strong>Fleet connected</strong><span>Encrypted outbound device links</span></div></div>
        <div className="hazard-stripe" aria-hidden="true" />
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <div className="login-lock"><LockKeyhole /></div>
          <span className="eyebrow">Authorised access</span><h2>Sign in to Radar Control</h2><p>Use the email address from your RoadSafe invitation.</p>
          {error && <div className="form-error" role="alert">{error}</div>}
          <form action={signIn} className="auth-form">
            <label><span>Email address</span><input name="email" type="email" autoComplete="email" required placeholder="you@company.co.za" /></label>
            <label><span>Password</span><input name="password" type="password" autoComplete="current-password" required placeholder="Your password" /></label>
            <button className="button primary full" type="submit">Secure sign in <ArrowRight size={17} /></button>
          </form>
          <div className="login-trust"><ShieldCheck /><span>Protected by tenant-level access controls. Your organisation sees only its assigned radar data.</span></div>
        </div>
      </section>
    </main>
  );
}

