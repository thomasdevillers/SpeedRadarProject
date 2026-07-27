"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type FormStatus = "checking" | "ready" | "saving" | "complete" | "error";

export function AcceptInviteForm() {
  const router = useRouter();
  const [status, setStatus] = useState<FormStatus>("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    async function initialiseInvitation() {
      const supabase = createClient();
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const invitationError = fragment.get("error_description");
      if (window.location.hash) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
      if (invitationError) throw new Error(invitationError);

      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;
      }

      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user) {
        throw new Error("This invitation link is invalid or has expired. Ask your RoadSafe administrator for a new invitation.");
      }
      setStatus("ready");
    }

    initialiseInvitation().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Unable to verify this invitation.");
      setStatus("error");
    });
  }, []);

  async function setPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("passwordConfirmation") ?? "");
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setStatus("saving");
    setError("");
    const { error: updateError } = await createClient().auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setStatus("ready");
      return;
    }

    setStatus("complete");
    router.replace("/dashboard");
    router.refresh();
  }

  const isBusy = status === "checking" || status === "saving" || status === "complete";

  return (
    <div className="login-form-wrap">
      <div className="login-lock"><KeyRound /></div>
      <span className="eyebrow">Invitation verified</span>
      <h2>Create your password</h2>
      <p>{status === "checking" ? "Securely checking your invitation…" : "Choose a password for future sign-ins to Radar Control."}</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      {status !== "error" && (
        <form className="auth-form" onSubmit={setPassword}>
          <label>
            <span>New password</span>
            <input name="password" type="password" autoComplete="new-password" minLength={8} required disabled={isBusy} placeholder="At least 8 characters" />
          </label>
          <label>
            <span>Confirm password</span>
            <input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={8} required disabled={isBusy} placeholder="Repeat your password" />
          </label>
          <button className="button primary full" type="submit" disabled={isBusy}>
            {status === "saving" ? "Activating access…" : "Activate my access"} <ArrowRight size={17} />
          </button>
        </form>
      )}
      <div className="login-trust"><ShieldCheck /><span>Your invitation is single-use and your password is handled by the secure identity service.</span></div>
    </div>
  );
}
