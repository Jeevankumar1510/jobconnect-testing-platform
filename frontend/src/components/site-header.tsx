"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BriefcaseBusiness, ChevronDown, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/components/auth-provider";

export function SiteHeader() {
  const { user, ready, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    signOut();
    setMenuOpen(false);
    router.push("/");
  }

  const dashboardLabel = user?.role === "recruiter" ? "Recruiter hub" : "Dashboard & Profile";

  return (
    <header className="site-header">
      <div className="nav-wrap">
        <Link className="brand" href="/" aria-label="JobConnect home">
          <span className="brand-mark"><BriefcaseBusiness size={19} strokeWidth={2.4} /></span>
          <span>job<span className="brand-accent">connect</span></span>
        </Link>
        <button
          className="icon-button mobile-menu-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <nav className={`main-nav ${menuOpen ? "nav-open" : ""}`}>
          <Link
            className={pathname === "/" ? "nav-link active" : "nav-link"}
            href="/"
            onClick={() => setMenuOpen(false)}
          >
            Find a job
          </Link>
          <Link
            className={pathname === "/resume-analyzer" ? "nav-link active" : "nav-link"}
            href="/resume-analyzer"
            onClick={() => setMenuOpen(false)}
          >
            Resume Analyzer
          </Link>
          <Link
            className={pathname?.startsWith("/resume-studio") ? "nav-link active" : "nav-link"}
            href="/resume-studio"
            onClick={() => setMenuOpen(false)}
          >
            AI Resume Studio
          </Link>
          <Link
            className={pathname === "/skill-gap" ? "nav-link active" : "nav-link"}
            href="/skill-gap"
            onClick={() => setMenuOpen(false)}
          >
            Skill Gap
          </Link>
          <Link
            className={pathname === "/interview-prep" ? "nav-link active" : "nav-link"}
            href="/interview-prep"
            onClick={() => setMenuOpen(false)}
          >
            Interview Prep
          </Link>
          <Link
            className={pathname === "/assistant" ? "nav-link active" : "nav-link"}
            href="/assistant"
            onClick={() => setMenuOpen(false)}
          >
            AI Assistant
          </Link>
          {user && (
            <Link
              className={pathname === "/dashboard" ? "nav-link active" : "nav-link"}
              href="/dashboard"
              onClick={() => setMenuOpen(false)}
            >
              {dashboardLabel}
            </Link>
          )}
          <div className="nav-actions">
            {ready && user ? (
              <>
                <span className="nav-user"><span className="online-dot" />{user.email}</span>
                <button className="button button-small button-quiet" onClick={logout}>
                  <LogOut size={15} /> Sign out
                </button>
              </>
            ) : (
              <>
                <Link className="button button-quiet button-small" href="/auth?mode=login">
                  Sign in
                </Link>
                <Link className="button button-primary button-small" href="/auth?mode=register">
                  Get started <ChevronDown size={14} className="button-arrow" />
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
