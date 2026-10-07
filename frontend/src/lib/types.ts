export type Role = "candidate" | "recruiter";

export type User = {
  id: number;
  email: string;
  role: Role;
  created_at: string;
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
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};
