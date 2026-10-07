"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  FileText,
  MapPin,
  Plus,
  Send,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import {
  ApiError,
  getJobApplications,
  getMyApplications,
  getMyJobs,
  request,
  updateApplicationStatus,
} from "@/lib/api";
import type { Application, ApplicationStatus, Job, Page } from "@/lib/types";

const transitions: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ["reviewing", "rejected"],
  reviewing: ["interview", "rejected", "accepted"],
  interview: ["rejected", "accepted"],
  rejected: [],
  accepted: [],
};

const statusLabels: Record<ApplicationStatus, string> = {
  submitted: "New",
  reviewing: "In review",
  interview: "Interview",
  rejected: "Not selected",
  accepted: "Offer",
};

export default function DashboardPage() {
  const { user, token, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/auth?mode=login");
  }, [ready, user, router]);

  if (!ready || !user || !token) {
    return <main className="page-loading"><div className="loader" />Opening your space…</main>;
  }
  return user.role === "recruiter" ? <RecruiterDashboard token={token} email={user.email} /> : <CandidateDashboard token={token} email={user.email} />;
}

function CandidateDashboard({ token, email }: { token: string; email: string }) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <main className="dashboard-page">
      <div className="dashboard-welcome">
        <div>
          <div className="eyebrow eyebrow-light"><span className="online-dot" /> YOUR CANDIDATE SPACE</div>
          <h1>Good things are <span className="serif-accent">in motion.</span></h1>
          <p>Welcome back, {email}. Keep an eye on what’s next.</p>
        </div>
        <Link href="/" className="button button-primary"><BriefcaseBusiness size={16} /> Explore opportunities</Link>
      </div>
      <div className="dashboard-stats">
        <div className="stat-card"><span className="stat-icon lavender"><Send size={18} /></span><span className="stat-label">Applications sent</span><strong>{busy ? "—" : applications.length}</strong><small>Every next step counts</small></div>
        <div className="stat-card"><span className="stat-icon mint"><Check size={18} /></span><span className="stat-label">In the conversation</span><strong>{busy ? "—" : applications.filter((item) => item.status === "reviewing" || item.status === "interview").length}</strong><small>Moving forward together</small></div>
        <div className="stat-card"><span className="stat-icon peach"><BriefcaseBusiness size={18} /></span><span className="stat-label">Your next chapter</span><strong className="stat-word">Out there</strong><small>Find a role that feels right</small></div>
      </div>
      <section className="dashboard-section">
        <div className="dashboard-section-heading"><div><span className="eyebrow eyebrow-light">YOUR JOURNEY</span><h2>Applications</h2></div><button className="button button-secondary button-small" onClick={refresh}>Refresh</button></div>
        {error && <div className="alert alert-error">{error}</div>}
        {busy ? <div className="dashboard-empty"><div className="loader" />Loading your applications…</div> : applications.length ? <div className="application-list">{applications.map((application) => <div className="candidate-application" key={application.id}><div className="application-company-mark">{String(application.job_id).padStart(2, "0")}</div><div className="application-summary"><span className="eyebrow eyebrow-light">JOB #{application.job_id}</span><h3>Application #{application.id}</h3><p><FileText size={14} /> {application.resume_filename}</p><small>Sent {new Date(application.created_at).toLocaleDateString()}</small></div><span className={`status-pill status-${application.status}`}>{statusLabels[application.status]}</span><Link className="card-arrow" href={`/jobs/${application.job_id}`} aria-label="View opportunity"><ArrowUpRight size={18} /></Link></div>)}</div> : <div className="empty-state"><Send size={24} /><h3>Your next step starts here</h3><p>You haven’t applied to a role yet. Take a look around and see what feels right.</p><Link className="button button-primary" href="/">Explore open roles <ArrowRight size={16} /></Link></div>}
      </section>
      <div className="dashboard-tip"><span>✳</span><p><strong>A little reminder:</strong> Every application is a step toward a place where you can do your best work.</p></div>
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
      <div className="form-panel-heading"><div><span className="eyebrow eyebrow-light">MAKE AN INTRODUCTION</span><h2>Post a new role</h2></div><button className="icon-button" onClick={onCancel} aria-label="Close role form"><X size={20} /></button></div>
      {error && <div className="alert alert-error">{error}</div>}
      <form className="job-create-form" onSubmit={submit}>
        <label>Role title<input name="title" placeholder="e.g. Product Designer" required maxLength={150} /></label>
        <label>Company<input name="company" placeholder="Your company" required maxLength={150} /></label>
        <label>Location<input name="location" placeholder="City, country, or Remote" required maxLength={150} /></label>
        <label>Employment type<select name="employment_type" defaultValue="full_time"><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option></select></label>
        <label>Salary from<input name="salary_min" type="number" min="0" step="0.01" placeholder="Optional" /></label>
        <label>Salary to<input name="salary_max" type="number" min="0" step="0.01" placeholder="Optional" /></label>
        <label className="form-full">Tell people about the role<textarea name="description" rows={5} required placeholder="The work, the team, and what makes this opportunity special…" /></label>
        <div className="form-full form-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? "Publishing…" : "Publish role"} <ArrowUpRight size={16} /></button></div>
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
