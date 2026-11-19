from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


# -------------------------------------------------------------
# Resume Analysis Schemas
# -------------------------------------------------------------
class ResumeAnalysisResponse(BaseModel):
    id: int = 0
    user_id: int | None = None
    job_id: int | None = None
    analysis_mode: Literal["general", "job_description", "job_id"] = "general"
    resume_filename: str
    ats_score: int
    job_match_score: int | None = None
    role_target: str | None = None
    summary: str | None = None
    raw_text: str = ""
    extracted_skills: list[str] = Field(default_factory=list)
    soft_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    matched_job_skills: list[str] = Field(default_factory=list)
    related_skills: list[dict[str, str]] = Field(default_factory=list)
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    general_breakdown: dict[str, Any] = Field(default_factory=dict)
    job_breakdown: dict[str, Any] = Field(default_factory=dict)
    category_scores: dict[str, Any] = Field(default_factory=dict)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    improvement_suggestions: list[str] = Field(default_factory=list)
    prioritized_suggestions: list[dict[str, Any]] = Field(default_factory=list)
    bullet_improvements: list[dict[str, Any]] = Field(default_factory=list)
    detected_issues: list[dict[str, Any]] = Field(default_factory=list)
    extracted_sections: dict[str, Any] = Field(default_factory=dict)
    word_count: int = 0
    reading_time_minutes: float = 1.0
    detected_domain: str = "Software Developer"
    word_annotations: list[dict[str, Any]] = Field(default_factory=list)
    bullet_evaluations: list[dict[str, Any]] = Field(default_factory=list)
    word_metrics: dict[str, Any] = Field(default_factory=dict)
    resume_worded_scores: dict[str, int] = Field(default_factory=dict)
    methodology_info: str = ""
    error_message: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ResumeImprovementRequest(BaseModel):
    mode: Literal["summary", "project", "bullet", "skills"] = "bullet"
    content: str
    target_role: str | None = "Software Developer"


class ResumeImprovementResponse(BaseModel):
    mode: str
    original: str
    improved: str
    explanation: str
    tips: list[str] = Field(default_factory=list)


class ResumeJobComparisonRequest(BaseModel):
    job_id: int
    target_role: str | None = None


class ResumeAutoBoostRequest(BaseModel):
    resume_text: str
    target_role: str | None = None
    job_id: int | None = None
    template_id: str | None = None


class ResumeAutoBoostResponse(BaseModel):
    original_ats_score: int
    boosted_ats_score: int
    score_increase: int
    enhanced_resume_text: str
    improvements_applied: list[str] = Field(default_factory=list)
    downloadable_html: str | None = None
    new_analysis: ResumeAnalysisResponse
    structured_data: dict[str, Any] | None = None
    template_id: str | None = None


# -------------------------------------------------------------
# Skill Gap Schemas
# -------------------------------------------------------------
class SkillGapRequest(BaseModel):
    target_role: str  # e.g. "Python Backend Developer", "Frontend React Developer", "Data/AI Engineer"
    job_id: int | None = None


class RoadmapStep(BaseModel):
    milestone: str
    title: str
    description: str
    topics: list[str]
    estimated_days: int
    resources: list[dict[str, str]] = Field(default_factory=list)  # title, url/type
    is_completed: bool = False


class ProjectRecommendation(BaseModel):
    title: str
    tagline: str
    tech_stack: list[str]
    description: str
    key_features: list[str]
    resume_bullet: str


class SkillRoadmapResponse(BaseModel):
    id: int
    user_id: int
    target_role: str
    current_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    roadmap_steps: list[RoadmapStep] = Field(default_factory=list)
    recommended_projects: list[ProjectRecommendation] = Field(default_factory=list)
    progress_percentage: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RoadmapProgressUpdate(BaseModel):
    progress_percentage: int = Field(ge=0, le=100)
    completed_milestones: list[str] | None = None


# -------------------------------------------------------------
# Interview Schemas
# -------------------------------------------------------------
class InterviewScheduleRequest(BaseModel):
    job_id: int
    candidate_id: int
    application_id: int | None = None
    scheduled_at: datetime
    duration_minutes: int = Field(default=45, ge=15, le=180)
    meeting_link: str | None = None
    round_type: str = "Technical Round 1"
    notes: str | None = None


class InterviewUpdateRequest(BaseModel):
    scheduled_at: datetime | None = None
    status: Literal["scheduled", "completed", "cancelled", "rescheduled"] | None = None
    meeting_link: str | None = None
    notes: str | None = None
    feedback: str | None = None


class InterviewResponse(BaseModel):
    id: int
    job_id: int
    candidate_id: int
    recruiter_id: int
    application_id: int | None = None
    job_title: str | None = None
    company: str | None = None
    candidate_name: str | None = None
    candidate_email: str | None = None
    scheduled_at: datetime
    duration_minutes: int
    meeting_link: str | None = None
    round_type: str
    status: str
    notes: str | None = None
    feedback: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -------------------------------------------------------------
# Mock Interview Schemas
# -------------------------------------------------------------
class QuestionBankItem(BaseModel):
    id: str | int
    category: str
    question: str
    difficulty: str
    key_concepts: list[str]
    sample_answer: str


class StartMockSessionRequest(BaseModel):
    category: str  # Python, SQL, Java, AWS, AI/ML, React, HR
    role_target: str = "Junior Software Developer"
    num_questions: int = Field(default=5, ge=1, le=10)


class MockExchangeResponse(BaseModel):
    id: int
    question: str
    category: str
    difficulty: str
    user_answer: str | None = None
    ai_feedback: str | None = None
    score: int | None = None
    ideal_answer: str | None = None
    communication_tips: str | None = None

    model_config = ConfigDict(from_attributes=True)


class MockSessionResponse(BaseModel):
    id: int
    user_id: int
    role_target: str
    category: str
    total_questions: int
    completed_questions: int
    overall_score: Decimal | None = None
    feedback_summary: str | None = None
    exchanges: list[MockExchangeResponse] = Field(default_factory=list)
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SubmitAnswerRequest(BaseModel):
    session_id: int
    exchange_id: int
    user_answer: str


class AnswerEvaluationResponse(BaseModel):
    exchange_id: int
    score: int  # 0 to 10
    ai_feedback: str
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    ideal_answer: str
    communication_tips: str
    is_session_complete: bool = False
    session_overall_score: Decimal | None = None


# -------------------------------------------------------------
# AI Career Assistant & RAG Schemas
# -------------------------------------------------------------
class ChatMessageRequest(BaseModel):
    message: str
    agent_type: Literal["general", "resume", "job", "career", "interview", "application"] = "general"


class ChatMessageResponse(BaseModel):
    id: int
    role: str
    agent_type: str | None = "general"
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -------------------------------------------------------------
# Admin Analytics Schemas
# -------------------------------------------------------------
class AdminAnalyticsResponse(BaseModel):
    total_users: int
    candidates_count: int
    recruiters_count: int
    total_jobs: int
    active_jobs: int
    external_jobs: int
    total_applications: int
    applications_by_status: dict[str, int]
    total_interviews_scheduled: int
    total_resumes_analyzed: int
