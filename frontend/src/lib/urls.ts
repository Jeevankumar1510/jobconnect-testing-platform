import type { Job } from "@/lib/types";

const ATS_AND_CAREER_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "smartrecruiters.com",
  "workday.com",
  "myworkdayjobs.com",
  "freshteam.com",
];

export function isGenericOrInvalidUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return true;
  const trimmed = url.trim().toLowerCase();
  if (!trimmed || trimmed === "#" || trimmed.startsWith("javascript:") || trimmed.startsWith("file:")) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname;
    const path = parsed.pathname.replace(/\/+$/, "");

    // If hosted on an official ATS, it's a valid vacancy board/posting
    if (ATS_AND_CAREER_DOMAINS.some((ats) => host === ats || host.endsWith("." + ats))) {
      return false;
    }

    // If on a dedicated careers subdomain (e.g. careers.techmahindra.com, career.infosys.com, jobs.cisco.com)
    if (host.startsWith("careers.") || host.startsWith("career.") || host.startsWith("jobs.") || host.startsWith("job-openings.")) {
      return false;
    }

    // Bare corporate homepage without career path or hash
    if ((!path || path === "") && !parsed.hash) {
      return true;
    }

    // Check for obvious generic home/search paths on general aggregator websites
    const genericAggregatorDomains = ["indeed.", "glassdoor.", "naukri.", "monster.", "foundit.", "google."];
    if (genericAggregatorDomains.some((d) => host.includes(d))) {
      if (!path || path === "" || path === "/jobs" || path.startsWith("/search")) {
        return true;
      }
    }

    return false;
  } catch {
    return true;
  }
}

/**
 * Returns the exact verified application destination URL for a job.
 * Strictly adheres to project specification:
 * 1. Verified application page for the exact vacancy
 * 2. Verified official employer job posting for the exact vacancy
 * 3. Exact job detail page on the original job source
 * 
 * NEVER returns:
 * - A generic employer homepage
 * - A job portal homepage
 * - A guessed search URL
 * 
 * Returns null if no verified destination exists or apply is disabled.
 */
export function getDirectJobApplyUrl(job: Partial<Job>): string | null {
  if (job.apply_disabled) {
    return null;
  }

  // If backend already resolved the validated destination
  if (job.apply_destination_url && !isGenericOrInvalidUrl(job.apply_destination_url)) {
    return job.apply_destination_url;
  }

  // Fallback checks in priority order
  const candidates = [
    job.application_url,
    job.employer_job_url,
    job.source_job_url,
    job.canonical_job_url,
    job.external_url,
  ];

  for (const candidate of candidates) {
    if (candidate && !isGenericOrInvalidUrl(candidate)) {
      return candidate.trim();
    }
  }

  return null;
}
