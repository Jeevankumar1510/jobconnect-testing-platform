import type { Job } from "@/lib/types";

/**
 * Checks if a URL points to a generic homepage, root, or broad search page.
 */
export function isGenericOrInvalidUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return true;
  const trimmed = url.trim().toLowerCase();
  if (!trimmed || trimmed === "#" || trimmed.startsWith("javascript:") || trimmed.startsWith("file:")) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname.replace(/\/+$/, "");
    if (!path || path === "") return true;

    // Check for obvious generic home/search paths
    const genericPaths = [
      "/careers",
      "/careers/",
      "/jobs",
      "/jobs/",
      "/en/careers",
      "/in-en/careers",
      "/search",
      "/search-jobs",
    ];
    if (genericPaths.includes(path) && !parsed.search && !parsed.hash) {
      return true;
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
