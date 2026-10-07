"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Building2, Check, Clock3, MapPin, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError, request } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import type { Job } from "@/lib/types";

function formatSalary(job: Job) {
  const min = job.salary_min ? Number(job.salary_min).toLocaleString() : null;
  const max = job.salary_max ? Number(job.salary_max).toLocaleString() : null;
  if (!min && !max) return "Salary not listed";
  return `$${min ?? "—"}${max ? ` – $${max}` : "+"}`;
}

export default function JobDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, token, ready } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [resume, setResume] = useState<File | null>(null);
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

  async function submitApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !job || !resume) return;
    const form = new FormData();
    form.set("job_id", String(job.id));
    form.set("cover_letter", coverLetter);
    form.set("resume", resume);
    setSubmitting(true);
    setError("");
    try {
      await request("/applications", { token, method: "POST", body: form });
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
            <div className="company-avatar avatar-1 large-avatar">{job.company.slice(0, 1).toUpperCase()}</div>
            <div><p className="eyebrow eyebrow-light">A NEW POSSIBILITY</p><span className="detail-company">{job.company}</span></div>
          </div>
          <h1 className="detail-title">{job.title}</h1>
          <div className="detail-pills">
            <span><MapPin size={15} />{job.location}</span>
            <span><Clock3 size={15} />{job.employment_type.replace("_", " ")}</span>
            <span><WalletCards size={15} />{formatSalary(job)}</span>
          </div>
          <div className="detail-divider" />
          <div className="detail-section">
            <span className="eyebrow eyebrow-light">THE OPPORTUNITY</span>
            <h2>A little about the role</h2>
            <p className="job-description">{job.description}</p>
          </div>
          <div className="detail-note"><span className="detail-note-icon"><SparkleIcon /></span><span><strong>Does this feel like your kind of thing?</strong><small>Introduce yourself. It only takes a few minutes.</small></span></div>
        </article>
        <aside className="apply-panel" id="apply">
          <span className="eyebrow eyebrow-light">TAKE THE NEXT STEP</span>
          <h2>Make it yours.</h2>
          <p>Share a little about yourself and send your application.</p>
          {success ? (
            <div className="apply-success">
              <span className="success-mark"><Check size={23} /></span>
              <h3>You’re on your way.</h3>
              <p>Your application is with the team. Fingers crossed for what comes next.</p>
              <Link className="button button-primary button-full" href="/dashboard">View my applications</Link>
            </div>
          ) : user?.role === "recruiter" ? (
            <div className="alert alert-info">Sign in with a candidate account to apply for this role.</div>
          ) : !user ? (
            <div className="apply-signin"><p>Sign in or create a candidate account to apply.</p><Link className="button button-primary button-full" href={`/auth?mode=register&role=candidate`}>Create an account <ArrowUpRight size={16} /></Link><Link className="text-link centered-link" href="/auth?mode=login">Already have an account? Sign in</Link></div>
          ) : (
            <form className="apply-form" onSubmit={submitApplication}>
              <label>Your note <span className="optional-label">optional</span><textarea maxLength={5000} rows={5} value={coverLetter} onChange={(event) => setCoverLetter(event.target.value)} placeholder="What caught your eye about this role?" /></label>
              <label className="upload-label">Resume <span className="required-label">PDF or DOCX</span><input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required onChange={(event) => setResume(event.target.files?.[0] ?? null)} /><small>{resume ? resume.name : "Choose a file up to 5 MB"}</small></label>
              {error && <div className="alert alert-error" role="alert">{error}</div>}
              <button className="button button-primary button-full" disabled={submitting || !resume}>{submitting ? "Sending your application…" : "Send my application"} {!submitting && <ArrowUpRight size={16} />}</button>
              <p className="form-footnote">Your resume is only shared with the hiring team for this role.</p>
            </form>
          )}
          {user?.role === "candidate" && <button className="panel-link" onClick={() => router.push("/dashboard")}>Already applied? Check your applications <ArrowUpRight size={14} /></button>}
        </aside>
      </div>
    </main>
  );
}

function SparkleIcon() {
  return <Building2 size={18} />;
}
