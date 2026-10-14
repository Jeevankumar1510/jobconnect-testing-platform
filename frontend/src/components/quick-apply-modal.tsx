"use client";

import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  MapPin,
  Sparkles,
  UploadCloud,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { applyToJob } from "@/lib/api";
import type { Job } from "@/lib/types";

interface QuickApplyModalProps {
  job: Job | null;
  onClose: () => void;
  onApplied?: (jobId: number) => void;
}

export function QuickApplyModal({
  job,
  onClose,
  onApplied,
}: QuickApplyModalProps) {
  const { user, token, signIn, signUp, refreshProfile } = useAuth();

  // Application form state
  const [coverLetter, setCoverLetter] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [useCustomResume, setCustomResume] = useState(false);
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Auth toggle for guest users
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  // Lock body scroll when modal is open
  useEffect(() => {
    if (job) {
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "auto";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [job, onClose]);

  if (!job) return null;

  const hasSaved = Boolean(user?.has_saved_resume || user?.resume_filename);
  const willUseSaved = hasSaved && !useCustomResume;

  async function handleGuestAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    try {
      if (authMode === "signup") {
        await signUp(authEmail.trim(), authPassword, "candidate");
      } else {
        await signIn(authEmail.trim(), authPassword);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      setAuthError(msg);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !job) return;

    if (!willUseSaved && !resumeFile) {
      setError("Please select a PDF or DOCX resume file.");
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
          resume: willUseSaved ? null : resumeFile,
          saveAsProfileResume: saveToProfile,
        },
        token,
      );
      await refreshProfile();
      setSuccess(true);
      if (onApplied) onApplied(job.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit application.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function formatSalary(j: Job) {
    const min = j.salary_min ? Number(j.salary_min).toLocaleString() : null;
    const max = j.salary_max ? Number(j.salary_max).toLocaleString() : null;
    if (!min && !max) return "Competitive";
    return `$${min ?? "—"}${max ? ` – $${max}` : "+"}`;
  }

  return (
    <div
      className="quick-apply-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-job-title"
    >
      <div className="quick-apply-card">
        {/* Modal Close Button */}
        <button
          className="quick-apply-close"
          onClick={onClose}
          aria-label="Close application dialog"
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div className="quick-apply-header">
          <div className="flex items-center gap-3">
            {job.company_logo ? (
              <img
                src={job.company_logo}
                alt={job.company}
                className="quick-apply-logo"
              />
            ) : (
              <div className="company-avatar avatar-0">
                {job.company.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div className="quick-apply-badges">
                <span className="badge badge-accent">
                  <Sparkles size={12} /> Direct Apply
                </span>
                {job.is_external && (
                  <span className="badge badge-external">
                    Partner: {job.source || "Web"}
                  </span>
                )}
                <span className="badge badge-outline">
                  {job.employment_type.replace("_", " ")}
                </span>
              </div>
              <h2 id="modal-job-title" className="quick-apply-title">
                {job.title}
              </h2>
              <div className="quick-apply-meta">
                <span>
                  <Building2 size={14} /> {job.company}
                </span>
                <span>
                  <MapPin size={14} /> {job.location}
                </span>
                <span>
                  <WalletCards size={14} /> {formatSalary(job)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content body */}
        <div className="quick-apply-body">
          {job.is_external && job.external_url && !success && (
            <div className="external-direct-card mb-4">
              <div>
                <strong>Direct Employer Application Available</strong>
                <p>
                  This opportunity is hosted on {job.source || "an external platform"}. You can apply directly on their portal without an account:
                </p>
              </div>
              <a
                href={job.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="button button-primary"
                style={{ whiteSpace: "nowrap", textDecoration: "none" }}
              >
                Apply on {job.source || "Site"} <ExternalLink size={14} />
              </a>
            </div>
          )}

          {success ? (
            <div className="quick-apply-success">
              <div className="success-icon-wrap">
                <CheckCircle2 size={48} className="text-emerald-500" />
              </div>
              <h3>Application Submitted!</h3>
              <p>
                Your application for <strong>{job.title}</strong> at{" "}
                <strong>{job.company}</strong> has been recorded on JobConnect.
              </p>

              {job.is_external && job.external_url && (
                <div className="external-direct-card">
                  <div>
                    <strong>Partner Job Posting</strong>
                    <p>
                      This role was syndicated via {job.source || "external partner"}.
                      You can also review the original partner listing:
                    </p>
                  </div>
                  <a
                    href={job.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button button-outline"
                  >
                    View Employer Page <ExternalLink size={14} />
                  </a>
                </div>
              )}

              <div className="quick-apply-actions">
                <Link
                  href="/dashboard"
                  className="button button-primary"
                  onClick={onClose}
                >
                  Go to Dashboard <ArrowRight size={15} />
                </Link>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={onClose}
                >
                  Done
                </button>
              </div>
            </div>
          ) : !user ? (
            /* User is not logged in: inline sign in / sign up */
            <div className="quick-apply-auth">
              <div className="quick-apply-auth-banner">
                <Lock size={18} />
                <div>
                  <strong>Quick Candidate Sign In</strong>
                  <p>
                    Create or sign in to your candidate account to apply directly in
                    seconds.
                  </p>
                </div>
              </div>

              <div className="auth-tab-buttons">
                <button
                  type="button"
                  className={`auth-tab ${authMode === "signup" ? "active" : ""}`}
                  onClick={() => setAuthMode("signup")}
                >
                  New Candidate (1-Click Signup)
                </button>
                <button
                  type="button"
                  className={`auth-tab ${authMode === "signin" ? "active" : ""}`}
                  onClick={() => setAuthMode("signin")}
                >
                  Existing Candidate (Sign In)
                </button>
              </div>

              {authError && <div className="alert alert-error">{authError}</div>}

              <form onSubmit={handleGuestAuth} className="quick-auth-form">
                <label className="field-block">
                  <span>Email address</span>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="you@domain.com"
                  />
                </label>
                <label className="field-block">
                  <span>Password</span>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </label>
                <button
                  type="submit"
                  disabled={authBusy}
                  className="button button-primary w-full"
                >
                  {authBusy ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : authMode === "signup" ? (
                    "Create Account & Continue"
                  ) : (
                    "Sign In & Continue"
                  )}
                </button>
              </form>
            </div>
          ) : user.role === "recruiter" ? (
            <div className="alert alert-warning">
              <p>
                You are currently signed in with a <strong>Recruiter</strong>{" "}
                account. Recruiter accounts post jobs. To apply for open roles,
                please sign in as a candidate.
              </p>
            </div>
          ) : (
            /* Candidate is logged in: Quick Apply Form */
            <form onSubmit={handleApply} className="quick-apply-form">
              {error && <div className="alert alert-error">{error}</div>}

              {/* Resume Selection */}
              <div className="resume-section">
                <label className="section-label">Your Resume</label>

                {hasSaved && !useCustomResume ? (
                  <div className="saved-resume-card">
                    <div className="saved-resume-info">
                      <div className="saved-resume-icon">
                        <FileText size={20} />
                      </div>
                      <div>
                        <strong>
                          {user.resume_filename || "Saved Profile Resume"}
                        </strong>
                        <span className="saved-resume-verified">
                          <Check size={12} /> Default Profile Resume
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-link text-sm"
                      onClick={() => setCustomResume(true)}
                    >
                      Use another file
                    </button>
                  </div>
                ) : (
                  <div className="custom-resume-wrap">
                    <label className="file-dropzone">
                      <UploadCloud size={28} />
                      <span>
                        {resumeFile
                          ? resumeFile.name
                          : "Upload your resume (PDF or DOCX, up to 5MB)"}
                      </span>
                      <small>Click to browse from your device</small>
                      <input
                        type="file"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setResumeFile(file);
                        }}
                      />
                    </label>

                    {hasSaved && (
                      <button
                        type="button"
                        className="text-link text-xs mt-2"
                        onClick={() => {
                          setCustomResume(false);
                          setResumeFile(null);
                        }}
                      >
                        ← Back to saved profile resume
                      </button>
                    )}

                    <label className="checkbox-label mt-2">
                      <input
                        type="checkbox"
                        checked={saveToProfile}
                        onChange={(e) => setSaveToProfile(e.target.checked)}
                      />
                      <span>Save as my default resume for future 1-click applies</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Cover Letter Note */}
              <label className="field-block">
                <span>Short Cover Note (Optional)</span>
                <textarea
                  rows={3}
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  placeholder="Tell the hiring team why you are a great match for this role..."
                  maxLength={3000}
                />
              </label>

              {/* Submit Button */}
              <div className="quick-apply-actions">
                <button
                  type="submit"
                  disabled={submitting}
                  className="button button-primary submit-apply-btn"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Submitting...
                    </>
                  ) : willUseSaved ? (
                    <>
                      <Sparkles size={16} /> 1-Click Apply Now
                    </>
                  ) : (
                    <>
                      <ArrowRight size={16} /> Submit Application
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={onClose}
                  disabled={submitting}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
