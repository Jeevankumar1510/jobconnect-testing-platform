import json
import logging
import os
import re
import urllib.request
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from accounts.models import CandidateProfile, User
from ai.models import ResumeAnalysis, SkillRoadmap
from ai.services.ats_analyzer import extract_skills_from_text
from ai.services.skill_gap import ROLE_REQUIREMENTS, analyze_skill_gap
from applications.models import Application
from jobs.enums import JobStatus
from jobs.models import Job

logger = logging.getLogger(__name__)


def build_rag_context(user: User, db: Session) -> dict[str, Any]:
    """
    Assembles contextual data across Candidate Profile, Resume, Applications, and Live Jobs.
    """
    profile = db.scalar(select(CandidateProfile).where(CandidateProfile.user_id == user.id))
    resume_analysis = db.scalar(
        select(ResumeAnalysis)
        .where(ResumeAnalysis.user_id == user.id)
        .order_by(ResumeAnalysis.created_at.desc())
        .limit(1)
    )
    user_apps = db.scalars(
        select(Application).where(Application.candidate_id == user.id).limit(10)
    ).all()
    apps_data = []
    for app in user_apps:
        job = db.get(Job, app.job_id)
        if job:
            apps_data.append({
                "job_title": job.title,
                "company": job.company,
                "status": app.status.value if hasattr(app.status, "value") else str(app.status),
                "applied_at": app.applied_at.isoformat() if app.applied_at else "Recently",
            })

    # Sample top live fresher tech jobs
    open_jobs = db.scalars(
        select(Job)
        .where(Job.status == JobStatus.OPEN, Job.is_fresher == True)
        .order_by(Job.created_at.desc())
        .limit(15)
    ).all()
    jobs_sample = [
        {
            "id": j.id,
            "title": j.title,
            "company": j.company,
            "location": j.location,
            "skills": j.title + " " + (j.description[:120] if j.description else ""),
        }
        for j in open_jobs
    ]

    return {
        "user_email": user.email,
        "headline": user.headline or "Aspiring Software Engineer",
        "profile": {
            "full_name": profile.full_name if profile else None,
            "skills": profile.technical_skills if profile else None,
            "preferred_roles": profile.preferred_job_titles if profile else None,
            "preferred_locations": profile.preferred_locations if profile else None,
            "education": profile.education if profile else None,
            "experience_level": profile.experience_level if profile else "fresher",
        },
        "resume": {
            "ats_score": resume_analysis.ats_score if resume_analysis else None,
            "extracted_skills": json.loads(resume_analysis.extracted_skills) if resume_analysis and resume_analysis.extracted_skills else [],
            "missing_skills": json.loads(resume_analysis.missing_skills) if resume_analysis and resume_analysis.missing_skills else [],
            "strengths": json.loads(resume_analysis.strengths) if resume_analysis and resume_analysis.strengths else [],
        },
        "applications": apps_data,
        "recent_jobs": jobs_sample,
    }


def call_gemini_api(prompt: str, system_context: str) -> str | None:
    """
    Calls Google Gemini API via REST if GEMINI_API_KEY is present in environment.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    payload = {
        "system_instruction": {"parts": [{"text": system_context}]},
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 1024},
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            candidates = res_data.get("candidates", [])
            if candidates:
                text_part = candidates[0].get("content", {}).get("parts", [{}])[0].get("text")
                if text_part:
                    return text_part.strip()
    except Exception as exc:
        logger.warning("Gemini API call failed, falling back to local orchestrator: %s", exc)
    return None


# -----------------------------------------------------------------------------
# Specialized Multi-Agent Handlers
# -----------------------------------------------------------------------------

def agent_resume_specialist(message: str, context: dict[str, Any]) -> str:
    resume = context.get("resume", {})
    ats_score = resume.get("ats_score")
    extracted_skills = resume.get("extracted_skills", [])
    strengths = resume.get("strengths", [])

    if "ats" in message.lower() or "score" in message.lower() or "improve" in message.lower():
        score_text = f"Your latest resume ATS compatibility score is **{ats_score}/100**." if ats_score else "You haven't analyzed your resume yet."
        return (
            f"### 📄 Resume Intelligence & ATS Breakdown\n\n"
            f"{score_text}\n\n"
            f"**Key Strategies to Maximize Your ATS Score:**\n"
            f"1. **Use Standard Headings:** Ensure clear sections: *Technical Skills*, *Projects*, *Education*, and *Certifications*.\n"
            f"2. **Quantify Project Impact:** Replace generic bullets like *'Worked on frontend'* with *'Developed responsive React dashboard handling 5,000+ daily requests with 98+ Lighthouse score'*.\n"
            f"3. **Incorporate Industry Keywords:** ATS systems prioritize hard skills (e.g. `Python`, `FastAPI`, `PostgreSQL`, `Docker`, `Git`).\n"
            f"4. **Keep Formatting Clean:** Single-column layout, standard fonts (Inter, Arial, Calibri), no text tables or images for text.\n\n"
            f"*Tip: You can use our **AI Resume Analyzer** tab to run a real-time scan and compare your resume with any job!*"
        )
    return (
        f"### 📄 Resume Analysis Summary\n\n"
        f"- **Detected Skills:** {', '.join(extracted_skills[:10]) if extracted_skills else 'No skills extracted yet.'}\n"
        f"- **ATS Score:** {ats_score or 'Not evaluated'}/100\n\n"
        f"**Next Steps:** Upload your updated PDF or DOCX resume in the **Resume Analyzer** page to generate a complete gap report."
    )


def agent_job_matching(message: str, context: dict[str, Any], db: Session) -> str:
    user_skills = context.get("resume", {}).get("extracted_skills", [])
    profile_skills_str = context.get("profile", {}).get("skills", "")
    if profile_skills_str:
        user_skills.extend([s.strip() for s in profile_skills_str.split(",") if s.strip()])

    recent_jobs = context.get("recent_jobs", [])
    matched_jobs: list[dict[str, Any]] = []

    for j in recent_jobs:
        score = 0
        j_skills = j.get("skills", "").lower()
        matched = []
        for s in user_skills:
            if s.lower() in j_skills:
                score += 1
                matched.append(s)
        if score > 0 or len(matched_jobs) < 3:
            matched_jobs.append({"job": j, "matched_skills": matched, "score": score})

    matched_jobs.sort(key=lambda x: x["score"], reverse=True)
    top_matches = matched_jobs[:4]

    response_lines = ["### 🎯 Recommended Job Matches for Your Profile\n"]
    if top_matches:
        for m in top_matches:
            job = m["job"]
            matched_str = f" (Matches: {', '.join(m['matched_skills'][:3])})" if m["matched_skills"] else ""
            response_lines.append(
                f"- **[{job['title']}](file:///jobs/{job['id']})** at **{job['company']}** ({job['location']}){matched_str}\n"
                f"  *Eligible for Freshers & Entry-Level Talent.*"
            )
        response_lines.append("\n*Click on any job to view detailed requirements, ATS alignment, and apply!*")
    else:
        response_lines.append("No direct skill matches found among currently trending jobs. Update your technical skills in your profile to discover matching opportunities!")

    return "\n".join(response_lines)


def agent_career_guidance(message: str, context: dict[str, Any]) -> str:
    clean_msg = message.lower()
    target_role = "Python Backend Developer"
    if "react" in clean_msg or "frontend" in clean_msg:
        target_role = "Frontend React Developer"
    elif "ai" in clean_msg or "ml" in clean_msg or "machine learning" in clean_msg or "data" in clean_msg:
        target_role = "AI / Machine Learning Engineer"
    elif "full stack" in clean_msg or "fullstack" in clean_msg:
        target_role = "Full Stack Software Engineer"

    user_skills = context.get("resume", {}).get("extracted_skills", [])
    gap_result = analyze_skill_gap(user_skills, target_role)

    missing = gap_result.get("missing_skills", [])
    roadmap = gap_result.get("roadmap_steps", [])
    projects = gap_result.get("recommended_projects", [])

    lines = [
        f"### 🚀 Career Roadmap & Skill Gap: {gap_result['target_role']}\n",
        f"**Skill Readiness:** `{gap_result['progress_percentage']}%` matching requirements.\n",
    ]
    if missing:
        lines.append(f"**Priority Skills to Learn:** {', '.join(missing[:6])}\n")

    lines.append("#### 📅 30-Day Milestone Learning Plan:")
    for step in roadmap:
        lines.append(f"- **{step['milestone']}: {step['title']}**\n  {step['description']} *(Topics: {', '.join(step['topics'][:3])})*")

    if projects:
        p = projects[0]
        lines.append(f"\n#### 💡 Recommended Portfolio Project:\n**{p['title']}** ({p['tagline']})\n- *Stack:* {', '.join(p['tech_stack'])}\n- *Impact:* {p['resume_bullet']}")

    return "\n".join(lines)


def agent_interview_coach(message: str) -> str:
    msg_lower = message.lower()
    topic = "Python"
    if "sql" in msg_lower:
        topic = "SQL"
    elif "react" in msg_lower or "frontend" in msg_lower:
        topic = "React"
    elif "aws" in msg_lower or "cloud" in msg_lower:
        topic = "AWS"
    elif "ai" in msg_lower or "ml" in msg_lower or "rag" in msg_lower:
        topic = "AI/ML"
    elif "hr" in msg_lower or "behavioral" in msg_lower:
        topic = "HR"

    return (
        f"### 🎙️ AI Interview Coaching: {topic}\n\n"
        f"**Top Fresher Interview Questions for {topic}:**\n"
        f"1. *Explain core concepts clearly with real-world examples rather than memorized definitions.*\n"
        f"2. *Structure your answer using the **Definition ➔ Working Mechanism ➔ Real-world Use Case ➔ Trade-off** framework.*\n\n"
        f"**Interview Practice Tip:** Head over to our dedicated **Interview Prep** tab where you can take interactive mock interviews with real-time AI scoring (0–10) and instant feedback!"
    )


def agent_application_assistant(message: str, context: dict[str, Any]) -> str:
    apps = context.get("applications", [])
    if not apps:
        return (
            "### 📋 Application Tracker Status\n\n"
            "You haven't submitted or tracked any job applications yet.\n\n"
            "**Next Step:** Browse the **Jobs** feed, apply directly or track your external applications to get automated reminders and interview alerts!"
        )

    lines = ["### 📋 Your Active Applications Summary\n"]
    for a in apps[:5]:
        lines.append(f"- **{a['job_title']}** at **{a['company']}** — Status: `{a['status'].upper()}` ({a['applied_at']})")
    lines.append("\n*Recruiters update candidate stages directly. Keep your resume up to date to increase callback rates!*")
    return "\n".join(lines)


def run_career_assistant_agent(
    user: User,
    message: str,
    agent_type: str,
    db: Session,
    attached_filename: str | None = None,
    attached_content: str | None = None,
) -> str:
    """
    RAG Multi-Agent Orchestrator: routes query to the best specialized agent,
    utilizing Gemini if available, or deterministic expert agent responses.
    Supports attached documents (e.g. resumes, job descriptions).
    """
    context = build_rag_context(user, db)

    doc_tech: list[str] = []
    doc_soft: list[str] = []
    if attached_content:
        from ai.services.ats_analyzer import extract_skills_from_text
        doc_tech, doc_soft = extract_skills_from_text(attached_content)
        context["attached_document"] = {
            "filename": attached_filename or "document.pdf",
            "content": attached_content[:3000],
            "skills": doc_tech,
            "soft_skills": doc_soft,
        }
        # Enrich user skills in context with skills detected in the uploaded file
        if doc_tech:
            existing_skills = context.get("resume", {}).get("extracted_skills", [])
            context["resume"]["extracted_skills"] = sorted(list(set(existing_skills + doc_tech)))

    # 1. Try Gemini API with full RAG context if key is present
    if os.environ.get("GEMINI_API_KEY"):
        doc_context = ""
        if attached_content:
            doc_context = f"\nUser Uploaded Document ({attached_filename or 'document'}):\n{attached_content[:2500]}\n"
        system_context = (
            "You are the AI Career Assistant for JobConnect, an Indian IT fresher and entry-level recruitment portal. "
            f"Candidate Info: Email={user.email}, Headline={context['headline']}, "
            f"Skills={context['profile']['skills']}, Target Roles={context['profile']['preferred_roles']}. "
            f"Resume ATS Score={context['resume']['ats_score']}, Resume Skills={context['resume']['extracted_skills']}. "
            f"Applications: {json.dumps(context['applications'])}. "
            f"Live Jobs available: {json.dumps(context['recent_jobs'])}. "
            f"{doc_context}"
            "Give practical, actionable, encouraging advice formatted cleanly in Markdown."
        )
        gemini_response = call_gemini_api(message, system_context)
        if gemini_response:
            return gemini_response

    # 2. Local Multi-Agent Orchestrator Routing
    clean_msg = message.lower()
    selected_agent = agent_type

    doc_header = ""
    if attached_content:
        doc_header = (
            f"### 📄 Document Attached: `{attached_filename or 'Uploaded File'}`\n"
            f"- **Extracted Technical Keywords ({len(doc_tech)}):** {', '.join(doc_tech[:10]) if doc_tech else 'None detected'}\n"
            f"- **Extracted Soft Skills:** {', '.join(doc_soft[:5]) if doc_soft else 'Standard interpersonal skills'}\n\n"
        )

    if selected_agent == "general":
        if any(w in clean_msg for w in ["resume", "ats", "cv", "score", "document"]):
            selected_agent = "resume"
        elif any(w in clean_msg for w in ["job", "match", "openings", "vacancies", "recommend"]):
            selected_agent = "job"
        elif any(w in clean_msg for w in ["learn", "roadmap", "skill", "projects", "gap", "study", "30-day"]):
            selected_agent = "career"
        elif any(w in clean_msg for w in ["interview", "mock", "question", "hr", "answer", "coding"]):
            selected_agent = "interview"
        elif any(w in clean_msg for w in ["application", "status", "applied", "applied jobs"]):
            selected_agent = "application"
        elif attached_content:
            # If user attached a document without a specific query, route to resume specialist
            selected_agent = "resume"

    if selected_agent == "resume":
        reply = agent_resume_specialist(message, context)
    elif selected_agent == "job":
        reply = agent_job_matching(message, context, db)
    elif selected_agent == "career":
        reply = agent_career_guidance(message, context)
    elif selected_agent == "interview":
        reply = agent_interview_coach(message)
    elif selected_agent == "application":
        reply = agent_application_assistant(message, context)
    else:
        # General synthesis
        reply = (
            f"### 🤖 JobConnect AI Career Copilot\n\n"
            f"Hello! I am your AI Career Copilot. I can help you with:\n"
            f"- **Resume Intelligence:** Check your ATS compatibility score and get improvement tips.\n"
            f"- **Job Recommendations:** Find freshers-friendly jobs that match your exact skillset.\n"
            f"- **Skill Gap & Roadmap:** Get a 30-day learning milestone roadmap and recommended portfolio projects.\n"
            f"- **Mock Interview Prep:** Practice technical questions across Python, SQL, Java, AWS, and HR.\n"
            f"- **Application Tracking:** Track your progress across all applied companies.\n\n"
            f"*Try asking: 'Which jobs match my resume?' or 'What skills do I need for Python backend?'*"
        )

    return f"{doc_header}{reply}" if doc_header else reply
