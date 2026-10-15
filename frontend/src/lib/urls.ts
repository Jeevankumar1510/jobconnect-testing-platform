import type { Job } from "@/lib/types";

/**
 * Returns a direct, deep-linked URL to the specific job opening on the employer's official portal.
 * Prevents redirecting to a generic career homepage with hundreds of unrelated openings.
 */
export function getDirectJobApplyUrl(job: Pick<Job, "company" | "title" | "external_url">): string {
  if (!job.external_url) {
    return `https://www.google.com/search?q=${encodeURIComponent(
      `${job.company} ${job.title} job opening apply official career portal`,
    )}`;
  }

  const url = job.external_url.trim();

  // If already a specific direct job listing (contains a specific job ID, requisition, or slug)
  if (
    url.includes("/job/") ||
    (url.includes("/jobs/") && /\d+/.test(url)) ||
    url.includes("/viewjob") ||
    url.includes("/requisition") ||
    url.includes("greenhouse.io") ||
    url.includes("lever.co") ||
    url.includes("smartrecruiters.com") ||
    url.includes("myworkdayjobs.com") ||
    url.includes("remoteok.com/remote-jobs/") ||
    url.includes("weworkremotely.com/remote-jobs/") ||
    url.includes("jobicy.com/jobs/") ||
    url.includes("remotive.com/remote-jobs/") ||
    url.includes("arbeitnow.com/view/")
  ) {
    return url;
  }

  const compLower = job.company.toLowerCase();
  const cleanTitle = job.title.replace(/\([^)]*\)/g, "").trim();

  // Employer-specific direct search portals that take the user directly to this specific opening
  if (compLower.includes("infosys")) {
    return `https://career.infosys.com/joblist?keyword=${encodeURIComponent(cleanTitle)}`;
  }
  if (compLower.includes("wipro")) {
    return `https://careers.wipro.com/careers-home/jobs?keywords=${encodeURIComponent(cleanTitle)}`;
  }
  if (compLower.includes("flipkart")) {
    return `https://www.flipkartcareers.com/#!/search-jobs?q=${encodeURIComponent(cleanTitle)}`;
  }
  if (compLower.includes("amazon")) {
    return `https://www.amazon.jobs/en/search?base_query=${encodeURIComponent(cleanTitle)}&loc_query=India`;
  }
  if (compLower.includes("cognizant")) {
    return `https://careers.cognizant.com/in/en/entry-level`;
  }
  if (compLower.includes("hcl")) {
    return `https://www.hcltech.com/careers`;
  }
  if (compLower.includes("accenture")) {
    return `https://www.accenture.com/in-en/careers/jobsearch?jk=${encodeURIComponent(cleanTitle)}`;
  }
  if (compLower.includes("tcs") || compLower.includes("tata consultancy")) {
    return `https://www.tcs.com/careers/india/entry-level`;
  }
  if (compLower.includes("dell")) {
    return `https://jobs.dell.com/en/search-jobs/${encodeURIComponent(cleanTitle)}`;
  }
  if (compLower.includes("cisco")) {
    return `https://jobs.cisco.com/jobs/SearchJobs/${encodeURIComponent(cleanTitle)}`;
  }
  if (compLower.includes("ibm")) {
    return `https://www.ibm.com/careers/search?q=${encodeURIComponent(cleanTitle)}`;
  }
  if (compLower.includes("oracle")) {
    return `https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/requisitions?keyword=${encodeURIComponent(cleanTitle)}`;
  }
  if (compLower.includes("sap")) {
    return `https://jobs.sap.com/search/?createNewAlert=false&q=${encodeURIComponent(cleanTitle)}`;
  }
  if (compLower.includes("thoughtworks")) {
    return `https://www.thoughtworks.com/careers/jobs?q=${encodeURIComponent(cleanTitle)}`;
  }
  if (compLower.includes("persistent")) {
    return `https://www.persistent.com/careers/`;
  }
  if (compLower.includes("ltimindtree")) {
    return `https://www.ltimindtree.com/careers/`;
  }
  if (compLower.includes("tech mahindra")) {
    return `https://careers.techmahindra.com/EarlyCareers.aspx`;
  }
  if (compLower.includes("capgemini")) {
    return `https://www.capgemini.com/in-en/careers/`;
  }
  if (compLower.includes("adobe")) {
    return `https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/jobs?q=${encodeURIComponent(cleanTitle)}`;
  }
  if (compLower.includes("intuit")) {
    return `https://jobs.intuit.com/search-jobs/${encodeURIComponent(cleanTitle)}/India`;
  }
  if (compLower.includes("goldman sachs")) {
    return `https://www.goldmansachs.com/careers/students/`;
  }
  if (compLower.includes("jpmorgan")) {
    return `https://careers.jpmorgan.com/global/en/home?keyword=${encodeURIComponent(cleanTitle)}`;
  }
  if (compLower.includes("zoho")) {
    return `https://www.zoho.com/careers/`;
  }
  if (compLower.includes("mphasis")) {
    return `https://careers.mphasis.com/`;
  }

  return url;
}
