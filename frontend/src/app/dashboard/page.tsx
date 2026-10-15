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
  interested: ["ready_to_apply", "applied", "withdrawn"],
  ready_to_apply: ["applied", "withdrawn"],
  submitted: ["reviewing", "rejected"],
  applied: ["reviewing", "assessment", "interview", "rejected", "withdrawn"],
  reviewing: ["assessment", "interview", "rejected", "accepted"],
  assessment: ["interview", "rejected", "withdrawn"],
  interview: ["offer", "rejected", "accepted", "withdrawn"],
  offer: ["accepted", "withdrawn"],
  rejected: [],
  accepted: [],
  withdrawn: [],
};

const statusLabels: Record<ApplicationStatus, string> = {
  interested: "Interested",
  ready_to_apply: "Ready to Apply",
  submitted: "Submitted",
  applied: "Applied",
  reviewing: "In Review",
  assessment: "Assessment",
  interview: "Interviewing",
  offer: "Offer Received",
  rejected: "Not Selected",
  accepted: "Offer Extended",
  withdrawn: "Withdrawn",
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
  const [activeTab, setActiveTab] = useState<"applications" | "saved" | "profile" | "notifications">("applications");
  const [applications, setApplications] = useState<Application[]>([]);
  const [savedJobs, setSavedJobs] = useState<import("@/lib/types").SavedJob[]>([]);
  const [profile, setProfile] = useState<import("@/lib/types").CandidateProfile | null>(null);
  const [notifications, setNotifications] = useState<import("@/lib/types").Notification[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Resume states
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeMsg, setResumeMsg] = useState("");
  const [resumeError, setResumeError] = useState("");

  // Profile form state
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    phone: "",
    current_location: "",
    preferred_locations: "",
    preferred_job_titles: "",
    technical_skills: "",
    education: "",
    experience_level: "fresher",
    internship_experience: "",
    projects: "",
    certifications: "",
    preferred_industries: "",
    employment_type_preferences: "full_time",
    work_mode_preferences: "remote",
    expected_salary_min: "",
    expected_salary_max: "",
  });

  const loadData = async () => {
    setBusy(true);
    setError("");
    try {
      const [appData, savedData, profileData, notifData] = await Promise.allSettled([
        getMyApplications(token),
        import("@/lib/api").then((m) => m.getSavedJobs(token)),
        import("@/lib/api").then((m) => m.getCandidateProfile(token)),
        import("@/lib/api").then((m) => m.getNotifications(token)),
      ]);

      if (appData.status === "fulfilled") setApplications(appData.value.items);
      if (savedData.status === "fulfilled") setSavedJobs(savedData.value);
      if (notifData.status === "fulfilled") setNotifications(notifData.value);
      if (profileData.status === "fulfilled" && profileData.value) {
        const p = profileData.value;
        setProfile(p);
        setProfileForm({
          full_name: p.full_name || "",
          phone: p.phone || "",
          current_location: p.current_location || "",
          preferred_locations: p.preferred_locations || "",
          preferred_job_titles: p.preferred_job_titles || "",
          technical_skills: p.technical_skills || "",
          education: p.education || "",
          experience_level: p.experience_level || "fresher",
          internship_experience: p.internship_experience || "",
          projects: p.projects || "",
          certifications: p.certifications || "",
          preferred_industries: p.preferred_industries || "",
          employment_type_preferences: p.employment_type_preferences || "full_time",
          work_mode_preferences: p.work_mode_preferences || "remote",
          expected_salary_min: p.expected_salary_min ? String(p.expected_salary_min) : "",
          expected_salary_max: p.expected_salary_max ? String(p.expected_salary_max) : "",
        });
      }
    } catch {
      setError("Failed to load your candidate data.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [token]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const { updateCandidateProfile } = await import("@/lib/api");
      const updated = await updateCandidateProfile(
        {
          ...profileForm,
          expected_salary_min: profileForm.expected_salary_min ? Number(profileForm.expected_salary_min) : null,
          expected_salary_max: profileForm.expected_salary_max ? Number(profileForm.expected_salary_max) : null,
        },
        token,
      );
      setProfile(updated);
      setSuccessMsg("Candidate profile saved successfully! Your preferences are now active across Job Connect.");
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setProfileLoading(false);
    }
  };

  const handleRemoveSaved = async (jobId: number) => {
    try {
      const { removeSavedJob } = await import("@/lib/api");
      await removeSavedJob(jobId, token);
      setSavedJobs((prev) => prev.filter((s) => s.job_id !== jobId));
    } catch (err) {
      console.error("Failed to remove saved job", err);
    }
  };

  const handleUpdateApplicationStatus = async (appId: number, newStatus: ApplicationStatus, notes?: string) => {
    try {
      const { updateApplicationNotesAndStatus } = await import("@/lib/api");
      const updated = await updateApplicationNotesAndStatus(appId, { status: newStatus, notes }, token);
      setApplications((prev) => prev.map((a) => (a.id === appId ? updated : a)));
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const handleMarkNotifRead = async (notifId: number) => {
    try {
      const { markNotificationRead } = await import("@/lib/api");
      await markNotificationRead(notifId, token);
      setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n)));
    } catch (err) {
      console.error("Failed to mark notification read", err);
    }
  };

  const handleMarkAllNotifsRead = async () => {
    try {
      const { markAllNotificationsRead } = await import("@/lib/api");
      await markAllNotificationsRead(token);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error("Failed to mark all read", err);
    }
  };

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

  const unreadNotifsCount = notifications.filter((n) => !n.is_read).length;

  return (
    <main className="dashboard-page">
      <div className="dashboard-welcome">
        <div>
          <div className="eyebrow eyebrow-light"><span className="online-dot" /> YOUR CANDIDATE SPACE</div>
          <h1>Good things are <span className="serif-accent">in motion.</span></h1>
          <p>Welcome back, {profile?.full_name || email}. Track applications, manage your persistent profile, and monitor hiring updates.</p>
        </div>
        <Link href="/" className="button button-primary"><BriefcaseBusiness size={16} /> Explore opportunities</Link>
      </div>

      <div className="dashboard-stats">
        <div className="stat-card">
          <span className="stat-icon lavender"><Send size={18} /></span>
          <span className="stat-label">Applications tracked</span>
          <strong>{busy ? "—" : applications.length}</strong>
          <small>Verified pipeline</small>
        </div>
        <div className="stat-card">
          <span className="stat-icon mint"><Check size={18} /></span>
          <span className="stat-label">Saved opportunities</span>
          <strong>{busy ? "—" : savedJobs.length}</strong>
          <small>Bookmarked listings</small>
        </div>
        <div className="stat-card">
          <span className="stat-icon peach"><Zap size={18} /></span>
          <span className="stat-label">Profile Completeness</span>
          <strong className="stat-word">{profile ? `${profile.profile_completion_percentage}%` : "—"}</strong>
          <small>{profile?.profile_completion_percentage === 100 ? "Fully completed" : "Add details to improve matching"}</small>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-stone-200 mt-6 mb-6 gap-2">
        <button
          type="button"
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "applications"
              ? "border-teal-700 text-teal-800"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
          onClick={() => setActiveTab("applications")}
        >
          Application Tracker ({applications.length})
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "saved"
              ? "border-teal-700 text-teal-800"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
          onClick={() => setActiveTab("saved")}
        >
          Saved Jobs ({savedJobs.length})
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "profile"
              ? "border-teal-700 text-teal-800"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
          onClick={() => setActiveTab("profile")}
        >
          Candidate Profile &amp; Resume ({profile?.profile_completion_percentage || 0}%)
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === "notifications"
              ? "border-teal-700 text-teal-800"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
          onClick={() => setActiveTab("notifications")}
        >
          Notifications
          {unreadNotifsCount > 0 && (
            <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {unreadNotifsCount}
            </span>
          )}
        </button>
      </div>

      {error && <div className="alert alert-error mb-4">{error}</div>}
      {successMsg && <div className="alert alert-success mb-4">{successMsg}</div>}

      {/* TAB 1: APPLICATION TRACKER */}
      {activeTab === "applications" && (
        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <div>
              <span className="eyebrow eyebrow-light">PERSISTENT APPLICATION PIPELINE</span>
              <h2>Tracked Applications</h2>
              <p>Keep track of your direct and external applications across stages from Interested to Offer.</p>
            </div>
            <button className="button button-secondary button-small" onClick={loadData}>
              Refresh
            </button>
          </div>
          {busy ? (
            <div className="dashboard-empty"><div className="loader" />Loading applications…</div>
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
                      {application.external_application_url && (
                        <span className="badge-partner text-xs">External Posting</span>
                      )}
                    </div>
                    <h3>{application.job_title || `Application #${application.id}`}</h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500 mt-1">
                      {application.resume_filename && (
                        <span className="flex items-center gap-1">
                          <FileText size={13} /> {application.resume_filename}
                        </span>
                      )}
                      <span>
                        Tracked: {new Date(application.applied_at || application.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {application.notes && (
                      <div className="text-xs text-stone-600 bg-stone-50 border border-stone-200 rounded p-1.5 mt-2">
                        <strong>Notes:</strong> {application.notes}
                      </div>
                    )}
                    {application.external_application_url && (
                      <div className="mt-2">
                        <a
                          href={application.external_application_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-link text-xs inline-flex items-center gap-1"
                        >
                          Original Posting Destination <ExternalLink size={12} />
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`status-pill status-${application.status}`}>
                      {statusLabels[application.status] || application.status.replace(/_/g, " ")}
                    </span>
                    {/* Status updater for candidate */}
                    <select
                      className="text-xs border border-stone-300 rounded px-2 py-1 bg-white text-stone-700"
                      value={application.status}
                      onChange={(e) => handleUpdateApplicationStatus(application.id, e.target.value as ApplicationStatus)}
                    >
                      <option value="interested">Interested</option>
                      <option value="ready_to_apply">Ready to Apply</option>
                      <option value="applied">Applied</option>
                      <option value="assessment">Assessment</option>
                      <option value="interview">Interviewing</option>
                      <option value="offer">Offer Received</option>
                      <option value="rejected">Not Selected</option>
                      <option value="withdrawn">Withdrawn</option>
                    </select>
                  </div>
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
              <p>You haven’t tracked any applications yet. Find matching roles and track your journey.</p>
              <Link className="button button-primary" href="/">
                Explore open roles <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: SAVED JOBS */}
      {activeTab === "saved" && (
        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <div>
              <span className="eyebrow eyebrow-light">SAVED OPPORTUNITIES</span>
              <h2>Bookmarked Jobs</h2>
              <p>Review jobs you’ve saved, with live updates on their current hiring and verification status.</p>
            </div>
            <button className="button button-secondary button-small" onClick={loadData}>
              Refresh
            </button>
          </div>
          {busy ? (
            <div className="dashboard-empty"><div className="loader" />Loading saved jobs…</div>
          ) : savedJobs.length ? (
            <div className="grid gap-3">
              {savedJobs.map((saved) => {
                const job = saved.job;
                return (
                  <div key={saved.id} className="p-4 bg-white border border-stone-200 rounded-xl flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-stone-800 text-sm">
                          {job?.company || "Company"}
                        </span>
                        {/* Live Hiring Status Badge */}
                        {job?.hiring_status === "open" ? (
                          <span className="badge-status-open">Open &amp; Hiring</span>
                        ) : job?.hiring_status === "temporarily_unavailable" ? (
                          <span className="badge-status-temp">⚠️ Temp Unavailable</span>
                        ) : job?.hiring_status === "closed" ? (
                          <span className="badge-status-closed">🔴 Closed</span>
                        ) : (
                          <span className="badge-status-unverified">⚪ Unverified</span>
                        )}
                      </div>
                      <h3 className="font-bold text-stone-900 text-base mb-1">
                        {job?.title || `Job #${saved.job_id}`}
                      </h3>
                      <div className="flex items-center gap-3 text-xs text-stone-500">
                        {job?.location && <span><MapPin size={12} className="inline mr-0.5" />{job.location}</span>}
                        <span>Saved on {new Date(saved.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/jobs/${saved.job_id}`} className="button button-secondary button-small">
                        View Role <ArrowUpRight size={14} />
                      </Link>
                      <button
                        type="button"
                        className="button button-quiet button-small text-rose-600 hover:bg-rose-50"
                        onClick={() => handleRemoveSaved(saved.job_id)}
                        title="Remove from saved"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <BriefcaseBusiness size={24} />
              <h3>No saved jobs yet</h3>
              <p>Bookmark jobs you are interested in from the search page to track them here.</p>
              <Link className="button button-primary" href="/">
                Browse jobs <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: CANDIDATE PROFILE & RESUME */}
      {activeTab === "profile" && (
        <section className="dashboard-section">
          {/* Profile Completeness Card */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <strong className="text-base text-stone-900">Profile Completeness: {profile?.profile_completion_percentage || 0}%</strong>
                <p className="text-xs text-stone-500">
                  A complete profile unlocks high-accuracy job recommendations and tailored matches.
                </p>
              </div>
            </div>
            <div className="profile-progress-bar-bg mt-2">
              <div
                className="profile-progress-bar-fill"
                style={{ width: `${profile?.profile_completion_percentage || 0}%` }}
              />
            </div>
          </div>

          {/* Profile Edit Form */}
          <form className="bg-white border border-stone-200 rounded-xl p-6" onSubmit={handleProfileSave}>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-stone-900">Personal &amp; Contact Details</h2>
              <p className="text-xs text-stone-500">Information remains persistent across all your sessions.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <label className="text-xs font-semibold text-stone-700">
                Full Name
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm"
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                  placeholder="e.g. Rahul Sharma"
                />
              </label>
              <label className="text-xs font-semibold text-stone-700">
                Phone Number
                <input
                  type="tel"
                  className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  placeholder="e.g. +91 98765 43210"
                />
              </label>
              <label className="text-xs font-semibold text-stone-700">
                Current Location
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm"
                  value={profileForm.current_location}
                  onChange={(e) => setProfileForm({ ...profileForm, current_location: e.target.value })}
                  placeholder="e.g. Bengaluru, Karnataka"
                />
              </label>
              <label className="text-xs font-semibold text-stone-700">
                Preferred Work Locations
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm"
                  value={profileForm.preferred_locations}
                  onChange={(e) => setProfileForm({ ...profileForm, preferred_locations: e.target.value })}
                  placeholder="e.g. Bengaluru, Hyderabad, Remote"
                />
              </label>
            </div>

            <div className="mb-4 pt-4 border-t border-stone-200">
              <h2 className="text-lg font-bold text-stone-900">Technical Skills &amp; Experience</h2>
              <p className="text-xs text-stone-500">Skills are used to match live job requirements.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <label className="text-xs font-semibold text-stone-700 form-full">
                Technical Skills (Comma-separated)
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm"
                  value={profileForm.technical_skills}
                  onChange={(e) => setProfileForm({ ...profileForm, technical_skills: e.target.value })}
                  placeholder="e.g. Python, SQL, React, FastAPI, AWS, Docker"
                />
              </label>
              <label className="text-xs font-semibold text-stone-700">
                Preferred Job Titles
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm"
                  value={profileForm.preferred_job_titles}
                  onChange={(e) => setProfileForm({ ...profileForm, preferred_job_titles: e.target.value })}
                  placeholder="e.g. Python Developer, Full Stack Engineer"
                />
              </label>
              <label className="text-xs font-semibold text-stone-700">
                Experience Level
                <select
                  className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white"
                  value={profileForm.experience_level}
                  onChange={(e) => setProfileForm({ ...profileForm, experience_level: e.target.value })}
                >
                  <option value="fresher">🌱 Fresher / Entry Level (0-1 yr)</option>
                  <option value="junior">⚡ Junior Developer (1-2 yrs)</option>
                  <option value="mid">🚀 Mid-Level (2+ yrs)</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-stone-700">
                Work Mode Preference
                <select
                  className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white"
                  value={profileForm.work_mode_preferences}
                  onChange={(e) => setProfileForm({ ...profileForm, work_mode_preferences: e.target.value })}
                >
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-site</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-stone-700">
                Employment Type Preference
                <select
                  className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white"
                  value={profileForm.employment_type_preferences}
                  onChange={(e) => setProfileForm({ ...profileForm, employment_type_preferences: e.target.value })}
                >
                  <option value="full_time">Full-time</option>
                  <option value="internship">Internship</option>
                  <option value="contract">Contract</option>
                </select>
              </label>
            </div>

            <div className="mb-4 pt-4 border-t border-stone-200">
              <h2 className="text-lg font-bold text-stone-900">Education, Projects &amp; Certifications</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <label className="text-xs font-semibold text-stone-700 form-full">
                Education
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm"
                  value={profileForm.education}
                  onChange={(e) => setProfileForm({ ...profileForm, education: e.target.value })}
                  placeholder="e.g. B.Tech Computer Science, Anna University (2024)"
                />
              </label>
              <label className="text-xs font-semibold text-stone-700 form-full">
                Key Projects
                <textarea
                  rows={2}
                  className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm"
                  value={profileForm.projects}
                  onChange={(e) => setProfileForm({ ...profileForm, projects: e.target.value })}
                  placeholder="e.g. Job Search Engine with FastAPI, E-Commerce React App"
                />
              </label>
              <label className="text-xs font-semibold text-stone-700 form-full">
                Certifications &amp; Internships
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-sm"
                  value={profileForm.certifications}
                  onChange={(e) => setProfileForm({ ...profileForm, certifications: e.target.value })}
                  placeholder="e.g. AWS Certified Cloud Practitioner, Python Institute PCAP"
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-stone-200">
              <button
                type="submit"
                className="button button-primary"
                disabled={profileLoading}
              >
                {profileLoading ? "Saving Profile…" : "Save Candidate Profile"} <Check size={16} />
              </button>
            </div>
          </form>

          {/* Candidate Default Resume Section */}
          <div className="resume-profile-card mt-6">
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
                      <Check size={13} /> Active &amp; Ready for 1-Click Apply on all job postings
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
          </div>
        </section>
      )}

      {/* TAB 4: NOTIFICATIONS & HIRING UPDATES */}
      {activeTab === "notifications" && (
        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <div>
              <span className="eyebrow eyebrow-light">LIVE HIRING UPDATES</span>
              <h2>Notifications &amp; Changes</h2>
              <p>Stay informed when saved jobs close, reopen, or when verified new openings match your profile.</p>
            </div>
            {notifications.length > 0 && (
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={handleMarkAllNotifsRead}
              >
                Mark all as read
              </button>
            )}
          </div>
          {busy ? (
            <div className="dashboard-empty"><div className="loader" />Loading notifications…</div>
          ) : notifications.length ? (
            <div className="grid gap-3">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`notification-card ${!notif.is_read ? "unread" : ""}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-stone-900 text-sm">{notif.title}</span>
                      <span className="text-[11px] text-stone-400">
                        {new Date(notif.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 mb-2">{notif.message}</p>
                    <div className="flex items-center gap-2">
                      {notif.job_id && (
                        <Link href={`/jobs/${notif.job_id}`} className="text-link text-xs">
                          View Job →
                        </Link>
                      )}
                      {!notif.is_read && (
                        <button
                          type="button"
                          className="text-xs text-stone-400 hover:text-stone-700"
                          onClick={() => handleMarkNotifRead(notif.id)}
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Check size={24} />
              <h3>All caught up</h3>
              <p>No new notifications at this time. We will alert you whenever your saved jobs change status.</p>
            </div>
          )}
        </section>
      )}

      <div className="dashboard-tip mt-8">
        <span>✳</span>
        <p><strong>JobConnect Commitment:</strong> Real openings, direct original posting redirection, and verified hiring status without platform fees.</p>
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
      anchor.download = application.resume_filename || "resume.pdf";
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
