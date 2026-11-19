import type {
  Application,
  ApplicationStatus,
  Job,
  Page,
  User,
} from "@/lib/types";

const proxyBase = "/api/backend/api/v1";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function request<T>(
  path: string,
  options: {
    token?: string | null;
    method?: string;
    body?: BodyInit | null;
    json?: unknown;
  } = {},
): Promise<T> {
  const headers = new Headers();
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);

  let body = options.body;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  }

  const response = await fetch(`${proxyBase}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
    cache: "no-store",
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const detail =
      typeof payload === "object" &&
      payload !== null &&
      "detail" in payload &&
      typeof payload.detail === "string"
        ? payload.detail
        : `Request failed (${response.status})`;
    throw new ApiError(detail, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function register(
  email: string,
  password: string,
  role: User["role"],
): Promise<void> {
  await request<User>("/auth/register", {
    method: "POST",
    json: { email, password, role },
  });
}

export async function login(
  email: string,
  password: string,
): Promise<{ access_token: string; token_type: string }> {
  return request("/auth/login", {
    method: "POST",
    json: { email, password },
  });
}

export function getJobDetails(jobId: number): Promise<Job> {
  return request(`/jobs/${jobId}`);
}

export function searchJobs(
  params: URLSearchParams,
): Promise<Page<Job>> {
  const query = params.toString();
  return request(`/jobs${query ? `?${query}` : ""}`);
}

export function syncExternalJobs(limit = 25): Promise<{
  status: string;
  imported: number;
  updated: number;
  total_active_jobs: number;
}> {
  return request(`/jobs/sync-external?limit=${limit}`, {
    method: "POST",
  });
}

export function getMyJobs(token: string): Promise<Page<Job>> {
  return request("/jobs/mine?page_size=100", { token });
}

export function getMyApplications(token: string): Promise<Page<Application>> {
  return request("/applications/mine?page_size=100", { token });
}

export function getJobApplications(
  jobId: number,
  token: string,
): Promise<Page<Application>> {
  return request(`/applications/jobs/${jobId}?page_size=100`, { token });
}

export function updateApplicationStatus(
  applicationId: number,
  status: ApplicationStatus,
  token: string,
): Promise<Application> {
  return request(`/applications/${applicationId}/status`, {
    token,
    method: "PATCH",
    json: { status },
  });
}

export async function uploadProfileResume(file: File, token: string): Promise<User> {
  const formData = new FormData();
  formData.append("resume", file);
  return request("/auth/me/resume", {
    token,
    method: "POST",
    body: formData,
  });
}

export function deleteProfileResume(token: string): Promise<User> {
  return request("/auth/me/resume", {
    token,
    method: "DELETE",
  });
}

export async function applyToJob(
  options: {
    jobId: number;
    coverLetter?: string;
    resume?: File | null;
    useSavedResume?: boolean;
    saveAsProfileResume?: boolean;
  },
  token: string,
): Promise<Application> {
  const formData = new FormData();
  formData.append("job_id", String(options.jobId));
  if (options.coverLetter?.trim()) {
    formData.append("cover_letter", options.coverLetter.trim());
  }
  if (options.useSavedResume) {
    formData.append("use_saved_resume", "true");
  }
  if (options.saveAsProfileResume) {
    formData.append("save_as_profile_resume", "true");
  }
  if (options.resume) {
    formData.append("resume", options.resume);
  }

  return request("/applications", {
    token,
    method: "POST",
    body: formData,
  });
}

// Candidate Profile APIs
export function getCandidateProfile(token: string): Promise<import("@/lib/types").CandidateProfile> {
  return request("/auth/me/profile", { token });
}

export function updateCandidateProfile(
  profileData: Partial<import("@/lib/types").CandidateProfile>,
  token: string,
): Promise<import("@/lib/types").CandidateProfile> {
  return request("/auth/me/profile", {
    token,
    method: "PUT",
    json: profileData,
  });
}

export function deleteCandidateProfileField(
  fieldName: string,
  token: string,
): Promise<import("@/lib/types").CandidateProfile> {
  return request(`/auth/me/profile/${fieldName}`, {
    token,
    method: "DELETE",
  });
}

// Saved Jobs APIs
export function getSavedJobs(token: string): Promise<import("@/lib/types").SavedJob[]> {
  return request("/jobs/saved", { token });
}

export function saveJob(
  jobId: number,
  notes?: string,
  token?: string,
): Promise<import("@/lib/types").SavedJob> {
  return request(`/jobs/${jobId}/save`, {
    token,
    method: "POST",
    json: notes ? { notes } : {},
  });
}

export function removeSavedJob(jobId: number, token: string): Promise<void> {
  return request(`/jobs/${jobId}/save`, {
    token,
    method: "DELETE",
  });
}

// External Application Tracking
export function trackExternalApplication(
  data: {
    job_id: number;
    status?: import("@/lib/types").ApplicationStatus;
    notes?: string;
    applied_at?: string;
  },
  token: string,
): Promise<Application> {
  return request("/applications/track-external", {
    token,
    method: "POST",
    json: data,
  });
}

// Update Application Notes and Status
export function updateApplicationNotesAndStatus(
  applicationId: number,
  data: {
    status?: import("@/lib/types").ApplicationStatus;
    notes?: string;
  },
  token: string,
): Promise<Application> {
  return request(`/applications/${applicationId}/status`, {
    token,
    method: "PATCH",
    json: data,
  });
}

// Recommendations
export function getRecommendedJobs(
  token: string,
  limit = 10,
): Promise<import("@/lib/types").JobRecommendation[]> {
  return request(`/jobs/recommendations?limit=${limit}`, { token });
}

// Job Verification Trigger
export function verifyJobPosting(
  jobId: number,
  token: string,
): Promise<{ job_id: number; verification: Record<string, unknown> }> {
  return request(`/jobs/${jobId}/verify`, {
    token,
    method: "POST",
  });
}

// Notifications APIs
export function getNotifications(token: string): Promise<import("@/lib/types").Notification[]> {
  return request("/auth/me/notifications", { token });
}

export function markNotificationRead(
  notificationId: number,
  token: string,
): Promise<import("@/lib/types").Notification> {
  return request(`/auth/me/notifications/${notificationId}/read`, {
    token,
    method: "PATCH",
  });
}

export function markAllNotificationsRead(token: string): Promise<{ status: string; marked_read: number }> {
  return request("/auth/me/notifications/read-all", {
    token,
    method: "POST",
  });
}

// -------------------------------------------------------------
// AI Resume Analyzer APIs
// -------------------------------------------------------------
export function analyzeResume(
  formData: FormData,
  token?: string | null,
): Promise<import("@/lib/types").ResumeAnalysis> {
  return request("/ai/resume/analyze", {
    token: token || undefined,
    method: "POST",
    body: formData,
  });
}

export function getLatestResumeAnalysis(
  token: string,
): Promise<import("@/lib/types").ResumeAnalysis> {
  return request("/ai/resume/latest", { token });
}

export function compareResumeWithJob(
  jobId: number,
  token: string,
  targetRole?: string,
): Promise<import("@/lib/types").ResumeAnalysis> {
  return request("/ai/resume/compare-job", {
    token,
    method: "POST",
    json: { job_id: jobId, target_role: targetRole },
  });
}

export function improveResumeContent(
  data: { mode: "summary" | "project" | "bullet" | "skills"; content: string; target_role?: string },
  token?: string | null,
): Promise<import("@/lib/types").ResumeImprovementResponse> {
  return request("/ai/resume/assistant/improve", {
    token: token || undefined,
    method: "POST",
    json: data,
  });
}

export function autoBoostResume(
  data: { resume_text: string; target_role?: string; job_id?: number; template_id?: string },
  token?: string | null,
): Promise<import("@/lib/types").ResumeAutoBoostResponse> {
  return request("/ai/resume/auto-boost", {
    token: token || undefined,
    method: "POST",
    json: data,
  });
}

// -------------------------------------------------------------
// AI Skill Gap & Learning Roadmap APIs
// -------------------------------------------------------------
export function generateSkillGapRoadmap(
  targetRole: string,
  token: string,
  jobId?: number,
): Promise<import("@/lib/types").SkillRoadmap> {
  return request("/ai/skill-gap/analyze", {
    token,
    method: "POST",
    json: { target_role: targetRole, job_id: jobId },
  });
}

export function getUserRoadmaps(
  token: string,
): Promise<import("@/lib/types").SkillRoadmap[]> {
  return request("/ai/skill-gap/roadmaps", { token });
}

export function updateRoadmapProgress(
  roadmapId: number,
  progressPercentage: number,
  token: string,
  completedMilestones?: string[],
): Promise<import("@/lib/types").SkillRoadmap> {
  return request(`/ai/skill-gap/roadmaps/${roadmapId}/progress`, {
    token,
    method: "PATCH",
    json: { progress_percentage: progressPercentage, completed_milestones: completedMilestones },
  });
}

// -------------------------------------------------------------
// AI Interview Prep & Mock Interview APIs
// -------------------------------------------------------------
export function getInterviewQuestions(
  category: string,
): Promise<Array<{ id: string; category: string; question: string; difficulty: string; key_concepts: string[]; ideal_answer: string; communication_tips: string }>> {
  return request(`/ai/interview/questions?category=${encodeURIComponent(category)}`);
}

export function startMockInterviewSession(
  category: string,
  token: string,
  roleTarget = "Junior Software Developer",
  numQuestions = 4,
): Promise<import("@/lib/types").MockInterviewSession> {
  return request("/ai/interview/start-session", {
    token,
    method: "POST",
    json: { category, role_target: roleTarget, num_questions: numQuestions },
  });
}

export function submitMockInterviewAnswer(
  sessionId: number,
  exchangeId: number,
  userAnswer: string,
  token: string,
): Promise<import("@/lib/types").AnswerEvaluation> {
  return request("/ai/interview/submit-answer", {
    token,
    method: "POST",
    json: { session_id: sessionId, exchange_id: exchangeId, user_answer: userAnswer },
  });
}

export function getMockInterviewSessions(
  token: string,
): Promise<import("@/lib/types").MockInterviewSession[]> {
  return request("/ai/interview/sessions", { token });
}

// -------------------------------------------------------------
// AI Career Assistant & RAG Chat APIs
// -------------------------------------------------------------
export function sendCareerAssistantChat(
  message: string,
  token: string,
  agentType = "general",
  file?: File | null,
): Promise<import("@/lib/types").ChatMessage> {
  if (file) {
    const formData = new FormData();
    formData.append("message", message);
    formData.append("agent_type", agentType);
    formData.append("file", file);
    return request("/ai/assistant/chat-upload", {
      token,
      method: "POST",
      body: formData,
    });
  }

  return request("/ai/assistant/chat", {
    token,
    method: "POST",
    json: { message, agent_type: agentType },
  });
}

export function getCareerAssistantHistory(
  token: string,
): Promise<import("@/lib/types").ChatMessage[]> {
  return request("/ai/assistant/history", { token });
}

export function clearCareerAssistantHistory(token: string): Promise<void> {
  return request("/ai/assistant/history", {
    token,
    method: "DELETE",
  });
}

// -------------------------------------------------------------
// Interview Scheduling APIs
// -------------------------------------------------------------
export function scheduleInterview(
  payload: {
    job_id: number;
    candidate_id: number;
    application_id?: number | null;
    scheduled_at: string;
    duration_minutes?: number;
    meeting_link?: string | null;
    round_type?: string;
    notes?: string | null;
  },
  token: string,
): Promise<import("@/lib/types").Interview> {
  return request("/interviews/schedule", {
    token,
    method: "POST",
    json: payload,
  });
}

export function getMyInterviews(
  token: string,
): Promise<import("@/lib/types").Interview[]> {
  return request("/interviews/mine", { token });
}

export function updateInterview(
  interviewId: number,
  payload: {
    status?: "scheduled" | "completed" | "cancelled" | "rescheduled";
    scheduled_at?: string;
    meeting_link?: string;
    notes?: string;
    feedback?: string;
  },
  token: string,
): Promise<import("@/lib/types").Interview> {
  return request(`/interviews/${interviewId}`, {
    token,
    method: "PATCH",
    json: payload,
  });
}

// -------------------------------------------------------------
// Admin Platform Analytics API
// -------------------------------------------------------------
export function getAdminAnalytics(): Promise<import("@/lib/types").AdminAnalytics> {
  return request("/admin-analytics/stats");
}

// -------------------------------------------------------------
// AI Resume Studio APIs
// -------------------------------------------------------------
import type {
  ResumeDocument,
  ResumeListItem,
  ResumeTemplate,
  ResumeData,
  FormattingConfig,
  AIImproveTextResponse,
  JobTailorResponse,
  ATSCheckResult,
} from "@/lib/types";

export function getResumeTemplates(): Promise<ResumeTemplate[]> {
  return request("/resume-studio/templates");
}

export function getResumeTemplate(templateId: string): Promise<ResumeTemplate> {
  return request(`/resume-studio/templates/${templateId}`);
}

export function getMyResumes(token: string): Promise<ResumeListItem[]> {
  return request("/resume-studio/my-resumes", { token });
}

export function getResume(resumeId: number, token: string): Promise<ResumeDocument> {
  return request(`/resume-studio/${resumeId}`, { token });
}

export function createResume(
  payload: {
    resume_name: string;
    template_id: string;
    target_role?: string | null;
    resume_data?: Partial<ResumeData>;
  },
  token: string,
): Promise<ResumeDocument> {
  return request("/resume-studio/create", {
    token,
    method: "POST",
    json: payload,
  });
}

export function updateResume(
  resumeId: number,
  payload: {
    resume_name?: string;
    template_id?: string;
    target_role?: string | null;
    job_id?: number | null;
    resume_data?: ResumeData;
    ats_score?: number;
  },
  token: string,
): Promise<ResumeDocument> {
  return request(`/resume-studio/${resumeId}`, {
    token,
    method: "PUT",
    json: payload,
  });
}

export function deleteResume(resumeId: number, token: string): Promise<{ message: string }> {
  return request(`/resume-studio/${resumeId}`, {
    token,
    method: "DELETE",
  });
}

export function duplicateResume(resumeId: number, token: string): Promise<ResumeDocument> {
  return request(`/resume-studio/${resumeId}/duplicate`, {
    token,
    method: "POST",
  });
}

export async function importResumeFile(
  file: File,
  resumeName?: string,
  templateId?: string,
  token?: string,
): Promise<ResumeDocument> {
  const formData = new FormData();
  formData.append("file", file);
  if (resumeName) formData.append("resume_name", resumeName);
  if (templateId) formData.append("template_id", templateId);

  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${proxyBase}/resume-studio/import`, {
    method: "POST",
    headers,
    body: formData,
  });
  if (!res.ok) {
    const errorPayload = await res.json().catch(() => null);
    throw new ApiError(errorPayload?.detail || "Failed to import resume", res.status);
  }
  return res.json();
}

export async function renderLivePreviewHtml(payload: {
  template_id: string;
  resume_data: ResumeData;
  formatting_config?: FormattingConfig;
}): Promise<string> {
  const res = await fetch(`${proxyBase}/resume-studio/render/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new ApiError("Failed to render preview", res.status);
  }
  return res.text();
}

export function aiImproveText(payload: {
  field_type: string;
  current_text: string;
  target_role?: string | null;
  context_stack?: string | null;
}): Promise<AIImproveTextResponse> {
  return request("/resume-studio/ai/improve-text", {
    method: "POST",
    json: payload,
  });
}

export function tailorResumeJob(
  resumeId: number,
  payload: {
    job_id?: number | null;
    job_description_text?: string | null;
  },
  token: string,
): Promise<JobTailorResponse> {
  return request(`/resume-studio/${resumeId}/tailor-job`, {
    token,
    method: "POST",
    json: payload,
  });
}

export function checkResumeATS(
  resumeId: number,
  payload: {
    job_id?: number | null;
    job_description_text?: string | null;
  } | undefined,
  token: string,
): Promise<ATSCheckResult> {
  return request(`/resume-studio/${resumeId}/check-ats`, {
    token,
    method: "POST",
    json: payload || {},
  });
}

export async function downloadResumeDocx(resumeId: number, filename: string, token: string): Promise<void> {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${proxyBase}/resume-studio/${resumeId}/export/docx`, {
    headers,
  });
  if (!res.ok) throw new ApiError("Failed to download DOCX", res.status);

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".docx") ? filename : `${filename}.docx`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export async function printResumePdf(resumeId: number, token: string): Promise<void> {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${proxyBase}/resume-studio/${resumeId}/export/html`, {
    headers,
  });
  if (!res.ok) throw new ApiError("Failed to render print PDF", res.status);

  const html = await res.text();
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  }
}

