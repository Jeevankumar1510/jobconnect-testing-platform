"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  Check,
  MapPin,
  Search,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ApiError, searchJobs } from "@/lib/api";
import type { Job } from "@/lib/types";

function formatSalary(job: Job) {
  const min = job.salary_min ? Number(job.salary_min).toLocaleString() : null;
  const max = job.salary_max ? Number(job.salary_max).toLocaleString() : null;
  if (!min && !max) return "Salary not listed";
  return `$${min ?? "—"}${max ? ` – $${max}` : "+"}`;
}

function timeAgo(value: string) {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000),
  );
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const loadJobs = useCallback(async (q: string, place: string) => {
    setBusy(true);
    setError("");
    const params = new URLSearchParams({ page: "1", page_size: "6" });
    if (q.trim()) params.set("q", q.trim());
    if (place.trim()) params.set("location", place.trim());
    try {
      const page = await searchJobs(params);
      setJobs(page.items);
      setTotal(page.total);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not load jobs right now. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ page: "1", page_size: "6" });
    void searchJobs(params)
      .then((page) => {
        setJobs(page.items);
        setTotal(page.total);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load jobs right now. Please try again.",
        );
      })
      .finally(() => setBusy(false));
  }, []);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadJobs(search, location);
  }

  return (
    <main>
      <section className="hero">
        <div className="hero-orb orb-one" />
        <div className="hero-orb orb-two" />
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              A better way to find your next thing
            </div>
            <h1>
              Work should feel
              <br />
              like <span className="serif-accent">you.</span>
            </h1>
            <p className="hero-description">
              Find the teams, missions, and opportunities that bring out your
              best. Your next chapter is closer than you think.
            </p>
            <form className="search-panel" onSubmit={submitSearch}>
              <label className="search-field">
                <Search size={19} />
                <span className="sr-only">Job title or keyword</span>
                <input
                  aria-label="Job title or keyword"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Job title, keyword, or company"
                />
              </label>
              <span className="search-divider" />
              <label className="search-field location-field">
                <MapPin size={19} />
                <span className="sr-only">Location</span>
                <input
                  aria-label="Location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="City or remote"
                />
              </label>
              <button className="button button-primary search-button" type="submit">
                Search jobs <ArrowRight size={16} />
              </button>
            </form>
            <div className="popular-searches">
              <span>Popular:</span>
              <button
                onClick={() => {
                  setSearch("Product");
                  void loadJobs("Product", location);
                }}
              >
                Product
              </button>
              <button
                onClick={() => {
                  setSearch("Design");
                  void loadJobs("Design", location);
                }}
              >
                Design
              </button>
              <button
                onClick={() => {
                  setSearch("Engineer");
                  void loadJobs("Engineer", location);
                }}
              >
                Engineering
              </button>
              <button
                onClick={() => {
                  setSearch("Remote");
                  setLocation("Remote");
                  void loadJobs("Remote", "Remote");
                }}
              >
                Remote
              </button>
            </div>
            <div className="hero-proof">
              <div className="avatar-stack">
                <span>AM</span>
                <span>JK</span>
                <span>SR</span>
                <span>+</span>
              </div>
              <span>People finding their place, every day</span>
            </div>
          </div>

          <div
            className="hero-art"
            aria-label="Illustration of a connected path to a new opportunity"
            role="img"
          >
            <div className="art-circle circle-large" />
            <div className="art-circle circle-small" />
            <div className="path-line path-one" />
            <div className="path-line path-two" />
            <div className="art-spark spark-a"><Sparkles size={24} /></div>
            <div className="art-spark spark-b"><Sparkles size={16} /></div>
            <div className="floating-card card-application">
              <span className="mini-icon mini-green"><Check size={16} /></span>
              <span>
                <strong>Application sent</strong>
                <small>You’re one step closer</small>
              </span>
              <span className="card-check"><Check size={13} /></span>
            </div>
            <div className="floating-card card-match">
              <span className="match-ring">92<span>%</span></span>
              <span>
                <strong>Great match</strong>
                <small>Product Designer</small>
              </span>
            </div>
            <div className="art-badge">
              <span className="badge-star">✳</span>
              <span><strong>Find your</strong><small>next chapter</small></span>
            </div>
            <div className="art-person">
              <div className="person-head" />
              <div className="person-hair" />
              <div className="person-body" />
              <div className="person-arm" />
              <div className="person-leg leg-left" />
              <div className="person-leg leg-right" />
              <div className="person-laptop" />
            </div>
            <div className="art-ground" />
          </div>
        </div>
        <div className="hero-bottom">
          <span>Made for people. Backed by possibility.</span>
          <ArrowDown size={16} />
        </div>
      </section>

      <section className="trust-strip">
        <span>Good people. Great places.</span>
        <div className="company-wordmarks">
          <strong className="wordmark-north">northstar<span>✳</span></strong>
          <strong className="wordmark-form">form<span>®</span></strong>
          <strong className="wordmark-common">◈ common ground</strong>
          <strong className="wordmark-kin">kin<span>+</span></strong>
          <strong className="wordmark-bright">bright<span>side.</span></strong>
        </div>
      </section>

      <section className="jobs-section" id="jobs">
        <div className="section-heading">
          <div>
            <div className="eyebrow eyebrow-light">THE GOOD STUFF</div>
            <h2>Find work that <span className="serif-accent">fits.</span></h2>
            <p>Real opportunities from teams doing things differently.</p>
          </div>
          <Link href="/auth?mode=register" className="text-link">
            Create your profile <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="job-feed-meta">
          <span><span className="online-dot" /> {total} open opportunities</span>
          <span>Fresh picks for you <Sparkles size={14} /></span>
        </div>
        {error && (
          <div className="alert alert-error">
            {error}
            <button className="text-link" onClick={() => void loadJobs(search, location)}>
              Try again
            </button>
          </div>
        )}
        {busy ? (
          <div className="loading-grid">
            {[1, 2, 3].map((item) => <div className="skeleton-card" key={item} />)}
          </div>
        ) : jobs.length ? (
          <div className="job-grid">
            {jobs.map((job, index) => (
              <article
                className="job-card"
                key={job.id}
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div className="job-card-top">
                  <div className={`company-avatar avatar-${index % 5}`}>
                    {job.company.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="job-age">{timeAgo(job.created_at)}</span>
                </div>
                <span className="job-type">{job.employment_type.replace("_", " ")}</span>
                <h3>{job.title}</h3>
                <p className="company-name"><Building2 size={15} /> {job.company}</p>
                <div className="job-card-meta">
                  <span><MapPin size={15} />{job.location}</span>
                  <span><WalletCards size={15} />{formatSalary(job)}</span>
                </div>
                <div className="job-card-bottom">
                  <span className="match-label"><span className="match-dot" /> Open role</span>
                  <Link className="card-arrow" href={`/jobs/${job.id}`} aria-label={`View ${job.title}`}>
                    <ArrowUpRight size={18} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : !error ? (
          <div className="empty-state">
            <BriefcaseBusiness size={25} />
            <h3>No matches just yet</h3>
            <p>Try a different search, or check back as new opportunities arrive.</p>
            <button
              className="button button-secondary"
              onClick={() => {
                setSearch("");
                setLocation("");
                void loadJobs("", "");
              }}
            >
              Show all openings
            </button>
          </div>
        ) : null}
        {jobs.length > 0 && (
          <div className="jobs-cta">
            <span>Looking for a little more choice?</span>
            <Link className="button button-secondary" href="/auth?mode=register">
              Join JobConnect <ArrowRight size={16} />
            </Link>
          </div>
        )}
      </section>

      <section className="values-section">
        <div className="values-heading">
          <div className="eyebrow">A LITTLE MORE HUMAN</div>
          <h2>Because work is<br />a <span className="serif-accent">big part</span> of life.</h2>
          <p>We’re here to make finding the right fit feel less like a job—and more like a beginning.</p>
        </div>
        <div className="value-list">
          <article>
            <span className="value-icon value-lavender"><Users size={21} /></span>
            <div><h3>People over profiles</h3><p>Your story matters more than a checklist. Find teams that see what makes you, you.</p></div>
            <span className="value-number">01</span>
          </article>
          <article>
            <span className="value-icon value-yellow"><Sparkles size={21} /></span>
            <div><h3>Quality, not noise</h3><p>Thoughtful roles from teams worth knowing. Spend less time scrolling, more time growing.</p></div>
            <span className="value-number">02</span>
          </article>
          <article>
            <span className="value-icon value-peach"><BriefcaseBusiness size={21} /></span>
            <div><h3>A fit that goes both ways</h3><p>The best work happens when it works for everyone. Explore opportunities made for mutual growth.</p></div>
            <span className="value-number">03</span>
          </article>
        </div>
      </section>

      <section className="recruiter-banner">
        <div className="banner-orb" />
        <div>
          <span className="eyebrow">FOR THE PEOPLE BUILDING TEAMS</span>
          <h2>Good work starts<br />with <span className="serif-accent">good people.</span></h2>
          <p>Meet people who care about the work as much as you do.</p>
        </div>
        <Link className="button button-light" href="/auth?mode=register&role=recruiter">
          Find your next teammate <ArrowRight size={16} />
        </Link>
      </section>
      <div className="bottom-note"><span>✳</span> Here’s to finding your place.</div>
    </main>
  );
}
