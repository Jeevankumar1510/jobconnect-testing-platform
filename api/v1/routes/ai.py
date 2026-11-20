import json
import logging
import os
import re
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import HTMLResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from accounts.dependencies import get_current_user, get_current_user_optional
from accounts.models import CandidateProfile, User, UserRole
from ai.models import (
    ChatMessage,
    MockInterviewExchange,
    MockInterviewSession,
    ResumeAnalysis,
    SkillRoadmap,
)
from ai.schemas import (
    AnswerEvaluationResponse,
    ChatMessageRequest,
    ChatMessageResponse,
    MockExchangeResponse,
    MockSessionResponse,
    ResumeAnalysisResponse,
    ResumeAutoBoostRequest,
    ResumeAutoBoostResponse,
    ResumeImprovementRequest,
    ResumeImprovementResponse,
    ResumeJobComparisonRequest,
    RoadmapProgressUpdate,
    RoadmapStep,
    SkillGapRequest,
    SkillRoadmapResponse,
    StartMockSessionRequest,
    SubmitAnswerRequest,
)
from ai.services.ats_analyzer import (
    analyze_resume_text,
    auto_boost_resume,
    extract_skills_from_text,
    generate_ats_resume_html,
)
from ai.services.career_assistant import run_career_assistant_agent
from ai.services.interview_prep import (
    QUESTION_BANKS,
    evaluate_candidate_answer,
    get_random_questions_for_category,
)
from ai.services.resume_parser import clean_and_normalize_resume_text, parse_resume_content
from ai.services.skill_gap import analyze_skill_gap
from applications.resume_validator import read_and_validate_resume, read_and_validate_resume_sync
from config.database import get_db
from config.settings import get_settings
from jobs.models import Job

router = APIRouter(prefix="/ai", tags=["AI Intelligence"])


# -----------------------------------------------------------------------------
# 1. AI Resume Analyzer Endpoints
# -----------------------------------------------------------------------------

@router.post("/resume/analyze", response_model=ResumeAnalysisResponse)
def analyze_resume(
    resume: UploadFile | None = File(default=None),
    resume_text: str | None = Form(default=None),
    use_saved_resume: bool = Form(default=False),
    job_id: int | None = Form(default=None),
    job_description_text: str | None = Form(default=None),
    role_target: str | None = Form(default=None),
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> ResumeAnalysisResponse:
    content: bytes
    filename: str

    # Safely extract authenticated user object
    actual_user: User | None = current_user if isinstance(current_user, User) else None

    # Safely coerce optional form parameters
    is_use_saved: bool = False
    if isinstance(use_saved_resume, bool):
        is_use_saved = use_saved_resume
    elif isinstance(use_saved_resume, str):
        is_use_saved = use_saved_resume.strip().lower() in ("true", "1", "yes")

    valid_job_id: int | None = None
    if isinstance(job_id, int):
        valid_job_id = job_id
    elif isinstance(job_id, str) and job_id.strip().isdigit():
        valid_job_id = int(job_id.strip())

    valid_role_target: str | None = None
    if isinstance(role_target, str) and role_target.strip():
        valid_role_target = role_target.strip()

    valid_jd_text: str | None = None
    if isinstance(job_description_text, str) and job_description_text.strip():
        valid_jd_text = job_description_text.strip()

    parsed_text: str = ""

    # 1. If a resume file was uploaded, prioritize analyzing the uploaded file
    has_file = resume is not None and bool(getattr(resume, "filename", None))
    if has_file and resume is not None:
        content, filename, _ = read_and_validate_resume_sync(resume)
        parsed_text = parse_resume_content(filename, content)
    # 2. If raw resume text was pasted/typed directly (ToolAdda / in-browser live check)
    elif resume_text and resume_text.strip():
        filename = "pasted_resume.txt"
        parsed_text = clean_and_normalize_resume_text(resume_text.strip())
    # 3. Otherwise if requested or default, look up saved resume from candidate profile
    elif is_use_saved or (actual_user and actual_user.resume_storage_key):
        if not actual_user or not actual_user.resume_storage_key:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="No saved resume found on your profile. Please upload a PDF or DOCX file.",
            )
        saved_path = get_settings().resume_storage_dir / actual_user.resume_storage_key
        if not saved_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Saved resume file not found on disk. Please upload a new file.",
            )
        content = saved_path.read_bytes()
        filename = actual_user.resume_filename or "saved_resume.pdf"
        parsed_text = parse_resume_content(filename, content)
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Resume file or text is required. Please upload a PDF/DOCX file or paste your resume text.",
        )

    if not parsed_text and actual_user:
        # Fallback to candidate profile data if text extraction is empty
        profile = db.scalar(select(CandidateProfile).where(CandidateProfile.user_id == actual_user.id))
        if profile:
            parsed_text = (
                f"Candidate: {profile.full_name or ''}\n"
                f"Education: {profile.education or ''}\n"
                f"Skills: {profile.technical_skills or ''}\n"
                f"Projects: {profile.projects or ''}\n"
                f"Experience: {profile.internship_experience or ''}\n"
            )

    target_job = db.get(Job, valid_job_id) if valid_job_id else None
    analysis = analyze_resume_text(
        parsed_text or "Software Developer Resume",
        target_job=target_job,
        target_role=valid_role_target,
        job_description_text=valid_jd_text,
    )

    analysis_id = 0
    user_id = actual_user.id if actual_user else None
    created_at = datetime.now(timezone.utc)

    # Save analysis in database for authenticated users
    if actual_user:
        db_analysis = ResumeAnalysis(
            user_id=actual_user.id,
            job_id=valid_job_id,
            resume_filename=filename,
            ats_score=analysis["ats_score"],
            role_target=analysis.get("role_target") or valid_role_target or (target_job.title if target_job else "Software Engineer"),
            summary=analysis["summary"],
            extracted_skills=json.dumps(analysis["extracted_skills"]),
            soft_skills=json.dumps(analysis["soft_skills"]),
            missing_skills=json.dumps(analysis["missing_skills"]),
            strengths=json.dumps(analysis["strengths"]),
            weaknesses=json.dumps(analysis["weaknesses"]),
            improvement_suggestions=json.dumps(analysis["improvement_suggestions"]),
            raw_text_snippet=(parsed_text or "")[:2000],
        )
        db.add(db_analysis)
        db.commit()
        db.refresh(db_analysis)
        analysis_id = db_analysis.id
        created_at = db_analysis.created_at

    return ResumeAnalysisResponse(
        id=analysis_id,
        user_id=user_id,
        job_id=valid_job_id,
        analysis_mode=analysis.get("analysis_mode", "general"),
        resume_filename=filename,
        ats_score=analysis["ats_score"],
        job_match_score=analysis.get("job_match_score"),
        role_target=analysis.get("role_target") or valid_role_target or (target_job.title if target_job else "Software Engineer"),
        summary=analysis["summary"],
        raw_text=parsed_text or "",
        extracted_skills=analysis["extracted_skills"],
        soft_skills=analysis["soft_skills"],
        missing_skills=analysis["missing_skills"],
        matched_job_skills=analysis.get("matched_job_skills", []),
        related_skills=analysis.get("related_skills", []),
        required_skills=analysis.get("required_skills", []),
        preferred_skills=analysis.get("preferred_skills", []),
        general_breakdown=analysis.get("general_breakdown", {}),
        job_breakdown=analysis.get("job_breakdown", {}),
        category_scores=analysis.get("category_scores", {}),
        strengths=analysis["strengths"],
        weaknesses=analysis["weaknesses"],
        improvement_suggestions=analysis["improvement_suggestions"],
        prioritized_suggestions=analysis.get("prioritized_suggestions", []),
        bullet_improvements=analysis.get("bullet_improvements", []),
        detected_issues=analysis.get("detected_issues", []),
        extracted_sections=analysis.get("extracted_sections", {}),
        word_count=analysis.get("word_count", 0),
        reading_time_minutes=analysis.get("reading_time_minutes", 1.0),
        detected_domain=analysis.get("detected_domain", "Software Developer"),
        word_annotations=analysis.get("word_annotations", []),
        bullet_evaluations=analysis.get("bullet_evaluations", []),
        word_metrics=analysis.get("word_metrics", {}),
        resume_worded_scores=analysis.get("resume_worded_scores", {}),
        ai_agent_review=analysis.get("ai_agent_review"),
        methodology_info=analysis.get("methodology_info", ""),
        error_message=analysis.get("error_message"),
        created_at=created_at,
    )


@router.get("/resume/latest", response_model=ResumeAnalysisResponse)
def get_latest_resume_analysis(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResumeAnalysisResponse:
    analysis = db.scalar(
        select(ResumeAnalysis)
        .where(ResumeAnalysis.user_id == current_user.id)
        .order_by(ResumeAnalysis.created_at.desc())
        .limit(1)
    )
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No resume analysis found. Please run an analysis first.",
        )

    re_analyzed: dict[str, Any] = {}
    if analysis.raw_text_snippet:
        re_analyzed = analyze_resume_text(
            analysis.raw_text_snippet,
            target_role=analysis.role_target,
        )

    return ResumeAnalysisResponse(
        id=analysis.id,
        user_id=analysis.user_id,
        job_id=analysis.job_id,
        analysis_mode=re_analyzed.get("analysis_mode", "general"),
        resume_filename=analysis.resume_filename,
        ats_score=analysis.ats_score,
        job_match_score=re_analyzed.get("job_match_score") or (analysis.ats_score if analysis.job_id else None),
        role_target=analysis.role_target,
        summary=analysis.summary,
        raw_text=analysis.raw_text_snippet or "",
        extracted_skills=re_analyzed.get("extracted_skills") or (json.loads(analysis.extracted_skills) if analysis.extracted_skills else []),
        soft_skills=re_analyzed.get("soft_skills") or (json.loads(analysis.soft_skills) if analysis.soft_skills else []),
        missing_skills=re_analyzed.get("missing_skills") or (json.loads(analysis.missing_skills) if analysis.missing_skills else []),
        matched_job_skills=re_analyzed.get("matched_job_skills", []),
        related_skills=re_analyzed.get("related_skills", []),
        required_skills=re_analyzed.get("required_skills", []),
        preferred_skills=re_analyzed.get("preferred_skills", []),
        general_breakdown=re_analyzed.get("general_breakdown", {}),
        job_breakdown=re_analyzed.get("job_breakdown", {}),
        category_scores=re_analyzed.get("general_breakdown", {}),
        strengths=json.loads(analysis.strengths) if analysis.strengths else [],
        weaknesses=json.loads(analysis.weaknesses) if analysis.weaknesses else [],
        improvement_suggestions=json.loads(analysis.improvement_suggestions) if analysis.improvement_suggestions else [],
        prioritized_suggestions=re_analyzed.get("prioritized_suggestions", []),
        bullet_improvements=re_analyzed.get("bullet_improvements", []),
        detected_issues=re_analyzed.get("detected_issues", []),
        extracted_sections=re_analyzed.get("extracted_sections", {}),
        word_count=re_analyzed.get("word_count", len((analysis.raw_text_snippet or "").split())),
        reading_time_minutes=re_analyzed.get("reading_time_minutes", 1.0),
        detected_domain=re_analyzed.get("detected_domain", "Software Developer"),
        word_annotations=re_analyzed.get("word_annotations", []),
        bullet_evaluations=re_analyzed.get("bullet_evaluations", []),
        word_metrics=re_analyzed.get("word_metrics", {}),
        resume_worded_scores=re_analyzed.get("resume_worded_scores", {}),
        ai_agent_review=re_analyzed.get("ai_agent_review"),
        methodology_info=re_analyzed.get("methodology_info", ""),
        error_message=re_analyzed.get("error_message"),
        created_at=analysis.created_at,
    )


@router.post("/resume/compare-job", response_model=ResumeAnalysisResponse)
def compare_resume_with_job(
    request: ResumeJobComparisonRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResumeAnalysisResponse:
    job = db.get(Job, request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Get latest resume text snippet
    latest = db.scalar(
        select(ResumeAnalysis)
        .where(ResumeAnalysis.user_id == current_user.id)
        .order_by(ResumeAnalysis.created_at.desc())
        .limit(1)
    )
    resume_text = latest.raw_text_snippet if latest and latest.raw_text_snippet else ""

    if not resume_text:
        profile = db.scalar(select(CandidateProfile).where(CandidateProfile.user_id == current_user.id))
        if profile:
            resume_text = f"{profile.technical_skills or ''} {profile.projects or ''} {profile.education or ''}"

    analysis = analyze_resume_text(resume_text, target_job=job, target_role=request.target_role or job.title)

    db_analysis = ResumeAnalysis(
        user_id=current_user.id,
        job_id=job.id,
        resume_filename=latest.resume_filename if latest else "Profile Resume",
        ats_score=analysis["ats_score"],
        role_target=job.title,
        summary=analysis["summary"],
        extracted_skills=json.dumps(analysis["extracted_skills"]),
        soft_skills=json.dumps(analysis["soft_skills"]),
        missing_skills=json.dumps(analysis["missing_skills"]),
        strengths=json.dumps(analysis["strengths"]),
        weaknesses=json.dumps(analysis["weaknesses"]),
        improvement_suggestions=json.dumps(analysis["improvement_suggestions"]),
        raw_text_snippet=resume_text,
    )
    db.add(db_analysis)
    db.commit()
    db.refresh(db_analysis)

    return ResumeAnalysisResponse(
        id=db_analysis.id,
        user_id=db_analysis.user_id,
        job_id=db_analysis.job_id,
        analysis_mode=analysis.get("analysis_mode", "job_id"),
        resume_filename=db_analysis.resume_filename,
        ats_score=db_analysis.ats_score,
        job_match_score=analysis.get("job_match_score"),
        role_target=db_analysis.role_target,
        summary=db_analysis.summary,
        raw_text=resume_text,
        extracted_skills=analysis["extracted_skills"],
        soft_skills=analysis["soft_skills"],
        missing_skills=analysis["missing_skills"],
        matched_job_skills=analysis.get("matched_job_skills", []),
        related_skills=analysis.get("related_skills", []),
        required_skills=analysis.get("required_skills", []),
        preferred_skills=analysis.get("preferred_skills", []),
        general_breakdown=analysis.get("general_breakdown", {}),
        job_breakdown=analysis.get("job_breakdown", {}),
        category_scores=analysis.get("category_scores", {}),
        strengths=analysis["strengths"],
        weaknesses=analysis["weaknesses"],
        improvement_suggestions=analysis["improvement_suggestions"],
        prioritized_suggestions=analysis.get("prioritized_suggestions", []),
        bullet_improvements=analysis.get("bullet_improvements", []),
        detected_issues=analysis.get("detected_issues", []),
        extracted_sections=analysis.get("extracted_sections", {}),
        word_count=analysis.get("word_count", 0),
        reading_time_minutes=analysis.get("reading_time_minutes", 1.0),
        detected_domain=analysis.get("detected_domain", "Software Developer"),
        word_annotations=analysis.get("word_annotations", []),
        bullet_evaluations=analysis.get("bullet_evaluations", []),
        word_metrics=analysis.get("word_metrics", {}),
        resume_worded_scores=analysis.get("resume_worded_scores", {}),
        ai_agent_review=analysis.get("ai_agent_review"),
        methodology_info=analysis.get("methodology_info", ""),
        error_message=analysis.get("error_message"),
        created_at=db_analysis.created_at,
    )


# -----------------------------------------------------------------------------
# AI Resume Improvement Assistant & Downloadable Report Endpoints
# -----------------------------------------------------------------------------

@router.post("/resume/assistant/improve", response_model=ResumeImprovementResponse)
def improve_resume_content(
    req: ResumeImprovementRequest,
    current_user: User | None = Depends(get_current_user_optional),
) -> ResumeImprovementResponse:
    """
    On-demand AI assistant for:
    - Professional summary improvement
    - Project description improvement
    - Experience bullet improvement
    - Technical skills organization
    Does not hallucinate false qualifications or metrics.
    """
    content = req.content.strip()
    role = req.target_role or "Software Developer"
    mode = req.mode

    # 1. Try OpenAI ChatGPT API if available
    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key and len(content) > 5:
        try:
            url = "https://api.openai.com/v1/chat/completions"
            sys_msg = (
                f"You are a tech recruiter and ATS resume optimization coach. The candidate is applying for '{role}'.\n"
                f"Task: Improve the candidate's {mode} below following strict guidelines:\n"
                "- Do NOT invent companies, awards, or fake numerical metrics.\n"
                "- Use strong active engineering verbs (e.g. Engineered, Implemented, Designed, Integrated, Optimized).\n"
                "- Structure bullet points using Google's X-Y-Z formula.\n"
                "Return a valid JSON object matching: {\"improved\": \"...\", \"explanation\": \"...\", \"tips\": [\"...\", \"...\"]}"
            )
            req_obj = urllib.request.Request(
                url,
                data=json.dumps({
                    "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
                    "messages": [
                        {"role": "system", "content": sys_msg},
                        {"role": "user", "content": content},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 500,
                    "response_format": {"type": "json_object"},
                }).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {openai_key}",
                },
                method="POST",
            )
            with urllib.request.urlopen(req_obj, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                raw_text = data["choices"][0]["message"]["content"].strip()
                parsed = json.loads(raw_text)
                if isinstance(parsed, dict) and "improved" in parsed:
                    return ResumeImprovementResponse(
                        mode=mode,
                        original=content,
                        improved=parsed["improved"],
                        explanation=parsed.get("explanation", "Rewritten with active engineering verbs and ATS keyword alignment powered by ChatGPT."),
                        tips=parsed.get("tips", [
                            "Highlight key tools and technologies in bold.",
                            "Add your real project throughput or test results if available.",
                        ]),
                    )
        except Exception as e:
            logger.debug("ChatGPT assistant call skipped or timed out: %s", e)

    # 2. Try Gemini API if available
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key and len(content) > 5:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
            prompt = (
                f"You are a tech recruiter and ATS resume optimization coach. The candidate is a fresher applying for '{role}'.\n"
                f"Task: Improve the candidate's {mode} below following strict guidelines:\n"
                "- Do NOT invent companies, awards, or fake numerical metrics.\n"
                "- Use strong active engineering verbs (e.g. Engineered, Implemented, Designed, Integrated).\n"
                "- Structure bullet points using Google's X-Y-Z formula.\n"
                "Return a valid JSON object matching: {{\"improved\": \"...\", \"explanation\": \"...\", \"tips\": [\"...\", \"...\"]}}\n\n"
                f"Input text:\n{content}"
            )
            request_obj = urllib.request.Request(
                url,
                data=json.dumps({
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.2, "maxOutputTokens": 600},
                }).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(request_obj, timeout=4) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                raw_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                if raw_text.startswith("```"):
                    raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
                    raw_text = re.sub(r"\s*```$", "", raw_text)
                parsed = json.loads(raw_text)
                if isinstance(parsed, dict) and "improved" in parsed:
                    return ResumeImprovementResponse(
                        mode=mode,
                        original=content,
                        improved=parsed["improved"],
                        explanation=parsed.get("explanation", "Rewritten with active engineering verbs and ATS keyword alignment."),
                        tips=parsed.get("tips", [
                            "Highlight key tools and technologies in bold.",
                            "Add your real project throughput or test results if available.",
                        ]),
                    )
        except Exception as e:
            logger.debug("Gemini assistant call failed, using rule-based generator: %s", e)

    # 2. Rule-based expert rewriter
    if mode == "summary":
        improved = (
            f"Aspiring {role} with strong foundational software engineering skills and hands-on capstone project experience. "
            "Proficient in designing RESTful backend architectures, optimizing relational database models, and practicing automated testing. "
            "Passionate about writing clean, maintainable code and accelerating feature delivery in fast-paced engineering teams."
        )
        explanation = "Replaced generic objective statements with role-targeted keywords, core technical competencies, and an emphasis on maintainable software delivery."
        tips = [
            f"Tailor the top 3 technologies specifically for {role} positions.",
            "Keep the summary strictly between 40-60 words.",
            "Avoid subjective buzzwords like 'hardworking' without concrete technical backing."
        ]
    elif mode == "project":
        improved = (
            f"Architected full-stack {content[:45] if content else 'web application'} utilizing modern engineering best practices; "
            "designed clean RESTful API endpoints, integrated indexed database schemas, and configured automated test suites to ensure high operational reliability."
        )
        explanation = "Structures project descriptions around architecture, stack integration, and quality assurance."
        tips = [
            "Name the exact tech stack in parentheses (e.g. Python, FastAPI, PostgreSQL).",
            "Include a direct link to your GitHub repository and live deployment URL.",
            "State your individual engineering contributions clearly."
        ]
    elif mode == "skills":
        skills_list = [s.strip() for s in re.split(r"[,|\n/]", content) if s.strip()]
        improved = (
            f"Languages: {', '.join(skills_list[:4]) if skills_list else 'Python, SQL, JavaScript'}\n"
            f"Frameworks & Libraries: {', '.join(skills_list[4:8]) if len(skills_list) > 4 else 'FastAPI, Django, React'}\n"
            f"Databases & Tools: {', '.join(skills_list[8:]) if len(skills_list) > 8 else 'PostgreSQL, Docker, Git, PyTest'}"
        )
        explanation = "Organized flat comma-separated skills into distinct layers (Languages, Frameworks, Databases & Tools) for rapid ATS parsing."
        tips = [
            "Never list skills you cannot explain in a technical interview.",
            "Highlight your primary programming language first."
        ]
    else:  # bullet
        cleaned = content.lstrip("-*•> ").strip()
        transformed = cleaned
        for weak in ["worked on", "responsible for", "helped with", "knowledge of", "familiar with", "participated in"]:
            pattern = r"(?i)\b" + re.escape(weak) + r"\b"
            if re.search(pattern, transformed):
                transformed = re.sub(pattern, "Engineered", transformed, count=1)
                break
        if transformed == cleaned:
            transformed = f"Engineered and deployed {cleaned[0].lower() + cleaned[1:] if cleaned else 'core technical feature'}"

        improved = f"{transformed}; implemented automated test validation and optimized data handling for production readiness."
        explanation = "Transformed into an accomplishment-oriented statement starting with a high-impact engineering verb."
        tips = [
            "Apply the Google X-Y-Z formula: Accomplished [X], as measured by [Y], by doing [Z].",
            "Quantify real project results: requests handled, test cases written, or latency reduced.",
            "Never invent false metrics or company credentials."
        ]

    return ResumeImprovementResponse(
        mode=mode,
        original=content,
        improved=improved,
        explanation=explanation,
        tips=tips,
    )


@router.get("/resume/report/html", response_class=HTMLResponse)
def get_printable_resume_report(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HTMLResponse:
    """
    Renders a print-ready, professional HTML report for PDF export/download.
    """
    analysis = db.scalar(
        select(ResumeAnalysis)
        .where(ResumeAnalysis.user_id == current_user.id)
        .order_by(ResumeAnalysis.created_at.desc())
        .limit(1)
    )
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No resume analysis found. Please run an analysis first.",
        )

    re_analyzed = analyze_resume_text(
        analysis.raw_text_snippet or "",
        target_role=analysis.role_target,
    ) if analysis.raw_text_snippet else {}

    breakdown = re_analyzed.get("general_breakdown", {})
    issues = re_analyzed.get("detected_issues", [])
    bullets = re_analyzed.get("bullet_improvements", [])
    suggestions = re_analyzed.get("prioritized_suggestions", [])

    rows_html = "".join(
        f"<tr>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;'>{v.get('label')}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;'>{v.get('weight_pct')}%</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;'>{v.get('score')}/{v.get('max')} ({v.get('percentage')}%)</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;'>{v.get('feedback')}</td>"
        f"</tr>"
        for k, v in breakdown.items()
    )

    bullets_html = "".join(
        f"<div style='margin-bottom:12px;padding:12px;background:#f8fafc;border-left:4px solid #3b82f6;border-radius:4px;'>"
        f"<div style='color:#ef4444;font-size:12px;'><strong>Original:</strong> {b.get('original_sentence')}</div>"
        f"<div style='color:#10b981;font-size:12px;margin-top:4px;'><strong>Improved:</strong> {b.get('improved_version')}</div>"
        f"<div style='color:#64748b;font-size:11px;margin-top:2px;'><em>{b.get('explanation')}</em></div>"
        f"</div>"
        for b in bullets[:4]
    )

    suggestions_html = "".join(
        f"<li style='margin-bottom:8px;font-size:12px;'>"
        f"<span style='display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;text-transform:uppercase;margin-right:6px;"
        f"background:{'#fee2e2;color:#b91c1c' if s.get('priority') == 'critical' else ('#fef3c7;color:#b45309' if s.get('priority') == 'high' else '#e0f2fe;color:#0369a1')};'>"
        f"{s.get('priority')}</span>"
        f"<strong>{s.get('title')}:</strong> {s.get('details')}"
        f"</li>"
        for s in suggestions
    )

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>JobConnect ATS Evaluation Report - {analysis.resume_filename}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; margin: 0; padding: 24px; }}
  .container {{ max-width: 800px; margin: 0 auto; }}
  .header {{ display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; }}
  .score-badge {{ font-size: 32px; font-weight: 800; color: #2563eb; border: 2px solid #2563eb; border-radius: 12px; padding: 8px 18px; text-align: center; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }}
  th {{ background: #f1f5f9; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569; }}
  h2 {{ font-size: 16px; color: #0f172a; margin-top: 24px; margin-bottom: 12px; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; }}
  .no-print {{ background: #2563eb; color: white; padding: 12px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; float: right; }}
  @media print {{ .no-print {{ display: none !important; }} body {{ padding: 0; }} }}
</style>
</head>
<body>
<div class="container">
  <div style="margin-bottom: 20px;">
    <button class="no-print" onclick="window.print()">Print / Save as PDF</button>
    <div style="clear: both;"></div>
  </div>
  <div class="header">
    <div>
      <h1 style="margin: 0; font-size: 24px; color: #1e3a8a;">AI Job Connect – ATS Evaluation Report</h1>
      <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">File: {analysis.resume_filename} | Target Role: {analysis.role_target or 'Software Developer'}</p>
      <p style="margin: 2px 0 0 0; color: #64748b; font-size: 12px;">Candidate Account: {current_user.email} | Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}</p>
    </div>
    <div class="score-badge">
      {analysis.ats_score}
      <div style="font-size: 11px; color: #64748b; font-weight: 600;">/ 100 ATS SCORE</div>
    </div>
  </div>

  <h2>Overall Executive Summary</h2>
  <p style="font-size: 13px; line-height: 1.6; color: #334155;">{analysis.summary or 'Deterministic ATS readiness evaluation generated based on industry recruiting standards.'}</p>

  <h2>9-Pillar Scoring Breakdown</h2>
  <table>
    <thead>
      <tr><th>Evaluation Pillar</th><th>Weight</th><th>Score</th><th>Recruiter Feedback</th></tr>
    </thead>
    <tbody>
      {rows_html}
    </tbody>
  </table>

  <h2>Wording Improvements (Before & After)</h2>
  {bullets_html or '<p style="font-size:12px;color:#64748b;">No severe weak phrasing detected.</p>'}

  <h2>Priority Recommendations</h2>
  <ul style="padding-left: 20px;">
    {suggestions_html}
  </ul>

  <div style="margin-top: 36px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
    AI Job Connect Deterministic ATS Scoring Engine v2.0 • Designed for Students & Fresh Graduates
  </div>
</div>
</body>
</html>"""
    return HTMLResponse(content=html_content)


@router.post("/resume/auto-boost", response_model=ResumeAutoBoostResponse)
def boost_resume(
    request: ResumeAutoBoostRequest,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> ResumeAutoBoostResponse:
    """
    1-Click AI Auto-Enhance & ATS Score Booster.
    Eliminates character spacing artifacts, upgrades weak phrasing to active power verbs,
    normalizes technical skills, and recalculates the boosted ATS score.
    """
    target_job = db.get(Job, request.job_id) if request.job_id else None
    result = auto_boost_resume(
        resume_text=request.resume_text,
        target_role=request.target_role,
        target_job=target_job,
        template_id=request.template_id,
    )
    new_analysis = result["new_analysis"]
    analysis_resp = ResumeAnalysisResponse(
        id=0,
        user_id=current_user.id if isinstance(current_user, User) else None,
        job_id=request.job_id,
        analysis_mode=new_analysis.get("analysis_mode", "general"),
        resume_filename="ats_optimized_resume.txt",
        ats_score=new_analysis["ats_score"],
        job_match_score=new_analysis.get("job_match_score"),
        role_target=new_analysis.get("role_target"),
        summary=new_analysis["summary"],
        raw_text=new_analysis["raw_text"],
        extracted_skills=new_analysis["extracted_skills"],
        soft_skills=new_analysis["soft_skills"],
        missing_skills=new_analysis["missing_skills"],
        matched_job_skills=new_analysis.get("matched_job_skills", []),
        related_skills=new_analysis.get("related_skills", []),
        required_skills=new_analysis.get("required_skills", []),
        preferred_skills=new_analysis.get("preferred_skills", []),
        general_breakdown=new_analysis.get("general_breakdown", {}),
        job_breakdown=new_analysis.get("job_breakdown", {}),
        category_scores=new_analysis.get("category_scores", {}),
        strengths=new_analysis["strengths"],
        weaknesses=new_analysis["weaknesses"],
        improvement_suggestions=new_analysis["improvement_suggestions"],
        prioritized_suggestions=new_analysis.get("prioritized_suggestions", []),
        bullet_improvements=new_analysis.get("bullet_improvements", []),
        detected_issues=new_analysis.get("detected_issues", []),
        extracted_sections=new_analysis.get("extracted_sections", {}),
        word_count=new_analysis.get("word_count", 0),
        reading_time_minutes=new_analysis.get("reading_time_minutes", 1.0),
        detected_domain=new_analysis.get("detected_domain", "Software Developer"),
        word_annotations=new_analysis.get("word_annotations", []),
        bullet_evaluations=new_analysis.get("bullet_evaluations", []),
        word_metrics=new_analysis.get("word_metrics", {}),
        resume_worded_scores=new_analysis.get("resume_worded_scores", {}),
        ai_agent_review=new_analysis.get("ai_agent_review"),
        methodology_info=new_analysis.get("methodology_info", ""),
        error_message=new_analysis.get("error_message"),
        created_at=datetime.now(timezone.utc),
    )

    return ResumeAutoBoostResponse(
        original_ats_score=result["original_ats_score"],
        boosted_ats_score=result["boosted_ats_score"],
        score_increase=result["score_increase"],
        enhanced_resume_text=result["enhanced_resume_text"],
        improvements_applied=result["improvements_applied"],
        downloadable_html=result.get("downloadable_html"),
        new_analysis=analysis_resp,
        structured_data=result.get("structured_data"),
        template_id=result.get("template_id"),
    )


@router.post("/resume/download-html", response_class=HTMLResponse)
def download_resume_html(
    request: ResumeAutoBoostRequest,
) -> HTMLResponse:
    """
    Renders an ATS-optimized, single-page print-ready HTML resume.
    """
    html_content = generate_ats_resume_html(
        enhanced_text=request.resume_text,
        candidate_name="Candidate",
        target_role=request.target_role or "Software Engineer",
    )
    return HTMLResponse(content=html_content)


# -----------------------------------------------------------------------------
# 2. Skill Gap & Roadmap Endpoints
# -----------------------------------------------------------------------------

@router.post("/skill-gap/analyze", response_model=SkillRoadmapResponse)
def generate_skill_gap_roadmap(
    request: SkillGapRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SkillRoadmapResponse:
    # Gather candidate skills from profile or latest resume analysis
    profile = db.scalar(select(CandidateProfile).where(CandidateProfile.user_id == current_user.id))
    latest_resume = db.scalar(
        select(ResumeAnalysis)
        .where(ResumeAnalysis.user_id == current_user.id)
        .order_by(ResumeAnalysis.created_at.desc())
        .limit(1)
    )

    candidate_skills: list[str] = []
    if latest_resume and latest_resume.extracted_skills:
        candidate_skills.extend(json.loads(latest_resume.extracted_skills))
    if profile and profile.technical_skills:
        candidate_skills.extend([s.strip() for s in profile.technical_skills.split(",") if s.strip()])

    candidate_skills = sorted(list(set(candidate_skills)))

    job_desc: str | None = None
    if request.job_id:
        job = db.get(Job, request.job_id)
        if job:
            job_desc = f"{job.title} {job.description}"

    result = analyze_skill_gap(candidate_skills, request.target_role, job_description=job_desc)

    roadmap = SkillRoadmap(
        user_id=current_user.id,
        target_role=result["target_role"],
        current_skills=json.dumps(result["current_skills"]),
        missing_skills=json.dumps(result["missing_skills"]),
        roadmap_steps=json.dumps(result["roadmap_steps"]),
        recommended_projects=json.dumps(result["recommended_projects"]),
        progress_percentage=result["progress_percentage"],
    )
    db.add(roadmap)
    db.commit()
    db.refresh(roadmap)

    return SkillRoadmapResponse(
        id=roadmap.id,
        user_id=roadmap.user_id,
        target_role=roadmap.target_role,
        current_skills=result["current_skills"],
        missing_skills=result["missing_skills"],
        roadmap_steps=result["roadmap_steps"],
        recommended_projects=result["recommended_projects"],
        progress_percentage=roadmap.progress_percentage,
        created_at=roadmap.created_at,
        updated_at=roadmap.updated_at,
    )


@router.get("/skill-gap/roadmaps", response_model=list[SkillRoadmapResponse])
def get_user_roadmaps(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SkillRoadmapResponse]:
    roadmaps = db.scalars(
        select(SkillRoadmap)
        .where(SkillRoadmap.user_id == current_user.id)
        .order_by(SkillRoadmap.created_at.desc())
        .limit(10)
    ).all()

    results: list[SkillRoadmapResponse] = []
    for r in roadmaps:
        results.append(
            SkillRoadmapResponse(
                id=r.id,
                user_id=r.user_id,
                target_role=r.target_role,
                current_skills=json.loads(r.current_skills) if r.current_skills else [],
                missing_skills=json.loads(r.missing_skills) if r.missing_skills else [],
                roadmap_steps=json.loads(r.roadmap_steps) if r.roadmap_steps else [],
                recommended_projects=json.loads(r.recommended_projects) if r.recommended_projects else [],
                progress_percentage=r.progress_percentage,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
        )
    return results


@router.patch("/skill-gap/roadmaps/{roadmap_id}/progress", response_model=SkillRoadmapResponse)
def update_roadmap_progress(
    roadmap_id: int,
    payload: RoadmapProgressUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SkillRoadmapResponse:
    roadmap = db.get(SkillRoadmap, roadmap_id)
    if not roadmap or roadmap.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Roadmap not found")

    roadmap.progress_percentage = payload.progress_percentage
    if payload.completed_milestones is not None and roadmap.roadmap_steps:
        steps = json.loads(roadmap.roadmap_steps)
        for s in steps:
            s["is_completed"] = s.get("milestone") in payload.completed_milestones
        roadmap.roadmap_steps = json.dumps(steps)

    db.commit()
    db.refresh(roadmap)

    return SkillRoadmapResponse(
        id=roadmap.id,
        user_id=roadmap.user_id,
        target_role=roadmap.target_role,
        current_skills=json.loads(roadmap.current_skills) if roadmap.current_skills else [],
        missing_skills=json.loads(roadmap.missing_skills) if roadmap.missing_skills else [],
        roadmap_steps=json.loads(roadmap.roadmap_steps) if roadmap.roadmap_steps else [],
        recommended_projects=json.loads(roadmap.recommended_projects) if roadmap.recommended_projects else [],
        progress_percentage=roadmap.progress_percentage,
        created_at=roadmap.created_at,
        updated_at=roadmap.updated_at,
    )


# -----------------------------------------------------------------------------
# 3. AI Mock Interview Endpoints
# -----------------------------------------------------------------------------

@router.get("/interview/questions")
def get_interview_question_bank(
    category: str = Query(default="Python"),
) -> list[dict[str, Any]]:
    return QUESTION_BANKS.get(category, QUESTION_BANKS.get("Python", []))


@router.post("/interview/start-session", response_model=MockSessionResponse)
def start_mock_interview_session(
    request: StartMockSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MockSessionResponse:
    questions = get_random_questions_for_category(request.category, count=request.num_questions)
    if not questions:
        raise HTTPException(status_code=400, detail="No questions available for this category")

    session = MockInterviewSession(
        user_id=current_user.id,
        role_target=request.role_target,
        category=request.category,
        total_questions=len(questions),
        completed_questions=0,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    exchanges: list[MockExchangeResponse] = []
    for q in questions:
        ex = MockInterviewExchange(
            session_id=session.id,
            question=q["question"],
            category=request.category,
            difficulty=q.get("difficulty", "Fresher"),
            ideal_answer=q.get("ideal_answer"),
            communication_tips=q.get("communication_tips"),
        )
        db.add(ex)
        db.commit()
        db.refresh(ex)
        exchanges.append(
            MockExchangeResponse(
                id=ex.id,
                question=ex.question,
                category=ex.category,
                difficulty=ex.difficulty,
                user_answer=None,
                ai_feedback=None,
                score=None,
                ideal_answer=None,  # hidden until answered
                communication_tips=None,
            )
        )

    return MockSessionResponse(
        id=session.id,
        user_id=session.user_id,
        role_target=session.role_target,
        category=session.category,
        total_questions=session.total_questions,
        completed_questions=session.completed_questions,
        overall_score=session.overall_score,
        feedback_summary=session.feedback_summary,
        exchanges=exchanges,
        created_at=session.created_at,
    )


@router.post("/interview/submit-answer", response_model=AnswerEvaluationResponse)
def submit_mock_interview_answer(
    payload: SubmitAnswerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnswerEvaluationResponse:
    session = db.get(MockInterviewSession, payload.session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Interview session not found")

    exchange = db.get(MockInterviewExchange, payload.exchange_id)
    if not exchange or exchange.session_id != session.id:
        raise HTTPException(status_code=404, detail="Interview question not found")

    # Find matching bank question for ideal concepts
    bank_questions = QUESTION_BANKS.get(exchange.category, [])
    matched_q = next((q for q in bank_questions if q["question"] == exchange.question), None)
    key_concepts = matched_q.get("key_concepts", []) if matched_q else ["Definition", "Example", "Usage"]
    ideal_ans = exchange.ideal_answer or (matched_q.get("ideal_answer") if matched_q else "")

    eval_result = evaluate_candidate_answer(
        exchange.question,
        ideal_ans,
        key_concepts,
        payload.user_answer,
    )

    exchange.user_answer = payload.user_answer
    exchange.score = eval_result["score"]
    exchange.ai_feedback = eval_result["ai_feedback"]
    exchange.communication_tips = eval_result["communication_tips"]
    db.commit()

    # Recalculate session progress & overall score
    exchanges = db.scalars(
        select(MockInterviewExchange).where(MockInterviewExchange.session_id == session.id)
    ).all()
    answered = [e for e in exchanges if e.score is not None]
    session.completed_questions = len(answered)
    if answered:
        avg_score = sum(e.score for e in answered) / len(answered)
        session.overall_score = Decimal(f"{avg_score:.1f}")

    is_complete = session.completed_questions >= session.total_questions
    if is_complete and session.overall_score:
        session.feedback_summary = (
            f"Session complete! Overall score: {session.overall_score}/10. "
            f"{'Strong readiness for technical interviews!' if session.overall_score >= 7.0 else 'Review the ideal answers and practice elaborating on code examples.'}"
        )
    db.commit()

    return AnswerEvaluationResponse(
        exchange_id=exchange.id,
        score=eval_result["score"],
        ai_feedback=eval_result["ai_feedback"],
        strengths=eval_result["strengths"],
        improvements=eval_result["improvements"],
        ideal_answer=eval_result["ideal_answer"],
        communication_tips=eval_result["communication_tips"],
        is_session_complete=is_complete,
        session_overall_score=session.overall_score,
    )


@router.get("/interview/sessions", response_model=list[MockSessionResponse])
def get_mock_interview_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MockSessionResponse]:
    sessions = db.scalars(
        select(MockInterviewSession)
        .where(MockInterviewSession.user_id == current_user.id)
        .order_by(MockInterviewSession.created_at.desc())
        .limit(10)
    ).all()

    results: list[MockSessionResponse] = []
    for s in sessions:
        ex_rows = db.scalars(
            select(MockInterviewExchange).where(MockInterviewExchange.session_id == s.id)
        ).all()
        ex_list = [
            MockExchangeResponse(
                id=e.id,
                question=e.question,
                category=e.category,
                difficulty=e.difficulty,
                user_answer=e.user_answer,
                ai_feedback=e.ai_feedback,
                score=e.score,
                ideal_answer=e.ideal_answer if e.user_answer else None,
                communication_tips=e.communication_tips,
            )
            for e in ex_rows
        ]
        results.append(
            MockSessionResponse(
                id=s.id,
                user_id=s.user_id,
                role_target=s.role_target,
                category=s.category,
                total_questions=s.total_questions,
                completed_questions=s.completed_questions,
                overall_score=s.overall_score,
                feedback_summary=s.feedback_summary,
                exchanges=ex_list,
                created_at=s.created_at,
            )
        )
    return results


# -----------------------------------------------------------------------------
# 4. AI Career Assistant & RAG Chat Endpoints
# -----------------------------------------------------------------------------

@router.post("/assistant/chat", response_model=ChatMessageResponse)
def chat_with_career_assistant(
    request: ChatMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatMessageResponse:
    # 1. Save candidate message
    user_msg = ChatMessage(
        user_id=current_user.id,
        role="user",
        agent_type=request.agent_type,
        content=request.message,
    )
    db.add(user_msg)
    db.commit()

    # 2. Run multi-agent orchestrator with RAG
    ai_reply_text = run_career_assistant_agent(
        current_user,
        request.message,
        request.agent_type,
        db,
    )

    # 3. Save assistant reply
    ai_msg = ChatMessage(
        user_id=current_user.id,
        role="assistant",
        agent_type=request.agent_type,
        content=ai_reply_text,
    )
    db.add(ai_msg)
    db.commit()
    db.refresh(ai_msg)

    return ChatMessageResponse(
        id=ai_msg.id,
        role=ai_msg.role,
        agent_type=ai_msg.agent_type,
        content=ai_msg.content,
        created_at=ai_msg.created_at,
    )


@router.post("/assistant/chat-upload", response_model=ChatMessageResponse)
def chat_with_career_assistant_upload(
    message: str = Form(default=""),
    agent_type: str = Form(default="general"),
    file: UploadFile | None = File(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatMessageResponse:
    attached_filename: str | None = None
    attached_content: str | None = None

    if file is not None and getattr(file, "filename", None):
        attached_filename = Path(file.filename or "").name
        content_bytes = (
            file.file.read(5 * 1024 * 1024)
            if hasattr(file, "file") and hasattr(file.file, "read")
            else file.read(5 * 1024 * 1024)
        )
        ext = Path(attached_filename).suffix.lower()
        if ext in (".pdf", ".docx"):
            attached_content = parse_resume_content(attached_filename, content_bytes)
        else:
            attached_content = content_bytes.decode("utf-8", errors="ignore")

    user_display_msg = message.strip()
    if attached_filename:
        if user_display_msg:
            user_display_msg = f"📄 Attached: {attached_filename}\n\n{user_display_msg}"
        else:
            user_display_msg = f"📄 Attached: {attached_filename}\n\nPlease review this document and provide career and role insights."
    elif not user_display_msg:
        user_display_msg = "Hello AI Career Assistant!"

    # 1. Save candidate message with attachment label
    user_msg = ChatMessage(
        user_id=current_user.id,
        role="user",
        agent_type=agent_type,
        content=user_display_msg,
    )
    db.add(user_msg)
    db.commit()

    # 2. Run multi-agent orchestrator with document context
    ai_reply_text = run_career_assistant_agent(
        current_user,
        message.strip() or "Please analyze this uploaded document.",
        agent_type,
        db,
        attached_filename=attached_filename,
        attached_content=attached_content,
    )

    # 3. Save assistant reply
    ai_msg = ChatMessage(
        user_id=current_user.id,
        role="assistant",
        agent_type=agent_type,
        content=ai_reply_text,
    )
    db.add(ai_msg)
    db.commit()
    db.refresh(ai_msg)

    return ChatMessageResponse(
        id=ai_msg.id,
        role=ai_msg.role,
        agent_type=ai_msg.agent_type,
        content=ai_msg.content,
        created_at=ai_msg.created_at,
    )


@router.get("/assistant/history", response_model=list[ChatMessageResponse])
def get_career_assistant_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ChatMessage]:
    return db.scalars(
        select(ChatMessage)
        .where(ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.created_at.asc())
        .limit(50)
    ).all()


@router.delete("/assistant/history", status_code=status.HTTP_204_NO_CONTENT)
def clear_career_assistant_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    db.execute(delete(ChatMessage).where(ChatMessage.user_id == current_user.id))
    db.commit()
