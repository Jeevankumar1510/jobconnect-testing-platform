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
  status: "open" | "closed";
  is_external?: boolean;
  external_url?: string | null;
  company_logo?: string | null;
  source?: string | null;
  experience_level?: string;
  is_fresher?: boolean;
  created_at: string;
  updated_at: string;
};

export type ApplicationStatus =
  | "submitted"
  | "reviewing"
  | "interview"
  | "rejected"
  | "accepted";

export type Application = {
  id: number;
  job_id: number;
  candidate_id: number;
  status: ApplicationStatus;
  cover_letter: string | null;
  resume_filename: string;
  resume_content_type: string;
  created_at: string;
  updated_at: string;
  job_title?: string | null;
  company?: string | null;
  external_url?: string | null;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};
