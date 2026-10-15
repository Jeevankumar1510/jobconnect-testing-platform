"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Building2,
  Check,
  Clock3,
  ExternalLink,
  FileText,
  MapPin,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  ApiError,
  applyToJob,
  getMyApplications,
  getSavedJobs,
  removeSavedJob,
  request,
  saveJob,
  trackExternalApplication,
} from "@/lib/api";
import { getDirectJobApplyUrl } from "@/lib/urls";
import { useAuth } from "@/components/auth-provider";
import type { ApplicationStatus, Job } from "@/lib/types";

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

function formatRelativeTime(dateString?: string | null) {
  if (!dateString) return "Recently checked";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return "Just now";
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
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

  // Saved job state
  const [isSaved, setIsSaved] = useState(false);
  const [savingJob, setSavingJob] = useState(false);

  // Application Tracking state
  const [trackedStatus, setTrackedStatus] = useState<ApplicationStatus | null>(null);
  const [showExternalPrompt, setShowExternalPrompt] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackNotes, setTrackNotes] = useState("");

  useEffect(() => {
    if (!params.id || !/^\d+$/.test(params.id)) return;
    const jobId = Number(params.id);

    setLoading(true);
    void request<Job>(`/jobs/${jobId}`)
      .then((data) => {
        setJob(data);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "We couldn’t load this role.");
      })
      .finally(() => setLoading(false));

    // Check if user has saved this job or already applied
    if (token && user?.role === "candidate") {
      void getSavedJobs(token)
        .then((savedList) => {
          setIsSaved(savedList.some((s) => s.job_id === jobId));
        })
        .catch(() => {});

      void getMyApplications(token)
        .then((appPage) => {
          const existing = appPage.items.find((a) => a.job_id === jobId);
          if (existing) {
            setTrackedStatus(existing.status);
          }
        })
        .catch(() => {});
    }
  }, [params.id, token, user]);

  const hasSaved = Boolean(user?.has_saved_resume || user?.resume_filename);
  const willUseSaved = hasSaved && !useCustomResume;
  const resolvedApplyUrl = job ? getDirectJobApplyUrl(job) : null;

  async function handleToggleSave() {
    if (!token || !job || savingJob) return;
    setSavingJob(true);
    try {
      if (isSaved) {
        await removeSavedJob(job.id, token);
        setIsSaved(false);
      } else {
        await saveJob(job.id, undefined, token);
        setIsSaved(true);
      }
    } catch (err) {
      console.error("Failed to toggle save job", err);
    } finally {
      setSavingJob(false);
    }
  }

  async function handleConfirmExternalApplication(status: ApplicationStatus = "applied") {
    if (!token || !job || trackingLoading) return;
    setTrackingLoading(true);
    try {
      await trackExternalApplication(
        {
          job_id: job.id,
          status,
          notes: trackNotes.trim() || undefined,
          applied_at: new Date().toISOString(),
        },
        token,
      );
      setTrackedStatus(status);
      setShowExternalPrompt(false);
    } catch (err) {
      console.error("Failed to track external application", err);
    } finally {
      setTrackingLoading(false);
    }
  }

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
      setTrackedStatus("submitted");
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
      <div className="flex items-center justify-between mb-4">
        <Link className="back-link mb-0" href="/"><ArrowLeft size={16} /> Back to all opportunities</Link>
        {user?.role === "candidate" && (
          <button
            type="button"
            className="button button-secondary button-small flex items-center gap-2"
            onClick={handleToggleSave}
            disabled={savingJob}
          >
            {isSaved ? <BookmarkCheck size={16} className="text-teal-600" /> : <Bookmark size={16} />}
            {isSaved ? "Saved" : "Save Job"}
          </button>
        )}
      </div>

      <div className="detail-layout">
        <article className="detail-main">
          <div className="detail-brand-row">
            {job.company_logo ? (
              <img src={job.company_logo} alt={job.company} className="quick-apply-logo" />
            ) : (
              <div className="company-avatar avatar-1 large-avatar">{job.company.slice(0, 1).toUpperCase()}</div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                {/* Live Hiring Status Badge */}
                {job.hiring_status === "open" ? (
                  <span className="badge-status-open">
                    <span className="hiring-indicator-dot" /> Open & Hiring
                  </span>
                ) : job.hiring_status === "temporarily_unavailable" ? (
                  <span className="badge-status-temp">
                    ⚠️ Temporarily Unavailable
                  </span>
                ) : job.hiring_status === "closed" || job.hiring_status === "expired" ? (
                  <span className="badge-status-closed">
                    🔴 Closed
                  </span>
                ) : (
                  <span className="badge-status-unverified">
                    ⚪ Hiring Status Unverified
                  </span>
                )}

                {/* Verification Status */}
                {job.verification_status === "verified_exact_match" ? (
                  <span className="badge-verified-exact">
                    <ShieldCheck size={12} /> Verified Exact Match
                  </span>
                ) : job.verification_status === "probable_match" ? (
                  <span className="badge badge-accent">Probable Match</span>
                ) : (
                  <span className="badge-status-unverified">Unverified Source</span>
                )}

                {job.is_external && (
                  <span className="badge badge-external">Source: {job.source_platform || job.source || "Official Portal"}</span>
                )}
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

          {/* Verification & Destination Metadata Banner */}
          <div className="verification-banner mt-4 mb-4">
            <div className="verification-banner-header">
              <div>
                <strong>Destination Status: </strong>
                {job.is_destination_verified ? (
                  <span className="text-emerald-700 font-semibold">Verified Original Posting</span>
                ) : (
                  <span className="text-stone-600 font-semibold">
                    {job.verification_status === "probable_match" ? "Probable Match" : "Unverified Destination"}
                  </span>
                )}
              </div>
              <span className="text-xs text-stone-500">
                Last checked: {formatRelativeTime(job.last_url_verified_at)}
              </span>
            </div>
            {job.apply_destination_type && (
              <div className="text-xs text-stone-600">
                Resolved Destination: <span className="font-medium text-stone-800 capitalize">{job.apply_destination_type.replace(/_/g, " ")}</span>
              </div>
            )}
            {job.hiring_status === "unverified" && (
              <div className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                <AlertCircle size={13} />
                <span>Hiring status could not be confirmed. Check the original posting before applying.</span>
              </div>
            )}
            {job.verification_reason && (
              <div className="text-xs text-stone-500 mt-1">
                Note: {job.verification_reason}
              </div>
            )}
          </div>

          <div className="detail-divider" />
          <div className="detail-section">
            <span className="eyebrow eyebrow-light">THE OPPORTUNITY</span>
            <h2>A little about the role</h2>
            <p className="job-description">{job.description}</p>
          </div>
          <div className="detail-note">
            <span className="detail-note-icon"><Building2 size={18} /></span>
            <span>
              <strong>Official Direct Opportunity</strong>
              <small>Verified authentic vacancy without misleading redirects or platform fees.</small>
            </span>
          </div>
        </article>

        <aside className="apply-panel" id="apply">
          {/* EXTERNAL APPLY SECTION */}
          {job.is_external ? (
            <div className="mb-4 pb-4">
              <span className="eyebrow eyebrow-light">DIRECT ORIGINAL POSTING</span>
              <h2 className="text-xl font-bold mb-1">Apply on {job.source_platform || job.source || "Official Website"}</h2>
              
              {job.apply_disabled || !resolvedApplyUrl ? (
                <div className="mt-3">
                  <div className="alert alert-error text-xs mb-3 flex items-start gap-2">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <div>
                      <strong>Application link unavailable.</strong>
                      <p className="mt-1">
                        {job.apply_warning || "We could not verify the original posting for this job. Direct redirection is disabled to protect candidates from outdated or misleading pages."}
                      </p>
                    </div>
                  </div>
                  <button type="button" disabled className="button button-secondary button-full">
                    Apply Now Unavailable
                  </button>
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-xs text-stone-600 mb-3">
                    Click below to open the exact <strong>{job.title}</strong> vacancy on the employer or original source website:
                  </p>
                  <a
                    href={resolvedApplyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button button-primary button-full flex items-center justify-center gap-2"
                    style={{ textDecoration: "none" }}
                    onClick={() => setShowExternalPrompt(true)}
                  >
                    Apply on Original Website <ExternalLink size={16} />
                  </a>
                  <p className="text-[11px] text-stone-500 mt-2 text-center">
                    ↗ You are leaving JobConnect to apply directly with the employer.
                  </p>
                </div>
              )}

              {/* Application Tracking Confirmation (Part 5 Requirement 17) */}
              {user?.role === "candidate" && (
                <>
                  {trackedStatus ? (
                    <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs">
                      <div className="font-semibold text-emerald-800 flex items-center gap-1.5 mb-1">
                        <Check size={14} /> Application Tracked on JobConnect
                      </div>
                      <p className="text-emerald-700">
                        Status: <strong className="capitalize">{trackedStatus.replace(/_/g, " ")}</strong>. You can update progress in your Dashboard.
                      </p>
                    </div>
                  ) : showExternalPrompt ? (
                    <div className="external-confirm-box mt-4">
                      <strong className="text-sm text-stone-900 block mb-1">
                        Did you submit your application?
                      </strong>
                      <p className="text-xs text-stone-600 mb-3">
                        JobConnect does not automatically mark external applications as submitted. Confirm once you&apos;ve completed the process:
                      </p>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          className="button button-primary button-small flex items-center justify-center gap-1"
                          onClick={() => handleConfirmExternalApplication("applied")}
                          disabled={trackingLoading}
                        >
                          <Check size={14} /> Yes, I Have Applied
                        </button>
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          onClick={() => handleConfirmExternalApplication("ready_to_apply")}
                          disabled={trackingLoading}
                        >
                          Mark as Ready to Apply
                        </button>
                        <button
                          type="button"
                          className="button button-quiet button-small text-xs"
                          onClick={() => setShowExternalPrompt(false)}
                        >
                          Not yet / Later
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 pt-3 border-t border-stone-200 text-center">
                      <button
                        type="button"
                        className="text-link text-xs"
                        onClick={() => setShowExternalPrompt(true)}
                      >
                        Applied externally? Click here to track your progress →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            /* INTERNAL IN-PLATFORM APPLICATION */
            <div>
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
                  <Link className="button button-outline button-full" href={`/auth?mode=register&role=candidate`}>
                    Create an account <ArrowUpRight size={16} />
                  </Link>
                  <Link className="text-link centered-link" href="/auth?mode=login">Already have an account? Sign in</Link>
                </div>
              ) : (
                <form className="apply-form" onSubmit={submitApplication}>
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
                    <textarea
                      maxLength={5000}
                      rows={4}
                      value={coverLetter}
                      onChange={(event) => setCoverLetter(event.target.value)}
                      placeholder="What caught your eye about this role?"
                    />
                  </label>

                  {error && <div className="alert alert-error" role="alert">{error}</div>}

                  <button className="button button-primary button-full" disabled={submitting || (!willUseSaved && !resume)}>
                    {submitting ? "Sending application…" : willUseSaved ? "1-Click Apply Now" : "Send my application"}
                    {!submitting && (willUseSaved ? <Zap size={16} /> : <ArrowUpRight size={16} />)}
                  </button>
                  <p className="form-footnote">Your application and resume are recorded securely on JobConnect.</p>
                </form>
              )}
            </div>
          )}

          {user?.role === "candidate" && (
            <button className="panel-link mt-4" onClick={() => router.push("/dashboard")}>
              Manage saved jobs & applications in your dashboard <ArrowUpRight size={14} />
            </button>
          )}
        </aside>
      </div>
    </main>
  );
}
