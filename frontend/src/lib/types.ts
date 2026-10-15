export type Role = "candidate" | "recruiter";

export type User = {
  id: number;
  email: string;
  role: Role;
  created_at: string;
  resume_filename?: string | null;
  has_saved_resume?: boolean;
  headline?: string | null;
};

export type HiringStatus =
  | "open"
  | "closed"
  | "expired"
  | "unverified"
  | "temporarily_unavailable"
  | "removed_from_source";

export type Job = {
  id: number;
  recruiter_id: number;
  title: string;
  company: string;
  location: string;
  description: string;
  employment_type: "full_time" | "part_time" | "contract" | "internship";
  salary_min: string | number | null;
  salary_max: string | number | null;
  status: "open" | "closed" | "expired" | "unverified" | "temporarily_unavailable" | "removed_from_source";
  is_external?: boolean;
  external_url?: string | null;
  company_logo?: string | null;
  source?: string | null;
  experience_level?: string;
  is_fresher?: boolean;
  source_job_url?: string | null;
  employer_job_url?: string | null;
  application_url?: string | null;
  source_listing_url?: string | null;
  source_platform?: string | null;
  employer_website?: string | null;
  canonical_job_url?: string | null;
  last_url_verified_at?: string | null;
  verification_status?: string;
  hiring_status?: HiringStatus;
  verification_reason?: string | null;
  apply_destination_url?: string | null;
  apply_destination_type?: string | null;
  is_destination_verified?: boolean;
  apply_warning?: string | null;
  apply_disabled?: boolean;
  created_at: string;
  updated_at: string;
};

export type ApplicationStatus =
  | "interested"
  | "ready_to_apply"
  | "submitted"
  | "applied"
  | "reviewing"
  | "assessment"
  | "interview"
  | "offer"
  | "rejected"
  | "accepted"
  | "withdrawn";

export type Application = {
  id: number;
  job_id: number;
  candidate_id: number;
  status: ApplicationStatus;
  cover_letter: string | null;
  resume_filename?: string | null;
  resume_content_type?: string | null;
  notes?: string | null;
  external_application_url?: string | null;
  applied_at?: string | null;
  created_at: string;
  updated_at: string;
  job_title?: string | null;
  company?: string | null;
  external_url?: string | null;
};

export type CandidateProfile = {
  id: number;
  user_id: number;
  full_name?: string | null;
  phone?: string | null;
  current_location?: string | null;
  preferred_locations?: string | null;
  preferred_job_titles?: string | null;
  technical_skills?: string | null;
  education?: string | null;
  experience_level?: string | null;
  internship_experience?: string | null;
  projects?: string | null;
  certifications?: string | null;
  preferred_industries?: string | null;
  employment_type_preferences?: string | null;
  work_mode_preferences?: string | null;
  expected_salary_min?: number | null;
  expected_salary_max?: number | null;
  profile_completion_percentage: number;
  updated_at: string;
};

export type SavedJob = {
  id: number;
  user_id: number;
  job_id: number;
  notes?: string | null;
  created_at: string;
  job?: Job;
};

export type JobRecommendation = {
  job: Job;
  match_score: number;
  match_reasons: string[];
  explanation: string;
};

export type Notification = {
  id: number;
  user_id: number;
  job_id?: number | null;
  notification_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

