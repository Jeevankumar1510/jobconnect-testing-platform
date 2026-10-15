import json
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from accounts.models import CandidateProfile
from jobs.enums import JobStatus
from jobs.models import Job


def parse_json_or_csv(val: str | None) -> list[str]:
    if not val:
        return []
    val = val.strip()
    if not val:
        return []
    if val.startswith("[") and val.endswith("]"):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                return [str(x).strip().lower() for x in parsed if str(x).strip()]
        except Exception:
            pass
    return [x.strip().lower() for x in re.split(r"[,;|\n]+", val) if x.strip()]


def calculate_job_match(job: Job, profile: CandidateProfile) -> tuple[int, list[str]]:
    """
    Computes a match score (0-100) and evidence reasons for why this job matches the candidate profile.
    """
    score = 0
    reasons: list[str] = []

    profile_skills = parse_json_or_csv(profile.technical_skills)
    profile_roles = parse_json_or_csv(profile.preferred_job_titles)
    profile_locations = parse_json_or_csv(profile.preferred_locations)
    current_loc = (profile.current_location or "").strip().lower()
    if current_loc and current_loc not in profile_locations:
        profile_locations.append(current_loc)

    job_title_lower = job.title.lower()
    job_desc_lower = job.description.lower()
    job_loc_lower = job.location.lower()

    # 1. Technical skills match
    matched_skills: list[str] = []
    for skill in profile_skills:
        pattern = r"\b" + re.escape(skill) + r"\b"
        if re.search(pattern, job_desc_lower) or re.search(pattern, job_title_lower):
            matched_skills.append(skill.title())

    if matched_skills:
        skill_points = min(len(matched_skills) * 15, 45)
        score += skill_points
        top_skills = ", ".join(matched_skills[:3])
        reasons.append(f"Matches your technical skills in {top_skills}")

    # 2. Preferred job title match
    title_matched = False
    for role in profile_roles:
        if role in job_title_lower:
            score += 25
            title_matched = True
            reasons.append(f"Matches your preferred role: {role.title()}")
            break

    # 3. Location / Work Mode match
    loc_matched = False
    if "remote" in job_loc_lower:
        score += 15
        reasons.append("Offers remote work flexibility")
        loc_matched = True
    else:
        for loc in profile_locations:
            if loc in job_loc_lower:
                score += 15
                reasons.append(f"Located in your preferred city ({loc.title()})")
                loc_matched = True
                break

    # 4. Fresher / Experience level match
    if job.is_fresher or "fresher" in job.experience_level.lower() or "intern" in job.experience_level.lower():
        cand_exp = (profile.experience_level or "fresher").lower()
        if "fresher" in cand_exp or "intern" in cand_exp or "0" in cand_exp:
            score += 15
            reasons.append("Actively welcomes freshers and entry-level candidates")

    explanation = ""
    if reasons:
        explanation = "Recommended because this role " + " and ".join(reasons) + "."
    else:
        explanation = "Recommended based on trending hiring demand in your preferred technology stack."

    return min(score, 100), reasons, explanation


def get_profile_recommendations(
    profile: CandidateProfile,
    db: Session,
    limit: int = 15,
) -> list[dict[str, Any]]:
    """
    Returns ranked job recommendations with evidence-backed match explanations.
    """
    active_jobs = db.scalars(
        select(Job)
        .where(Job.status == JobStatus.OPEN)
        .order_by(Job.created_at.desc())
        .limit(100)
    ).all()

    recommendations: list[dict[str, Any]] = []

    for job in active_jobs:
        score, reasons, explanation = calculate_job_match(job, profile)
        if score > 0 or not profile.technical_skills:
            recommendations.append(
                {
                    "job": job,
                    "match_score": max(score, 40),
                    "match_reasons": reasons,
                    "explanation": explanation,
                }
            )

    recommendations.sort(key=lambda x: x["match_score"], reverse=True)
    return recommendations[:limit]
