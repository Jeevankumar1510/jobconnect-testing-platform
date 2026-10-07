"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import type { Role } from "@/lib/types";

function AuthForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState(
    params.get("mode") === "register" ? "register" : "login",
  );
  const [role, setRole] = useState<Role>(
    params.get("role") === "recruiter" ? "recruiter" : "candidate",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "register") await signUp(email, password, role);
      else await signIn(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "We couldn’t complete that request. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-aside">
        <div className="auth-aside-content">
          <Link href="/" className="auth-back">
            <ArrowLeft size={16} /> Back to opportunities
          </Link>
          <span className="auth-kicker"><Sparkles size={15} /> YOUR NEXT CHAPTER STARTS HERE</span>
          <h1>Make room<br />for <span className="serif-accent">what’s next.</span></h1>
          <p>A more human way to find meaningful work—and the people who make it matter.</p>
          <div className="auth-quote">
            <span>“</span>
            <p>The right opportunity doesn’t just change what you do. It changes how you feel about Mondays.</p>
            <small>— The JobConnect team</small>
          </div>
          <div className="auth-aside-footer"><span>✳</span> Good work, good people.</div>
        </div>
        <div className="auth-decoration auth-decoration-one" />
        <div className="auth-decoration auth-decoration-two" />
      </div>
      <section className="auth-form-side">
        <div className="auth-card">
          <Link href="/" className="brand auth-mobile-brand">
            <span className="brand-mark"><BriefcaseBusiness size={18} /></span>
            <span>job<span className="brand-accent">connect</span></span>
          </Link>
          <div className="auth-heading">
            <span className="eyebrow">{mode === "login" ? "WELCOME BACK" : "COME ON IN"}</span>
            <h2>{mode === "login" ? "Good to see you." : "Let’s get you started."}</h2>
            <p>{mode === "login" ? "Pick up right where you left off." : "Create an account and find your people."}</p>
          </div>
          <div className="auth-tabs">
            <button
              className={mode === "login" ? "auth-tab selected" : "auth-tab"}
              onClick={() => { setMode("login"); setError(""); }}
            >
              Sign in
            </button>
            <button
              className={mode === "register" ? "auth-tab selected" : "auth-tab"}
              onClick={() => { setMode("register"); setError(""); }}
            >
              Create account
            </button>
          </div>
          {mode === "register" && (
            <div className="role-picker">
              <button
                className={role === "candidate" ? "role-option selected" : "role-option"}
                onClick={() => setRole("candidate")}
                type="button"
              >
                <span className="role-emoji">✦</span>
                <span><strong>I’m looking for work</strong><small>Discover and apply to roles</small></span>
              </button>
              <button
                className={role === "recruiter" ? "role-option selected" : "role-option"}
                onClick={() => setRole("recruiter")}
                type="button"
              >
                <span className="role-emoji">✳</span>
                <span><strong>I’m hiring</strong><small>Find your next great teammate</small></span>
              </button>
            </div>
          )}
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <form className="auth-form" onSubmit={submit}>
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <span className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={mode === "register" ? 8 : 1}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((show) => !show)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            <button className="button button-primary auth-submit" disabled={busy}>
              {busy ? "Just a moment…" : mode === "login" ? "Sign in to your account" : "Create my account"}
              {!busy && <ArrowRight size={17} />}
            </button>
          </form>
          <p className="auth-terms">By continuing, you agree to show up as yourself. We think that’s a pretty good start.</p>
          <div className="auth-bottom-link">
            {mode === "login" ? "New around here?" : "Already part of the community?"}
            <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<main className="page-loading"><div className="loader" />Getting things ready…</main>}>
      <AuthForm />
    </Suspense>
  );
}
