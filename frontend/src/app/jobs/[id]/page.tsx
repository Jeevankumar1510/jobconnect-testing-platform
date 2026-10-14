"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Building2, Check, Clock3, ExternalLink, FileText, MapPin, Sparkles, WalletCards, Zap } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError, applyToJob, request } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import type { Job } from "@/lib/types";

function formatSalary(job: Job) {
  const min = job.salary_min ? Number(job.salary_min) : null;
  const max = job.salary_max ? Number(job.salary_max) : null;
  if (!min && !max) return "Competitive (₹ LPA)";

  const formatAmount = (val: number) => {
    if (val >= 100_000) {
      const lpa = (val / 100_000).toFixed(1).replace(/\.0$/, "");
      return `₹${lpa} LPA`;
    }
    return `₹${val.toLocaleString("en-IN")}/mo`;
  };

  if (min && max) {
    if (min >= 100_000 && max >= 100_000) {
      const minLpa = (min / 100_000).toFixed(1).replace(/\.0$/, "");
      const maxLpa = (max / 100_000).toFixed(1).replace(/\.0$/, "");
      return `₹${minLpa} – ₹${maxLpa} LPA`;
    }
    return `${formatAmount(min)} – ${formatAmount(max)}`;
  }
  if (min) return `${formatAmount(min)}+`;
  if (max) return `Up to ${formatAmount(max)}`;
  return "Competitive (₹ LPA)";
}

export default function JobDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, token, ready, refreshProfile } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const [useCustomResume, setCustomResume] = useState(false);
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!params.id || !/^\d+$/.test(params.id)) return;
    void request<Job>(`/jobs/${params.id}`)
      .then(setJob)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "We couldn’t load this role.");
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  const hasSaved = Boolean(user?.has_saved_resume || user?.resume_filename);
  const willUseSaved = hasSaved && !useCustomResume;

  async function submitApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !job) return;
    if (!willUseSaved && !resume) {
      setError("Please choose a resume file.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await applyToJob(
        {
          jobId: job.id,
          coverLetter: coverLetter.trim() || undefined,
          useSavedResume: willUseSaved,
          resume: willUseSaved ? null : resume,
          saveAsProfileResume: saveToProfile,
        },
        token,
      );
      await refreshProfile();
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn’t send your application.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!params.id || !/^\d+$/.test(params.id)) {
    return (
      <main className="content-page">
        <div className="alert alert-error">That job link doesn’t look right.</div>
        <Link className="text-link" href="/"><ArrowLeft size={16} /> Back to jobs</Link>
      </main>
    );
  }
  if (loading || !ready) {
    return <main className="page-loading"><div className="loader" />Finding the details…</main>;
  }
  if (!job) {
    return (
      <main className="content-page">
        <div className="alert alert-error">{error || "This role is no longer available."}</div>
        <Link className="text-link" href="/"><ArrowLeft size={16} /> Back to jobs</Link>
      </main>
    );
  }

  return (
    <main className="content-page">
      <Link className="back-link" href="/"><ArrowLeft size={16} /> Back to all opportunities</Link>
      <div className="detail-layout">
        <article className="detail-main">
          <div className="detail-brand-row">
            {job.company_logo ? (
              <img src={job.company_logo} alt={job.company} className="quick-apply-logo" />
            ) : (
              <div className="company-avatar avatar-1 large-avatar">{job.company.slice(0, 1).toUpperCase()}</div>
            )}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="badge badge-accent"><Sparkles size={12} /> Direct Apply</span>
                {job.is_external && <span className="badge badge-external">Partner: {job.source || "Web"}</span>}
              </div>
              <span className="detail-company">{job.company}</span>
            </div>
          </div>
          <h1 className="detail-title">{job.title}</h1>
          <div className="detail-pills">
            <span><MapPin size={15} />{job.location}</span>
            <span><Clock3 size={15} />{job.employment_type.replace("_", " ")}</span>
            <span><WalletCards size={15} />{formatSalary(job)}</span>
          </div>

          {job.is_external && job.external_url && (
            <div className="external-direct-card mt-4 mb-4">
              <div>
                <strong>Syndicated Partner Posting</strong>
                <p>This role was imported via {job.source || "our partner feed"}. You can apply directly through JobConnect below, or view the original employer page.</p>
              </div>
              <a href={job.external_url} target="_blank" rel="noopener noreferrer" className="button button-outline">
                Employer Page <ExternalLink size={14} />
              </a>
            </div>
          )}

          <div className="detail-divider" />
          <div className="detail-section">
            <span className="eyebrow eyebrow-light">THE OPPORTUNITY</span>
            <h2>A little about the role</h2>
            <p className="job-description">{job.description}</p>
          </div>
          <div className="detail-note"><span className="detail-note-icon"><Building2 size={18} /></span><span><strong>Does this feel like your kind of thing?</strong><small>Introduce yourself. It only takes a minute.</small></span></div>
        </article>

        <aside className="apply-panel" id="apply">
          {job.is_external && job.external_url && (
            <div className="mb-4 pb-4 border-b border-stone-200">
              <span className="eyebrow eyebrow-light">DIRECT APPLICATION</span>
              <h2 className="text-xl font-bold mb-1">Apply on {job.source || "Official Portal"}</h2>
              <p className="text-xs text-stone-600 mb-3">
                This authentic role is hosted by the hiring team via {job.source || "partner network"}. Click below to apply directly on their portal:
              </p>
              <a
                href={job.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="button button-primary button-full flex items-center justify-center gap-2"
                style={{ textDecoration: "none" }}
              >
                Apply on {job.source || "Employer Site"} <ExternalLink size={16} />
              </a>
              <div className="mt-4 pt-3 border-t border-stone-200">
                <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Or Track via JobConnect</span>
              </div>
            </div>
          )}
          <span className="eyebrow eyebrow-light">JOB APPLICATION</span>
          <h2>Make it yours.</h2>
          <p>Share a little about yourself and send your application directly.</p>
          {success ? (
            <div className="apply-success">
              <span className="success-mark"><Check size={23} /></span>
              <h3>You’re on your way.</h3>
              <p>Your application is recorded with JobConnect and the hiring team.</p>
              <Link className="button button-primary button-full" href="/dashboard">View in dashboard</Link>
            </div>
          ) : user?.role === "recruiter" ? (
            <div className="alert alert-info">Sign in with a candidate account to apply for this role.</div>
          ) : !user ? (
            <div className="apply-signin">
              <p>Sign in or create a candidate account to track on JobConnect.</p>
              <Link className="button button-outline button-full" href={`/auth?mode=register&role=candidate`}>Create an account <ArrowUpRight size={16} /></Link>
              <Link className="text-link centered-link" href="/auth?mode=login">Already have an account? Sign in</Link>
            </div>
          ) : (
            <form className="apply-form" onSubmit={submitApplication}>
              {/* Saved Resume Card or Custom Upload */}
              {hasSaved && !useCustomResume ? (
                <div className="saved-resume-card mb-3">
                  <div className="saved-resume-info">
                    <div className="saved-resume-icon"><FileText size={18} /></div>
                    <div>
                      <strong>{user.resume_filename || "Saved Profile Resume"}</strong>
                      <span className="saved-resume-verified"><Check size={12} /> Default Resume</span>
                    </div>
                  </div>
                  <button type="button" className="text-link text-xs" onClick={() => setCustomResume(true)}>
                    Use another file
                  </button>
                </div>
              ) : (
                <div className="mb-3">
                  <label className="upload-label">
                    Resume <span className="required-label">PDF or DOCX</span>
                    <input
                      type="file"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      required={!hasSaved}
                      onChange={(event) => setResume(event.target.files?.[0] ?? null)}
                    />
                    <small>{resume ? resume.name : "Choose a file up to 5 MB"}</small>
                  </label>
                  {hasSaved && (
                    <button type="button" className="text-link text-xs mt-1 block" onClick={() => setCustomResume(false)}>
                      ← Use saved profile resume
                    </button>
                  )}
                  <label className="checkbox-label text-xs mt-2 flex items-center gap-2">
                    <input type="checkbox" checked={saveToProfile} onChange={(e) => setSaveToProfile(e.target.checked)} />
                    <span>Save to profile for future 1-click applies</span>
                  </label>
                </div>
              )}

              <label>Your note <span className="optional-label">optional</span>
                <textarea maxLength={5000} rows={4} value={coverLetter} onChange={(event) => setCoverLetter(event.target.value)} placeholder="What caught your eye about this role?" />
              </label>

              {error && <div className="alert alert-error" role="alert">{error}</div>}

              <button className="button button-primary button-full" disabled={submitting || (!willUseSaved && !resume)}>
                {submitting ? "Sending application…" : willUseSaved ? "1-Click Apply Now" : "Send my application"}
                {!submitting && (willUseSaved ? <Zap size={16} /> : <ArrowUpRight size={16} />)}
              </button>
              <p className="form-footnote">Your application and resume are recorded securely on JobConnect.</p>
            </form>
          )}
          {user?.role === "candidate" && (
            <button className="panel-link" onClick={() => router.push("/dashboard")}>
              Already applied? Check your dashboard <ArrowUpRight size={14} />
            </button>
          )}
        </aside>
      </div>
    </main>
  );
}
