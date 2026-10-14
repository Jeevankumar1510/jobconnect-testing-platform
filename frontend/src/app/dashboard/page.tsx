"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Plus,
  Send,
  Trash2,
  UploadCloud,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import {
  ApiError,
  deleteProfileResume,
  getJobApplications,
  getMyApplications,
  getMyJobs,
  request,
  updateApplicationStatus,
  uploadProfileResume,
} from "@/lib/api";
import type { Application, ApplicationStatus, Job, Page, User } from "@/lib/types";

const transitions: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ["reviewing", "rejected"],
  reviewing: ["interview", "rejected", "accepted"],
  interview: ["rejected", "accepted"],
  rejected: [],
  accepted: [],
};

const statusLabels: Record<ApplicationStatus, string> = {
  submitted: "Submitted",
  reviewing: "In Review",
  interview: "Interviewing",
  rejected: "Not Selected",
  accepted: "Offer Extended",
};

export default function DashboardPage() {
  const { user, token, ready, refreshProfile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/auth?mode=login");
  }, [ready, user, router]);

  if (!ready || !user || !token) {
    return <main className="page-loading"><div className="loader" />Opening your space…</main>;
  }
  return user.role === "recruiter" ? (
    <RecruiterDashboard token={token} email={user.email} />
  ) : (
    <CandidateDashboard
      token={token}
      email={user.email}
      user={user}
      refreshProfile={refreshProfile}
    />
  );
}

function CandidateDashboard({
  token,
  email,
  user,
  refreshProfile,
}: {
  token: string;
  email: string;
  user: User;
  refreshProfile: () => Promise<void>;
}) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeMsg, setResumeMsg] = useState("");
  const [resumeError, setResumeError] = useState("");

  useEffect(() => {
    let active = true;
    getMyApplications(token)
      .then((page) => {
        if (active) setApplications(page.items);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : "We couldn’t load your applications.");
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  function refresh() {
    setBusy(true);
    setError("");
    void getMyApplications(token)
      .then((page) => setApplications(page.items))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "We couldn’t load your applications.");
      })
      .finally(() => setBusy(false));
  }

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeUploading(true);
    setResumeError("");
    setResumeMsg("");
    try {
      await uploadProfileResume(file, token);
      await refreshProfile();
      setResumeMsg("Default resume updated! You can now 1-click apply to any job.");
      setTimeout(() => setResumeMsg(""), 5000);
    } catch (err: unknown) {
      setResumeError(err instanceof Error ? err.message : "Failed to upload resume.");
    } finally {
      setResumeUploading(false);
    }
  }

  async function handleResumeDelete() {
    if (!confirm("Are you sure you want to remove your default saved resume?")) return;
    setResumeUploading(true);
    setResumeError("");
    try {
      await deleteProfileResume(token);
      await refreshProfile();
      setResumeMsg("Default resume removed.");
      setTimeout(() => setResumeMsg(""), 4000);
    } catch (err: unknown) {
      setResumeError(err instanceof Error ? err.message : "Failed to remove resume.");
    } finally {
      setResumeUploading(false);
    }
  }

  return (
    <main className="dashboard-page">
      <div className="dashboard-welcome">
        <div>
          <div className="eyebrow eyebrow-light"><span className="online-dot" /> YOUR CANDIDATE SPACE</div>
          <h1>Good things are <span className="serif-accent">in motion.</span></h1>
          <p>Welcome back, {email}. Keep track of your job applications and profile resume.</p>
        </div>
        <Link href="/" className="button button-primary"><BriefcaseBusiness size={16} /> Explore opportunities</Link>
      </div>

      <div className="dashboard-stats">
        <div className="stat-card">
          <span className="stat-icon lavender"><Send size={18} /></span>
          <span className="stat-label">Applications sent</span>
          <strong>{busy ? "—" : applications.length}</strong>
          <small>Every application is tracked</small>
        </div>
        <div className="stat-card">
          <span className="stat-icon mint"><Check size={18} /></span>
          <span className="stat-label">Active Conversations</span>
          <strong>{busy ? "—" : applications.filter((item) => item.status === "reviewing" || item.status === "interview").length}</strong>
          <small>In review or interview</small>
        </div>
        <div className="stat-card">
          <span className="stat-icon peach"><Zap size={18} /></span>
          <span className="stat-label">1-Click Apply Ready</span>
          <strong className="stat-word">{user.has_saved_resume || user.resume_filename ? "Active" : "Upload"}</strong>
          <small>{user.has_saved_resume || user.resume_filename ? "Instant apply enabled" : "Add resume below"}</small>
        </div>
      </div>

      {/* Candidate Default Resume Section */}
      <section className="dashboard-section resume-profile-card">
        <div className="dashboard-section-heading">
          <div>
            <span className="eyebrow eyebrow-light">SPEED UP YOUR SEARCH</span>
            <h2>My 1-Click Profile Resume</h2>
            <p>Save your default resume to apply directly to any job with a single click.</p>
          </div>
        </div>

        {resumeMsg && <div className="alert alert-success">{resumeMsg}</div>}
        {resumeError && <div className="alert alert-error">{resumeError}</div>}

        {user.has_saved_resume || user.resume_filename ? (
          <div className="active-resume-box">
            <div className="active-resume-details">
              <div className="active-resume-icon">
                <FileText size={24} />
              </div>
              <div>
                <strong>{user.resume_filename || "Saved Profile Resume"}</strong>
                <span className="text-emerald-700 text-xs font-medium flex items-center gap-1 mt-0.5">
                  <Check size={13} /> Active & Ready for 1-Click Apply on all job postings
                </span>
              </div>
            </div>
            <div className="active-resume-actions">
              <a
                href="/api/backend/api/v1/auth/me/resume"
                download={user.resume_filename || "resume.pdf"}
                className="button button-outline button-small"
              >
                <Download size={14} /> Download
              </a>
              <label className="button button-secondary button-small cursor-pointer">
                <UploadCloud size={14} />
                {resumeUploading ? "Updating..." : "Replace File"}
                <input
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="sr-only"
                  onChange={handleResumeUpload}
                  disabled={resumeUploading}
                />
              </label>
              <button
                type="button"
                className="button button-ghost button-small text-rose-600"
                onClick={handleResumeDelete}
                disabled={resumeUploading}
                title="Remove resume"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-resume-box">
            <div className="empty-resume-content">
              <UploadCloud size={32} className="text-emerald-600" />
              <div>
                <strong>No default resume uploaded yet</strong>
                <p>Upload a PDF or DOCX resume to unlock 1-click applications across all jobs.</p>
              </div>
            </div>
            <label className="button button-primary cursor-pointer">
              {resumeUploading ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Uploading...
                </>
              ) : (
                <>
                  <UploadCloud size={15} /> Upload Default Resume
                </>
              )}
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                onChange={handleResumeUpload}
                disabled={resumeUploading}
              />
            </label>
          </div>
        )}
      </section>

      {/* Applications list */}
      <section className="dashboard-section">
        <div className="dashboard-section-heading">
          <div>
            <span className="eyebrow eyebrow-light">YOUR JOURNEY</span>
            <h2>My Submitted Applications</h2>
          </div>
          <button className="button button-secondary button-small" onClick={refresh}>
            Refresh
          </button>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        {busy ? (
          <div className="dashboard-empty"><div className="loader" />Loading your applications…</div>
        ) : applications.length ? (
          <div className="application-list">
            {applications.map((application) => (
              <div className="candidate-application" key={application.id}>
                <div className="application-company-mark">
                  {application.company ? application.company.slice(0, 1).toUpperCase() : String(application.job_id).padStart(2, "0")}
                </div>
                <div className="application-summary">
                  <div className="flex items-center gap-2">
                    <span className="eyebrow eyebrow-light">
                      {application.company || `JOB #${application.job_id}`}
                    </span>
                    {application.external_url && (
                      <span className="badge-partner text-xs">Partner Role</span>
                    )}
                  </div>
                  <h3>{application.job_title || `Application #${application.id}`}</h3>
                  <div className="flex items-center gap-3 text-xs text-stone-500 mt-1">
                    <span className="flex items-center gap-1">
                      <FileText size={13} /> {application.resume_filename}
                    </span>
                    <span>Applied {new Date(application.created_at).toLocaleDateString()}</span>
                  </div>
                  {application.external_url && (
                    <div className="mt-2">
                      <a
                        href={application.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-link text-xs inline-flex items-center gap-1"
                      >
                        Visit Partner Career Page <ExternalLink size={12} />
                      </a>
                    </div>
                  )}
                </div>
                <span className={`status-pill status-${application.status}`}>
                  {statusLabels[application.status]}
                </span>
                <Link
                  className="card-arrow"
                  href={`/jobs/${application.job_id}`}
                  aria-label="View opportunity"
                >
                  <ArrowUpRight size={18} />
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Send size={24} />
            <h3>Your next step starts here</h3>
            <p>You haven’t applied to a role yet. Explore hundreds of direct and partner postings.</p>
            <Link className="button button-primary" href="/">
              Explore open roles <ArrowRight size={16} />
            </Link>
          </div>
        )}
      </section>
      <div className="dashboard-tip">
        <span>✳</span>
        <p><strong>A little reminder:</strong> Every application is a step toward a place where you can do your best work.</p>
      </div>
    </main>
  );
}

function RecruiterDashboard({ token, email }: { token: string; email: string }) {
  const [jobsPage, setJobsPage] = useState<Page<Job> | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let active = true;
    getMyJobs(token)
      .then((page) => {
        if (active) setJobsPage(page);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : "We couldn’t load your roles.");
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  function refresh() {
    setBusy(true);
    setError("");
    void getMyJobs(token)
      .then(setJobsPage)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "We couldn’t load your roles.");
      })
      .finally(() => setBusy(false));
  }

  return (
    <main className="dashboard-page">
      <div className="dashboard-welcome recruiter-welcome">
        <div>
          <div className="eyebrow eyebrow-light"><span className="online-dot" /> YOUR RECRUITER SPACE</div>
          <h1>Build a team that <span className="serif-accent">gets it.</span></h1>
          <p>Welcome back, {email}. Find the right people for the work ahead.</p>
        </div>
        <button className="button button-primary" onClick={() => setShowForm((show) => !show)}><Plus size={17} /> Post a new role</button>
      </div>
      <div className="dashboard-stats">
        <div className="stat-card"><span className="stat-icon lavender"><BriefcaseBusiness size={18} /></span><span className="stat-label">Your open roles</span><strong>{busy ? "—" : jobsPage?.items.filter((job) => job.status === "open").length ?? 0}</strong><small>Good work starts here</small></div>
        <div className="stat-card"><span className="stat-icon mint"><Users size={18} /></span><span className="stat-label">Applications received</span><strong>{busy ? "—" : "—"}</strong><small>Meet your next teammate</small></div>
        <div className="stat-card"><span className="stat-icon peach"><Check size={18} /></span><span className="stat-label">Your team story</span><strong className="stat-word">Growing</strong><small>One great connection at a time</small></div>
      </div>
      {showForm && <JobForm token={token} onCancel={() => setShowForm(false)} onCreated={() => { setShowForm(false); refresh(); }} />}
      <section className="dashboard-section">
        <div className="dashboard-section-heading"><div><span className="eyebrow eyebrow-light">YOUR TEAM, YOUR ROLES</span><h2>Job postings</h2></div><button className="button button-secondary button-small" onClick={refresh}>Refresh</button></div>
        {error && <div className="alert alert-error">{error}</div>}
        {busy ? <div className="dashboard-empty"><div className="loader" />Loading your roles…</div> : jobsPage?.items.length ? <div className="recruiter-job-list">{jobsPage.items.map((job) => <RecruiterJobCard job={job} token={token} key={job.id} />)}</div> : !error ? <div className="empty-state"><BriefcaseBusiness size={24} /><h3>Your next hire starts with a role</h3><p>Share what you’re building and meet people who want to be part of it.</p><button className="button button-primary" onClick={() => setShowForm(true)}>Post your first role <Plus size={16} /></button></div> : null}
      </section>
    </main>
  );
}

function JobForm({ token, onCancel, onCreated }: { token: string; onCancel: () => void; onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const salaryMin = String(form.get("salary_min") ?? "").trim();
    const salaryMax = String(form.get("salary_max") ?? "").trim();
    const payload = {
      title: String(form.get("title") ?? ""),
      company: String(form.get("company") ?? ""),
      location: String(form.get("location") ?? ""),
      description: String(form.get("description") ?? ""),
      employment_type: String(form.get("employment_type") ?? "full_time"),
      experience_level: String(form.get("experience_level") ?? "fresher"),
      salary_min: salaryMin ? Number(salaryMin) : null,
      salary_max: salaryMax ? Number(salaryMax) : null,
    };
    try {
      await request<Job>("/jobs", { token, method: "POST", json: payload });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn’t create that role.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="job-form-panel">
      <div className="form-panel-heading">
        <div>
          <span className="eyebrow eyebrow-light">🇮🇳 INDIA IT FRESHER &amp; TECH PORTAL</span>
          <h2>Post an Indian IT Fresher / Junior Role</h2>
        </div>
        <button className="icon-button" onClick={onCancel} aria-label="Close role form"><X size={20} /></button>
      </div>
      <div className="text-xs text-stone-600 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3">
        <strong>Strict India IT Focus:</strong> JobConnect is dedicated strictly to India locations (Bengaluru, Hyderabad, Pune, Remote - India) and IT / Tech domains (Software, Data/AI, QA, Cloud, Security) for Freshers (0–2 years). Non-IT or foreign roles are rejected.
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <form className="job-create-form" onSubmit={submit}>
        <label>IT Role title<input name="title" placeholder="e.g. Associate Software Engineer, Junior React Dev" required maxLength={150} /></label>
        <label>Company<input name="company" placeholder="e.g. Tech Solutions Pvt Ltd" required maxLength={150} /></label>
        <label>Indian Location<input name="location" placeholder="e.g. Bengaluru, Hyderabad, Pune, or Remote (India)" required maxLength={150} /></label>
        <label>Experience target
          <select name="experience_level" defaultValue="fresher">
            <option value="fresher">🌱 Fresher / Entry Level (0-1 yr)</option>
            <option value="internship">🎓 Tech Internship / Graduate Trainee</option>
            <option value="junior">⚡ Junior Engineer (1-2 yrs)</option>
          </select>
        </label>
        <label>Employment type
          <select name="employment_type" defaultValue="full_time">
            <option value="full_time">Full-time</option>
            <option value="internship">Internship</option>
            <option value="part_time">Part-time</option>
            <option value="contract">Contract</option>
          </select>
        </label>
        <label>Annual Salary From (₹ INR)<input name="salary_min" type="number" min="0" step="1000" placeholder="e.g. 400000 (₹4 LPA)" /></label>
        <label>Annual Salary To (₹ INR)<input name="salary_max" type="number" min="0" step="1000" placeholder="e.g. 750000 (₹7.5 LPA)" /></label>
        <label className="form-full">Opportunity &amp; Tech Stack Details<textarea name="description" rows={5} required placeholder="Tech stack (Python, React, Java, AWS, etc.), mentorship, training, and fresher eligibility..." /></label>
        <div className="form-full form-actions">
          <button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button>
          <button className="button button-primary" disabled={busy}>{busy ? "Publishing…" : "Publish India IT Role"} <ArrowUpRight size={16} /></button>
        </div>
      </form>
    </section>
  );
}

function RecruiterJobCard({ job, token }: { job: Job; token: string }) {
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");

  async function toggleApplicants() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (applications) return;
    setError("");
    try {
      const page = await getJobApplications(job.id, token);
      setApplications(page.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn’t load the applicants.");
    }
  }

  function replaceApplication(updated: Application) {
    setApplications((items) => items?.map((item) => item.id === updated.id ? updated : item) ?? null);
  }

  return (
    <article className="recruiter-job-card">
      <div className="recruiter-job-top">
        <div className="company-avatar avatar-2">{job.company.slice(0, 1).toUpperCase()}</div>
        <div className="recruiter-job-info"><span className={`status-pill status-${job.status}`}>{job.status === "open" ? "Open" : "Closed"}</span><h3>{job.title}</h3><p>{job.company} <span>·</span> <MapPin size={14} /> {job.location}</p></div>
        <Link className="card-arrow recruiter-job-arrow" href={`/jobs/${job.id}`} aria-label="Preview job"><ArrowUpRight size={17} /></Link>
      </div>
      <div className="recruiter-job-bottom"><span>Posted {new Date(job.created_at).toLocaleDateString()}</span><button className="text-link" onClick={() => void toggleApplicants()}>{expanded ? "Hide applicants" : "View applicants"} <ChevronDown size={15} className={expanded ? "chevron-rotated" : ""} /></button></div>
      {expanded && <div className="applicant-list">{error ? <div className="alert alert-error">{error}</div> : applications === null ? <div className="applicant-loading"><div className="loader" />Loading applications…</div> : applications.length ? applications.map((application) => <ApplicantRow key={application.id} application={application} token={token} onUpdate={replaceApplication} />) : <p className="no-applicants">No applications yet. The right person could be just around the corner.</p>}</div>}
    </article>
  );
}

function ApplicantRow({ application, token, onUpdate }: { application: Application; token: string; onUpdate: (application: Application) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nextStatuses = transitions[application.status];

  async function updateStatus(status: ApplicationStatus) {
    setBusy(true);
    setError("");
    try {
      onUpdate(await updateApplicationStatus(application.id, status, token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Status update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadResume() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/backend/api/v1/applications/${application.id}/resume`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const message = typeof payload === "object" && payload !== null && "detail" in payload && typeof payload.detail === "string" ? payload.detail : "Could not download this resume.";
        throw new Error(message);
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = application.resume_filename;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download this resume.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="applicant-row">
      <span className="applicant-avatar">{String(application.candidate_id).slice(-2)}</span>
      <div className="applicant-details"><strong>Candidate #{application.candidate_id}</strong><small>Applied {new Date(application.created_at).toLocaleDateString()}</small>{application.cover_letter && <p>{application.cover_letter}</p>}{error && <small className="inline-error">{error}</small>}</div>
      <span className={`status-pill status-${application.status}`}>{statusLabels[application.status]}</span>
      <button className="resume-button" onClick={() => void downloadResume()} disabled={busy}><FileText size={15} /> Resume</button>
      {nextStatuses.length > 0 && <label className="status-select-wrap"><span className="sr-only">Update application status</span><select disabled={busy} value="" onChange={(event) => { if (event.target.value) void updateStatus(event.target.value as ApplicationStatus); }}><option value="">Update…</option>{nextStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select><ChevronDown size={13} /></label>}
    </div>
  );
}
