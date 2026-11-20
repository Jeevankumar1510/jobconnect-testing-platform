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

export type ScoreBreakdownItem = {
  score: number;
  max: number;
  weight_pct?: number;
  percentage: number;
  label: string;
  status: string;
  feedback?: string;
};

export type BulletImprovement = {
  original_sentence: string;
  problem: string;
  improved_version: string;
  explanation: string;
  strengthening_context: string;
};

export type PrioritySuggestion = {
  priority: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  details: string;
  example?: string | null;
};

export type DetectedIssue = {
  category: string;
  issue: string;
  severity: "critical" | "high" | "medium" | "low";
  suggestion: string;
};

export type RelatedSkill = {
  required_skill: string;
  candidate_skill: string;
  relation_note?: string;
  notes?: string;
};

export type CategoryScoreItem = ScoreBreakdownItem;

export type WordAnnotation = {
  type: "strong_verb" | "weak_verb" | "metric" | "tech_skill" | "buzzword" | "pronoun" | string;
  text: string;
  start: number;
  end: number;
  label: string;
  issue?: string | null;
  replacement_options?: string[];
  explanation?: string;
};

export type BulletEvaluation = {
  id: number;
  line_number: number;
  section: string;
  original_text: string;
  word_count: number;
  impact_rating: "high" | "medium" | "needs_work";
  has_strong_verb: boolean;
  strong_verb?: string | null;
  has_weak_verb: boolean;
  weak_verb?: string | null;
  metrics: string[];
  skills: string[];
  buzzwords: string[];
  pronouns: string[];
  issues: string[];
  suggested_rewrite: string;
  rewrite_formula: string;
};

export type WordMetrics = {
  total_words: number;
  total_characters: number;
  unique_words: number;
  lexical_diversity_percentage: number;
  total_bullets: number;
  average_words_per_bullet: number;
  quantified_bullets_count: number;
  quantification_rate_percentage: number;
  strong_verb_bullets_count: number;
  strong_verb_rate_percentage: number;
  weak_verbs_count: number;
  buzzwords_count: number;
  personal_pronouns_count: number;
  reading_time_minutes: number;
  reading_grade_level: string;
};

export type ResumeWordedScores = {
  impact_score: number;
  brevity_score: number;
  style_score: number;
  ats_skills_score: number;
};

export type AIAgentReview = {
  provider: string;
  recruiter_critique: string;
  bullet_xyz_verdict: string;
  xyz_score: number;
  keyword_stuffing_risk: "Low" | "Medium" | "High" | string;
  top_recommendations: string[];
  tailoring_advice: string;
};

export type ResumeAnalysis = {
  id: number;
  user_id?: number | null;
  job_id?: number | null;
  analysis_mode?: "general" | "job_description" | "job_id";
  resume_filename: string;
  ats_score: number;
  job_match_score?: number | null;
  role_target?: string | null;
  summary?: string | null;
  raw_text?: string;
  extracted_skills: string[];
  soft_skills: string[];
  missing_skills: string[];
  matched_job_skills?: string[];
  related_skills?: RelatedSkill[];
  required_skills?: string[];
  preferred_skills?: string[];
  general_breakdown?: Record<string, ScoreBreakdownItem>;
  job_breakdown?: Record<string, ScoreBreakdownItem>;
  category_scores?: Record<string, ScoreBreakdownItem>;
  strengths: string[];
  weaknesses: string[];
  improvement_suggestions: string[];
  prioritized_suggestions?: PrioritySuggestion[];
  bullet_improvements?: BulletImprovement[];
  detected_issues?: DetectedIssue[];
  extracted_sections?: Record<string, any>;
  word_count?: number;
  reading_time_minutes?: number;
  detected_domain?: string;
  word_annotations?: WordAnnotation[];
  bullet_evaluations?: BulletEvaluation[];
  word_metrics?: WordMetrics;
  resume_worded_scores?: ResumeWordedScores;
  ai_agent_review?: AIAgentReview | null;
  master_guide_audit?: Record<string, any>;
  methodology_info?: string;
  error_message?: string | null;
  created_at: string;
};

export type ResumeImprovementResponse = {
  mode: string;
  original: string;
  improved: string;
  explanation: string;
  tips: string[];
};

export type ResumeAutoBoostResponse = {
  original_ats_score: number;
  boosted_ats_score: number;
  score_increase: number;
  enhanced_resume_text: string;
  improvements_applied: string[];
  downloadable_html?: string | null;
  new_analysis: ResumeAnalysis;
  structured_data?: Record<string, any> | null;
  template_id?: string | null;
};

export type RoadmapStep = {
  milestone: string;
  title: string;
  description: string;
  topics: string[];
  estimated_days: number;
  resources: Array<{ title: string; url: string }>;
  is_completed?: boolean;
};

export type ProjectRecommendation = {
  title: string;
  tagline: string;
  tech_stack: string[];
  description: string;
  key_features: string[];
  resume_bullet: string;
};

export type SkillRoadmap = {
  id: number;
  user_id: number;
  target_role: string;
  current_skills: string[];
  missing_skills: string[];
  roadmap_steps: RoadmapStep[];
  recommended_projects: ProjectRecommendation[];
  progress_percentage: number;
  created_at: string;
  updated_at: string;
};

export type Interview = {
  id: number;
  job_id: number;
  candidate_id: number;
  recruiter_id: number;
  application_id?: number | null;
  job_title?: string | null;
  company?: string | null;
  candidate_name?: string | null;
  candidate_email?: string | null;
  scheduled_at: string;
  duration_minutes: number;
  meeting_link?: string | null;
  round_type: string;
  status: "scheduled" | "completed" | "cancelled" | "rescheduled";
  notes?: string | null;
  feedback?: string | null;
  created_at: string;
};

export type MockExchange = {
  id: number;
  question: string;
  category: string;
  difficulty: string;
  user_answer?: string | null;
  ai_feedback?: string | null;
  score?: number | null;
  ideal_answer?: string | null;
  communication_tips?: string | null;
};

export type MockInterviewSession = {
  id: number;
  user_id: number;
  role_target: string;
  category: string;
  total_questions: number;
  completed_questions: number;
  overall_score?: number | null;
  feedback_summary?: string | null;
  exchanges: MockExchange[];
  created_at: string;
};

export type AnswerEvaluation = {
  exchange_id: number;
  score: number;
  ai_feedback: string;
  strengths: string[];
  improvements: string[];
  ideal_answer: string;
  communication_tips: string;
  is_session_complete: boolean;
  session_overall_score?: number | null;
};

export type ChatMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  agent_type?: string | null;
  content: string;
  created_at: string;
};

export type AdminAnalytics = {
  total_users: number;
  candidates_count: number;
  recruiters_count: number;
  total_jobs: number;
  active_jobs: number;
  external_jobs: number;
  total_applications: number;
  applications_by_status: Record<string, number>;
  total_interviews_scheduled: number;
  total_resumes_analyzed: number;
};

// =========================================================================
// AI RESUME STUDIO TYPES
// =========================================================================

export type PersonalInfo = {
  full_name: string;
  headline?: string;
  email: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
};

export type SkillCategory = {
  category: string;
  skills: string[];
};

export type EducationRecord = {
  id?: string;
  degree: string;
  institution: string;
  start_date?: string;
  graduation_date?: string;
  score?: string;
  location?: string;
  field_of_study?: string;
};

export type ProjectRecord = {
  id?: string;
  title: string;
  tech_stack?: string;
  project_url?: string;
  github_url?: string;
  bullets: string[];
};

export type InternshipRecord = {
  id?: string;
  role: string;
  organization: string;
  duration?: string;
  location?: string;
  technologies?: string;
  bullets: string[];
};

export type CertificationRecord = {
  id?: string;
  name: string;
  organization?: string;
  completion_date?: string;
  credential_url?: string;
};

export type CustomSectionRecord = {
  id?: string;
  heading: string;
  items: string[];
};

export type FormattingConfig = {
  font_family: string;
  font_size_pt: number;
  heading_size_pt: number;
  line_spacing: number;
  section_spacing_px: number;
  margin_in: number;
  accent_color: string;
  text_align: string;
  // Custom ATS Alignment & Layout specifications
  page_size?: string;
  margin_top_in?: number;
  margin_bottom_in?: number;
  margin_left_in?: number;
  margin_right_in?: number;
  header_align?: "center" | "left" | "right";
  is_single_column?: boolean;
  name_size_pt?: number;
  job_title_size_pt?: number;
  project_title_size_pt?: number;
  body_size_pt?: number;
  contact_size_pt?: number;
  paragraph_before_pt?: number;
  paragraph_after_pt?: number;
  section_spacing_before_pt?: number;
  section_spacing_after_pt?: number;
  bullet_indent_in?: number;
};

export type ResumeData = {
  personal_info: PersonalInfo;
  career_objective: string;
  technical_skills: SkillCategory[];
  education: EducationRecord[];
  projects: ProjectRecord[];
  internships: InternshipRecord[];
  certifications: CertificationRecord[];
  custom_sections?: CustomSectionRecord[];
  formatting_config: FormattingConfig;
};

export type ResumeDocument = {
  id: number;
  user_id?: number | null;
  resume_name: string;
  template_id: string;
  target_role?: string | null;
  job_id?: number | null;
  resume_data: ResumeData;
  ats_score: number;
  created_at: string;
  updated_at: string;
};

export type ResumeListItem = {
  id: number;
  resume_name: string;
  template_id: string;
  template_name: string;
  target_role?: string | null;
  ats_score: number;
  created_at: string;
  updated_at: string;
};

export type ResumeTemplate = {
  id: string;
  template_name: string;
  category: string;
  description: string;
  badge: string;
  accent_color: string;
  font_family: string;
  is_single_column: boolean;
  preview_html: string;
  is_active: boolean;
};

export type AIImproveTextResponse = {
  original: string;
  improved: string;
  explanation: string;
  action_verbs_used: string[];
};

export type JobTailorResponse = {
  matched_skills: string[];
  missing_skills: string[];
  tailored_objective: string;
  highlight_recommendations: string[];
  compatibility_score: number;
};

export type ATSCheckResult = {
  ats_score: number;
  category_scores: Record<string, number>;
  matched_keywords: string[];
  missing_keywords: string[];
  suggestions: string[];
};

