from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class PersonalInfoSchema(BaseModel):
    full_name: str = ""
    headline: str | None = None
    email: str = ""
    phone: str = ""
    location: str = ""
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None


class EducationRecordSchema(BaseModel):
    id: str | None = None
    degree: str = ""
    institution: str = ""
    specialization: str | None = None
    start_date: str | None = None
    graduation_date: str | None = None
    score: str | None = None


class SkillCategorySchema(BaseModel):
    category: str = "Technical Skills"
    skills: list[str] = Field(default_factory=list)


class ProjectRecordSchema(BaseModel):
    id: str | None = None
    title: str = ""
    tech_stack: str | None = None
    project_url: str | None = None
    github_url: str | None = None
    bullets: list[str] = Field(default_factory=list)


class InternshipRecordSchema(BaseModel):
    id: str | None = None
    role: str = ""
    organization: str = ""
    duration: str | None = None
    location: str | None = None
    technologies: str | None = None
    bullets: list[str] = Field(default_factory=list)


class CertificationRecordSchema(BaseModel):
    id: str | None = None
    name: str = ""
    organization: str | None = None
    completion_date: str | None = None
    credential_url: str | None = None


class CustomSectionRecordSchema(BaseModel):
    id: str | None = None
    heading: str = ""
    items: list[str] = Field(default_factory=list)


class FormattingConfigSchema(BaseModel):
    page_size: str = "A4"
    font_family: str = "Calibri"

    # Margins (inches) - ATS Recommended: Top/Bottom 0.5", Left/Right 0.65"
    margin_top_in: float = 0.50
    margin_bottom_in: float = 0.50
    margin_left_in: float = 0.65
    margin_right_in: float = 0.65
    margin_in: float = 0.50  # Fallback compatibility

    # Alignment - ATS Recommended: Single column, left body text, center header
    text_align: str = "left"
    header_align: str = "center"
    is_single_column: bool = True

    # Element Font Sizes (pt) - ATS Recommended Hierarchy
    name_size_pt: float = 21.0           # 20–22 pt
    job_title_size_pt: float = 10.5      # 10–11 pt
    heading_size_pt: float = 12.0        # 12–13 pt
    project_title_size_pt: float = 10.5  # 10.5–11 pt
    body_size_pt: float = 10.0           # 9.5–10.5 pt
    contact_size_pt: float = 9.5         # 9–10 pt
    font_size_pt: float = 10.0           # Fallback compatibility

    # Spacing & Indentation - ATS Recommended
    line_spacing: float = 1.08           # 1.0–1.1
    paragraph_before_pt: float = 0.0     # 0 pt
    paragraph_after_pt: float = 3.0      # 2–4 pt
    section_spacing_before_pt: float = 8.5 # 8–10 pt
    section_spacing_after_pt: float = 4.0  # 4–5 pt
    section_spacing_px: int = 8          # Fallback compatibility
    bullet_indent_in: float = 0.18       # 0.15–0.20 inch

    # Color & Palette
    accent_color: str = "#0f172a"


class ResumeDataSchema(BaseModel):
    personal_info: PersonalInfoSchema = Field(default_factory=PersonalInfoSchema)
    career_objective: str = ""
    technical_skills: list[SkillCategorySchema] = Field(default_factory=list)
    education: list[EducationRecordSchema] = Field(default_factory=list)
    projects: list[ProjectRecordSchema] = Field(default_factory=list)
    internships: list[InternshipRecordSchema] = Field(default_factory=list)
    certifications: list[CertificationRecordSchema] = Field(default_factory=list)
    custom_sections: list[CustomSectionRecordSchema] = Field(default_factory=list)
    formatting_config: FormattingConfigSchema = Field(default_factory=FormattingConfigSchema)


class ResumeCreateRequest(BaseModel):
    resume_name: str = "My Professional Resume"
    template_id: str = "modern-professional"
    target_role: str | None = None
    job_id: int | None = None
    resume_data: ResumeDataSchema = Field(default_factory=ResumeDataSchema)


class ResumeUpdateRequest(BaseModel):
    resume_name: str | None = None
    template_id: str | None = None
    target_role: str | None = None
    job_id: int | None = None
    resume_data: ResumeDataSchema | None = None
    ats_score: int | None = None


class ResumeResponse(BaseModel):
    id: int
    user_id: int | None = None
    resume_name: str
    template_id: str
    target_role: str | None = None
    job_id: int | None = None
    resume_data: ResumeDataSchema
    ats_score: int
    created_at: datetime
    updated_at: datetime


class ResumeListItemResponse(BaseModel):
    id: int
    resume_name: str
    template_id: str
    template_name: str
    target_role: str | None = None
    ats_score: int
    created_at: datetime
    updated_at: datetime


class TemplateResponse(BaseModel):
    id: str
    template_name: str
    category: str
    description: str
    badge: str
    accent_color: str
    font_family: str
    is_single_column: bool
    preview_html: str
    is_active: bool


class ImportResumeResponse(BaseModel):
    success: bool
    resume_name: str
    detected_target_role: str | None = None
    extracted_data: ResumeDataSchema
    extraction_notes: list[str] = Field(default_factory=list)


class AIImproveTextRequest(BaseModel):
    field_type: str  # "objective", "bullet", "project_description", "skills"
    current_text: str
    target_role: str | None = None
    context_stack: str | None = None


class AIImproveTextResponse(BaseModel):
    original: str
    improved: str
    explanation: str
    action_verbs_used: list[str] = Field(default_factory=list)


class JobTailorRequest(BaseModel):
    job_id: int | None = None
    job_description_text: str | None = None


class JobTailorResponse(BaseModel):
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    tailored_objective: str
    highlight_recommendations: list[str] = Field(default_factory=list)
    compatibility_score: int
