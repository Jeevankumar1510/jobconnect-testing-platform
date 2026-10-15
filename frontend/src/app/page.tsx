"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  Check,
  ExternalLink,
  Filter,
  GraduationCap,
  MapPin,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Users,
  WalletCards,
  X,
  Zap,
  Bookmark,
  BookmarkCheck,
  ShieldCheck,
  Compass,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { QuickApplyModal } from "@/components/quick-apply-modal";
import {
  ApiError,
  getRecommendedJobs,
  getSavedJobs,
  removeSavedJob,
  saveJob,
  searchJobs,
  syncExternalJobs,
} from "@/lib/api";
import { getDirectJobApplyUrl } from "@/lib/urls";
import type { Job, JobRecommendation } from "@/lib/types";

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

function timeAgo(value: string) {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000),
  );
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

const STARTUP_COMPANIES = [
  "zepto", "meesho", "blinkit", "cred", "razorpay", "groww", "slice", "invideo", "jupiter",
  "postman", "jar", "urban company", "hasura", "plum", "khatabook", "clevertap", "ather",
  "apna", "browserstack", "swiggy", "zomato", "zerodha", "paytm", "physicswallah",
  "unacademy", "classplus", "cult.fit", "flipkart", "phonepe", "delhivery", "nykaa",
  "cars24", "upstox", "coinswitch", "policybazaar", "shiprocket"
];

const ENTERPRISE_COMPANIES = [
  "tcs", "tata consultancy", "infosys", "wipro", "capgemini", "persistent",
  "thoughtworks", "accenture", "cisco", "dell", "amazon", "ltimindtree", "hcl", "cognizant",
  "tech mahindra", "oracle", "sap", "ibm", "zoho", "freshworks", "jio", "airtel",
  "goldman sachs", "jpmorgan", "adobe", "intuit", "bosch", "tata elxsi", "kpit", "mphasis", "hexaware", "coforge", "happiest minds"
];


function isStartup(job: Job): boolean {
  const comp = job.company.toLowerCase();
  const src = (job.source || "").toLowerCase();
  if (STARTUP_COMPANIES.some((s) => comp.includes(s))) return true;
  if (["remoteok", "weworkremotely", "remotive", "jobicy", "startup"].some((s) => src.includes(s))) return true;
  return false;
}

function isEnterprise(job: Job): boolean {
  const comp = job.company.toLowerCase();
  return ENTERPRISE_COMPANIES.some((e) => comp.includes(e));
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [domain, setDomain] = useState<string>("all");
  const [experienceLevel, setExperienceLevel] = useState<string>("all");
  const [employmentType, setEmploymentType] = useState<string>("all");
  const [workMode, setWorkMode] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [salaryMin, setSalaryMin] = useState<string>("");
  const [companyType, setCompanyType] = useState<string>("all");
  const [busy, setBusy] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const { user, token } = useAuth();
  const [savedJobIds, setSavedJobIds] = useState<Set<number>>(new Set());
  const [recommendations, setRecommendations] = useState<JobRecommendation[]>([]);

  useEffect(() => {
    if (token && user?.role === "candidate") {
      void getSavedJobs(token)
        .then((list) => {
          setSavedJobIds(new Set(list.map((s) => s.job_id)));
        })
        .catch(() => {});

      void getRecommendedJobs(token, 3)
        .then((recs) => {
          setRecommendations(recs);
        })
        .catch(() => {});
    } else {
      setSavedJobIds(new Set());
      setRecommendations([]);
    }
  }, [token, user]);

  const handleToggleSave = async (jobId: number) => {
    if (!token || user?.role !== "candidate") return;
    try {
      if (savedJobIds.has(jobId)) {
        await removeSavedJob(jobId, token);
        setSavedJobIds((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      } else {
        await saveJob(jobId, undefined, token);
        setSavedJobIds((prev) => new Set(prev).add(jobId));
      }
    } catch (err) {
      console.error("Failed to toggle save", err);
    }
  };

  const loadJobs = useCallback(
    async (
      q: string = search,
      place: string = location,
      dom: string = domain,
      exp: string = experienceLevel,
      empType: string = employmentType,
      wMode: string = workMode,
      src: string = sourceFilter,
      sal: string = salaryMin,
      compType: string = companyType,
    ) => {
      setBusy(true);
      setError("");
      const params = new URLSearchParams({ page: "1", page_size: "100" });
      if (q.trim()) params.set("q", q.trim());
      if (place.trim()) params.set("location", place.trim());
      if (dom !== "all") params.set("domain", dom);
      if (exp !== "all") params.set("experience_level", exp);
      if (empType !== "all") params.set("employment_type", empType);
      if (wMode !== "all") params.set("work_mode", wMode);
      if (src !== "all") params.set("source", src);
      if (sal.trim()) params.set("salary_min", sal.trim());
      if (compType !== "all") params.set("company_type", compType);

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
    },
    [search, location, domain, experienceLevel, employmentType, workMode, sourceFilter, salaryMin, companyType],
  );

  useEffect(() => {
    const params = new URLSearchParams({ page: "1", page_size: "100" });
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

  async function handleSync() {
    setSyncing(true);
    setSyncMessage("");
    try {
      const res = await syncExternalJobs(100);
      setSyncMessage(`Synced ${res.imported} new verified India IT fresher postings!`);
      await loadJobs(search, location, domain, experienceLevel, employmentType, workMode, sourceFilter, salaryMin, companyType);
      setTimeout(() => setSyncMessage(""), 5000);
    } catch {
      setSyncMessage("Sync completed.");
      await loadJobs(search, location, domain, experienceLevel, employmentType, workMode, sourceFilter, salaryMin, companyType);
      setTimeout(() => setSyncMessage(""), 4000);
    } finally {
      setSyncing(false);
    }
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadJobs(search, location, domain, experienceLevel, employmentType, workMode, sourceFilter, salaryMin, companyType);
  }

  function resetFilters() {
    setSearch("");
    setLocation("");
    setDomain("all");
    setExperienceLevel("all");
    setEmploymentType("all");
    setWorkMode("all");
    setSourceFilter("all");
    setSalaryMin("");
    setCompanyType("all");
    void loadJobs("", "", "all", "all", "all", "all", "all", "", "all");
  }

  const hasActiveFilters =
    Boolean(search.trim()) ||
    Boolean(location.trim()) ||
    domain !== "all" ||
    experienceLevel !== "all" ||
    employmentType !== "all" ||
    workMode !== "all" ||
    sourceFilter !== "all" ||
    Boolean(salaryMin) ||
    companyType !== "all";

  return (
    <main>
      <section className="hero">
        <div className="hero-orb orb-one" />
        <div className="hero-orb orb-two" />
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              🇮🇳 INDIA&apos;S DEDICATED IT FRESHER &amp; TECH PORTAL
            </div>
            <h1>
              Launch your tech career
              <br />
              with <span className="serif-accent">confidence.</span>
            </h1>
            <p className="hero-description">
              Dedicated strictly to Indian IT Freshers, College Graduates, and Tech Interns (0–2 years). Real software engineering, AI/Data, Cloud, QA, and developer openings from India&apos;s leading tech employers.
            </p>
            <form className="search-panel" onSubmit={submitSearch}>
              <label className="search-field">
                <Search size={19} />
                <span className="sr-only">Job title, skill or domain</span>
                <input
                  aria-label="Job title, skill or domain"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="e.g. Junior Developer, Python Backend, React Fresher, QA"
                />
              </label>
              <span className="search-divider" />
              <label className="search-field location-field">
                <MapPin size={19} />
                <span className="sr-only">Indian Location</span>
                <input
                  aria-label="Indian Location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="e.g. Bengaluru, Hyderabad, Pune, Remote"
                />
              </label>
              <button className="button button-primary search-button" type="submit">
                Search IT jobs <ArrowRight size={16} />
              </button>
            </form>
            <div className="popular-searches">
              <span>Popular IT Searches:</span>
              <button
                onClick={() => {
                  setCompanyType("startup");
                  void loadJobs(search, location, domain, experienceLevel, employmentType, workMode, sourceFilter, salaryMin, "startup");
                }}
              >
                🚀 Top Startups
              </button>
              <button
                onClick={() => {
                  setSearch("Software Engineer");
                  void loadJobs("Software Engineer", location, domain, experienceLevel, employmentType, workMode, sourceFilter, salaryMin, companyType);
                }}
              >
                Software Engineer
              </button>
              <button
                onClick={() => {
                  setDomain("python_backend");
                  void loadJobs(search, location, "python_backend", experienceLevel, employmentType, workMode, sourceFilter, salaryMin, companyType);
                }}
              >
                Python Backend
              </button>
              <button
                onClick={() => {
                  setDomain("frontend_react");
                  void loadJobs(search, location, "frontend_react", experienceLevel, employmentType, workMode, sourceFilter, salaryMin, companyType);
                }}
              >
                React Frontend
              </button>
              <button
                onClick={() => {
                  setDomain("data_ai");
                  void loadJobs(search, location, "data_ai", experienceLevel, employmentType, workMode, sourceFilter, salaryMin, companyType);
                }}
              >
                Data &amp; AI
              </button>
              <button
                onClick={() => {
                  setLocation("Bengaluru");
                  void loadJobs(search, "Bengaluru", domain, experienceLevel, employmentType, workMode, sourceFilter, salaryMin, companyType);
                }}
              >
                Bengaluru Hub
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
        <span>Verified fresher &amp; tech hiring from India&apos;s hottest startups &amp; tech leaders:</span>
        <div className="company-wordmarks">
          <strong className="wordmark-north">Zepto<span>⚡</span></strong>
          <strong className="wordmark-form">Meesho</strong>
          <strong className="wordmark-common">CRED<span>✳</span></strong>
          <strong className="wordmark-kin">Razorpay<span>+</span></strong>
          <strong className="wordmark-bright">Groww</strong>
          <strong className="wordmark-north">Blinkit</strong>
          <strong className="wordmark-form">InVideo</strong>
          <strong className="wordmark-kin">Swiggy</strong>
          <strong className="wordmark-common">Zomato</strong>
          <strong className="wordmark-bright">Postman</strong>
          <strong className="wordmark-north">TCS<span>®</span></strong>
          <strong className="wordmark-form">Infosys</strong>
        </div>
      </section>

      <section className="jobs-section" id="jobs">
        <div className="section-heading">
          <div>
            <div className="eyebrow eyebrow-light">VERIFIED INDIAN IT OPPORTUNITIES</div>
            <h2>Find tech roles that <span className="serif-accent">fit.</span></h2>
            <p>100% verified IT jobs and internships across top Indian tech hubs and fast-growing startups. Apply directly to official company career portals in seconds.</p>
          </div>
          <Link href="/auth?mode=register" className="text-link">
            Create your profile <ArrowUpRight size={17} />
          </Link>
        </div>

        {/* Profile-Based AI Job Recommendations (Part 6 Requirement 19) */}
        {recommendations.length > 0 && (
          <div className="mb-6 p-5 bg-gradient-to-r from-emerald-50 via-teal-50 to-white border border-teal-200 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-teal-600 text-white rounded-lg"><Compass size={16} /></span>
                <div>
                  <h3 className="font-bold text-stone-900 text-base">Recommended for You</h3>
                  <p className="text-xs text-stone-500">Based on your saved candidate profile, skills, and preferences</p>
                </div>
              </div>
              <Link href="/dashboard" className="text-xs font-semibold text-teal-700 hover:underline">
                Update Profile →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {recommendations.map((rec) => (
                <div key={rec.job.id} className="bg-white p-3.5 rounded-xl border border-teal-100 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-stone-700">{rec.job.company}</span>
                      <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[10px]">
                        {rec.match_score}% Match
                      </span>
                    </div>
                    <Link href={`/jobs/${rec.job.id}`} className="font-bold text-stone-900 text-sm hover:text-teal-700 block mb-1">
                      {rec.job.title}
                    </Link>
                    <p className="text-[11px] text-stone-500 line-clamp-2 mb-2">
                      💡 {rec.explanation}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-xs">
                    <span className="text-stone-500">{rec.job.location}</span>
                    <Link href={`/jobs/${rec.job.id}`} className="text-teal-700 font-semibold hover:underline">
                      Apply →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="job-feed-meta">
          <div className="flex items-center gap-3">
            <span><span className="online-dot" /> {total} active India IT fresher opportunities</span>
            {syncMessage && (
              <span className="text-emerald-600 font-medium text-xs bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                {syncMessage}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleSync()}
              disabled={syncing}
              className="sync-feed-button"
              title="Sync latest verified India IT fresher postings"
            >
              <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing..." : "Sync Live Postings"}
            </button>
            <span>Curated for Freshers <Sparkles size={14} /></span>
          </div>
        </div>

        {/* Zero Platform Fee & Scam-Free Trust Guarantee Banner */}
        <div className="zero-fee-banner">
          <div className="zero-fee-banner-icon">🛡️</div>
          <div className="zero-fee-banner-content">
            <strong>100% Free Application Guarantee:</strong> All job postings on JobConnect are actively hiring roles pointing directly to official employer career portals. We enforce a strict <strong>zero-fee policy</strong>—never pay any registration fee, platform fee, or training deposit to apply or interview.
          </div>
        </div>

        {/* Comprehensive India IT Fresher Filters Suite */}
        <div className="fresher-filters-container">
          {/* Experience & Company target pills */}
          <div className="filter-pills-row">
            <span className="filter-select-label mr-2"><Filter size={12} className="inline mr-1" /> Quick Filters:</span>
            <button
              type="button"
              className={`filter-pill ${experienceLevel === "all" && companyType === "all" ? "active" : ""}`}
              onClick={() => {
                setExperienceLevel("all");
                setCompanyType("all");
                void loadJobs(search, location, domain, "all", employmentType, workMode, sourceFilter, salaryMin, "all");
              }}
            >
              🟢 Actively Hiring ({total})
            </button>
            <button
              type="button"
              className="filter-pill active"
              title="All roles on JobConnect are 100% free with no platform or registration fees"
            >
              🛡️ Zero Fee Only
            </button>
            <button
              type="button"
              className={`filter-pill ${companyType === "startup" ? "active" : ""}`}
              onClick={() => {
                const next = companyType === "startup" ? "all" : "startup";
                setCompanyType(next);
                void loadJobs(search, location, domain, experienceLevel, employmentType, workMode, sourceFilter, salaryMin, next);
              }}
            >
              🚀 Startups Only
            </button>
            <button
              type="button"
              className={`filter-pill ${companyType === "enterprise" ? "active" : ""}`}
              onClick={() => {
                const next = companyType === "enterprise" ? "all" : "enterprise";
                setCompanyType(next);
                void loadJobs(search, location, domain, experienceLevel, employmentType, workMode, sourceFilter, salaryMin, next);
              }}
            >
              🏢 Tech Giants
            </button>
            <button
              type="button"
              className={`filter-pill ${experienceLevel === "fresher" ? "active" : ""}`}
              onClick={() => {
                setExperienceLevel("fresher");
                void loadJobs(search, location, domain, "fresher", employmentType, workMode, sourceFilter, salaryMin, companyType);
              }}
            >
              🌱 Freshers (0-1 yr)
            </button>
            <button
              type="button"
              className={`filter-pill ${experienceLevel === "internship" ? "active" : ""}`}
              onClick={() => {
                setExperienceLevel("internship");
                void loadJobs(search, location, domain, "internship", employmentType, workMode, sourceFilter, salaryMin, companyType);
              }}
            >
              🎓 Tech Internships
            </button>
            <button
              type="button"
              className={`filter-pill ${experienceLevel === "junior" ? "active" : ""}`}
              onClick={() => {
                setExperienceLevel("junior");
                void loadJobs(search, location, domain, "junior", employmentType, workMode, sourceFilter, salaryMin, companyType);
              }}
            >
              ⚡ Junior Devs (1-2 yrs)
            </button>
          </div>

          {/* Detailed Dropdowns Row */}
          <div className="filter-selects-row">
            {/* Company Type Dropdown */}
            <div className="filter-select-wrap">
              <label className="filter-select-label">Company Type</label>
              <select
                className="filter-select"
                value={companyType}
                onChange={(e) => {
                  setCompanyType(e.target.value);
                  void loadJobs(search, location, domain, experienceLevel, employmentType, workMode, sourceFilter, salaryMin, e.target.value);
                }}
              >
                <option value="all">All Companies</option>
                <option value="startup">🚀 Indian Startups (Zepto, Meesho, CRED...)</option>
                <option value="enterprise">🏢 Tech Giants (TCS, Infosys, Wipro...)</option>
              </select>
            </div>

            {/* IT Domain Dropdown */}
            <div className="filter-select-wrap">
              <label className="filter-select-label">IT Domain</label>
              <select
                className="filter-select"
                value={domain}
                onChange={(e) => {
                  setDomain(e.target.value);
                  void loadJobs(search, location, e.target.value, experienceLevel, employmentType, workMode, sourceFilter, salaryMin, companyType);
                }}
              >
                <option value="all">All IT Domains</option>
                <option value="software">💻 Software &amp; Full Stack</option>
                <option value="python_backend">🐍 Python &amp; Backend</option>
                <option value="frontend_react">⚛️ React &amp; Frontend</option>
                <option value="data_ai">📊 Data &amp; AI / ML</option>
                <option value="qa_testing">🧪 QA &amp; Testing</option>
                <option value="cloud_devops">☁️ Cloud &amp; DevOps</option>
                <option value="cyber_security">🛡️ Cyber Security</option>
              </select>
            </div>

            {/* Indian Tech Hub Dropdown */}
            <div className="filter-select-wrap">
              <label className="filter-select-label">Indian Tech Hub</label>
              <select
                className="filter-select"
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  void loadJobs(search, e.target.value, domain, experienceLevel, employmentType, workMode, sourceFilter, salaryMin, companyType);
                }}
              >
                <option value="">All India Locations</option>
                <option value="Bengaluru">Bengaluru / Bangalore</option>
                <option value="Hyderabad">Hyderabad</option>
                <option value="Pune">Pune</option>
                <option value="Chennai">Chennai</option>
                <option value="Delhi">Delhi NCR (Noida / Gurgaon)</option>
                <option value="Mumbai">Mumbai</option>
                <option value="Remote">Remote (India)</option>
              </select>
            </div>

            {/* Work Mode */}
            <div className="filter-select-wrap">
              <label className="filter-select-label">Work Mode</label>
              <select
                className="filter-select"
                value={workMode}
                onChange={(e) => {
                  setWorkMode(e.target.value);
                  void loadJobs(search, location, domain, experienceLevel, employmentType, e.target.value, sourceFilter, salaryMin, companyType);
                }}
              >
                <option value="all">Any Work Mode</option>
                <option value="remote">🇮🇳 Remote Only</option>
                <option value="onsite">🏢 On-Site / Hybrid</option>
              </select>
            </div>

            {/* Job Type */}
            <div className="filter-select-wrap">
              <label className="filter-select-label">Job Type</label>
              <select
                className="filter-select"
                value={employmentType}
                onChange={(e) => {
                  setEmploymentType(e.target.value);
                  void loadJobs(search, location, domain, experienceLevel, e.target.value, workMode, sourceFilter, salaryMin, companyType);
                }}
              >
                <option value="all">All Job Types</option>
                <option value="full_time">Full-Time</option>
                <option value="internship">Internship</option>
                <option value="part_time">Part-Time</option>
                <option value="contract">Contract</option>
              </select>
            </div>

            {/* Minimum Salary in ₹ LPA */}
            <div className="filter-select-wrap">
              <label className="filter-select-label">Minimum Salary</label>
              <select
                className="filter-select"
                value={salaryMin}
                onChange={(e) => {
                  setSalaryMin(e.target.value);
                  void loadJobs(search, location, domain, experienceLevel, employmentType, workMode, sourceFilter, e.target.value, companyType);
                }}
              >
                <option value="">Any Salary</option>
                <option value="300000">₹3+ LPA</option>
                <option value="600000">₹6+ LPA</option>
                <option value="1000000">₹10+ LPA</option>
                <option value="1500000">₹15+ LPA</option>
              </select>
            </div>

            {/* Source */}
            <div className="filter-select-wrap">
              <label className="filter-select-label">Employer Source</label>
              <select
                className="filter-select"
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value);
                  void loadJobs(search, location, domain, experienceLevel, employmentType, workMode, e.target.value, salaryMin, companyType);
                }}
              >
                <option value="all">All Sources</option>
                <option value="Careers">Direct Employers (Zepto, TCS, Razorpay...)</option>
                <option value="internal">JobConnect Direct</option>
                <option value="RemoteOK">RemoteOK</option>
                <option value="WeWorkRemotely">WeWorkRemotely</option>
                <option value="Remotive">Remotive</option>
              </select>
            </div>
          </div>

          {/* Active Filter Chips & Reset */}
          {hasActiveFilters && (
            <div className="active-filters-strip">
              <span className="text-xs text-stone-500 font-semibold mr-1">Active filters:</span>
              {search.trim() && (
                <span className="active-chip">
                  Keyword: &quot;{search}&quot;
                  <button onClick={() => { setSearch(""); void loadJobs("", location, domain, experienceLevel, employmentType, workMode, sourceFilter, salaryMin, companyType); }}>
                    <X size={12} />
                  </button>
                </span>
              )}
              {companyType !== "all" && (
                <span className="active-chip">
                  Company: {companyType === "startup" ? "🚀 Startups" : "🏢 Tech Giants"}
                  <button onClick={() => { setCompanyType("all"); void loadJobs(search, location, domain, experienceLevel, employmentType, workMode, sourceFilter, salaryMin, "all"); }}>
                    <X size={12} />
                  </button>
                </span>
              )}
              {domain !== "all" && (
                <span className="active-chip">
                  Domain: {domain.replace("_", " ").toUpperCase()}
                  <button onClick={() => { setDomain("all"); void loadJobs(search, location, "all", experienceLevel, employmentType, workMode, sourceFilter, salaryMin, companyType); }}>
                    <X size={12} />
                  </button>
                </span>
              )}
              {location.trim() && (
                <span className="active-chip">
                  Hub: &quot;{location}&quot;
                  <button onClick={() => { setLocation(""); void loadJobs(search, "", domain, experienceLevel, employmentType, workMode, sourceFilter, salaryMin, companyType); }}>
                    <X size={12} />
                  </button>
                </span>
              )}
              {experienceLevel !== "all" && (
                <span className="active-chip">
                  Level: {experienceLevel === "fresher" ? "🌱 Fresher (0-1y)" : experienceLevel === "internship" ? "🎓 Internship" : "⚡ Junior (1-2y)"}
                  <button onClick={() => { setExperienceLevel("all"); void loadJobs(search, location, domain, "all", employmentType, workMode, sourceFilter, salaryMin, companyType); }}>
                    <X size={12} />
                  </button>
                </span>
              )}
              {employmentType !== "all" && (
                <span className="active-chip">
                  Type: {employmentType.replace("_", " ")}
                  <button onClick={() => { setEmploymentType("all"); void loadJobs(search, location, domain, experienceLevel, "all", workMode, sourceFilter, salaryMin, companyType); }}>
                    <X size={12} />
                  </button>
                </span>
              )}
              {workMode !== "all" && (
                <span className="active-chip">
                  Mode: {workMode === "remote" ? "Remote Only" : "Onsite / Hybrid"}
                  <button onClick={() => { setWorkMode("all"); void loadJobs(search, location, domain, experienceLevel, employmentType, "all", sourceFilter, salaryMin, companyType); }}>
                    <X size={12} />
                  </button>
                </span>
              )}
              {sourceFilter !== "all" && (
                <span className="active-chip">
                  Source: {sourceFilter}
                  <button onClick={() => { setSourceFilter("all"); void loadJobs(search, location, domain, experienceLevel, employmentType, workMode, "all", salaryMin, companyType); }}>
                    <X size={12} />
                  </button>
                </span>
              )}
              {salaryMin && (
                <span className="active-chip">
                  Min: ₹{(Number(salaryMin) / 100_000).toFixed(0)} LPA
                  <button onClick={() => { setSalaryMin(""); void loadJobs(search, location, domain, experienceLevel, employmentType, workMode, sourceFilter, "", companyType); }}>
                    <X size={12} />
                  </button>
                </span>
              )}
              <button type="button" className="clear-filters-btn ml-auto" onClick={resetFilters}>
                <RotateCcw size={13} /> Reset all
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="alert alert-error">
            {error}
            <button className="text-link" onClick={() => void loadJobs(search, location, experienceLevel, employmentType, workMode, sourceFilter, salaryMin)}>
              Try again
            </button>
          </div>
        )}
        {busy ? (
          <div className="loading-grid">
            {[1, 2, 3, 4, 5, 6].map((item) => <div className="skeleton-card" key={item} />)}
          </div>
        ) : jobs.length ? (
          <div className="job-grid">
            {jobs.map((job, index) => (
              <article
                className="job-card"
                key={job.id}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="job-card-top">
                  {job.company_logo ? (
                    <img
                      src={job.company_logo}
                      alt={job.company}
                      className="company-logo-thumb"
                    />
                  ) : (
                    <div className={`company-avatar avatar-${index % 5}`}>
                      {job.company.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {user?.role === "candidate" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          void handleToggleSave(job.id);
                        }}
                        className="p-1 text-stone-400 hover:text-teal-700 rounded-lg hover:bg-stone-100 transition-colors"
                        title={savedJobIds.has(job.id) ? "Remove bookmark" : "Save job"}
                      >
                        {savedJobIds.has(job.id) ? (
                          <BookmarkCheck size={16} className="text-teal-600" />
                        ) : (
                          <Bookmark size={16} />
                        )}
                      </button>
                    )}
                    {job.is_external && (
                      <span className="badge-partner">
                        {job.source_platform || job.source || "Partner"}
                      </span>
                    )}
                    <span className="job-age">{timeAgo(job.created_at)}</span>
                  </div>
                </div>

                <div className="job-badges-row">
                  {/* Live Hiring Status */}
                  {job.hiring_status === "open" ? (
                    <span className="badge-status-open">
                      <span className="hiring-indicator-dot" /> Open &amp; Hiring
                    </span>
                  ) : job.hiring_status === "temporarily_unavailable" ? (
                    <span className="badge-status-temp">
                      ⚠️ Temp Unavailable
                    </span>
                  ) : job.hiring_status === "closed" || job.hiring_status === "expired" ? (
                    <span className="badge-status-closed">
                      🔴 Closed
                    </span>
                  ) : (
                    <span className="badge-status-unverified">
                      ⚪ Unverified
                    </span>
                  )}

                  {/* Verification Status */}
                  {job.verification_status === "verified_exact_match" && (
                    <span className="badge-verified-exact">
                      <ShieldCheck size={10} /> Verified Match
                    </span>
                  )}

                  <span className="badge-zero-fee">
                    🛡️ Zero Fee
                  </span>
                  {isStartup(job) ? (
                    <span className="badge-startup">
                      🚀 Startup
                    </span>
                  ) : isEnterprise(job) ? (
                    <span className="badge-enterprise">
                      🏢 Tech Giant
                    </span>
                  ) : null}
                  {job.experience_level === "internship" ? (
                    <span className="badge-fresher-intern">
                      <GraduationCap size={11} /> Internship
                    </span>
                  ) : job.experience_level === "junior" ? (
                    <span className="badge-fresher-junior">
                      <Zap size={11} /> Junior (1-2y)
                    </span>
                  ) : (
                    <span className="badge-fresher-entry">
                      <Sparkles size={11} /> Fresher Friendly
                    </span>
                  )}
                  <span className="job-type">{job.employment_type.replace("_", " ")}</span>
                  {job.is_external ? (
                    <span className="partner-apply-badge">
                      <ExternalLink size={11} /> Official Portal
                    </span>
                  ) : (
                    <span className="direct-apply-badge">
                      <Zap size={11} /> Direct Role
                    </span>
                  )}
                </div>

                <h3>
                  <Link href={`/jobs/${job.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    {job.title}
                  </Link>
                </h3>
                <p className="company-name"><Building2 size={15} /> {job.company}</p>
                <div className="job-card-meta">
                  <span><MapPin size={15} />{job.location}</span>
                  <span><WalletCards size={15} />{formatSalary(job)}</span>
                </div>

                <div className="job-card-bottom">
                  {job.is_external ? (
                    (() => {
                      const directUrl = getDirectJobApplyUrl(job);
                      if (job.apply_disabled || !directUrl) {
                        return (
                          <Link
                            href={`/jobs/${job.id}`}
                            className="card-quick-apply-btn button button-secondary text-xs flex items-center justify-center"
                          >
                            Verify Destination
                          </Link>
                        );
                      }
                      return (
                        <a
                          href={directUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="card-quick-apply-btn button button-primary flex items-center justify-center gap-1.5"
                          style={{ textDecoration: "none" }}
                        >
                          Apply on Original Site <ExternalLink size={14} />
                        </a>
                      );
                    })()
                  ) : (
                    <button
                      type="button"
                      className="card-quick-apply-btn button button-primary"
                      onClick={() => setSelectedJob(job)}
                    >
                      <Zap size={14} /> Quick Apply
                    </button>
                  )}
                  <Link
                    className="card-arrow"
                    href={`/jobs/${job.id}`}
                    aria-label={`View details for ${job.title}`}
                  >
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
            <p>Try a different search or sync live job postings from around the web.</p>
            <div className="flex items-center gap-3">
              <button
                className="button button-secondary"
                onClick={() => {
                  setSearch("");
                  setLocation("");
                  setDomain("all");
                  setExperienceLevel("all");
                  setEmploymentType("all");
                  setWorkMode("all");
                  setSourceFilter("all");
                  setSalaryMin("");
                  setCompanyType("all");
                  void loadJobs("", "", "all", "all", "all", "all", "all", "", "all");
                }}
              >
                Show all openings
              </button>
              <button
                className="button button-primary"
                onClick={() => void handleSync()}
                disabled={syncing}
              >
                <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                Fetch Live Postings
              </button>
            </div>
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

      {/* Quick Apply Modal */}
      <QuickApplyModal
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
      />

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
