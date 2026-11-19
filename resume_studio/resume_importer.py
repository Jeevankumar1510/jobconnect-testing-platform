import re
from typing import Any
from ai.services.resume_parser import (
    clean_and_normalize_resume_text,
    extract_contact_info,
    parse_resume_content,
)
from ai.services.ats_analyzer import (
    parse_experience_section,
    parse_projects_section,
    parse_education_section,
)
from resume_studio.schemas import (
    ResumeDataSchema,
    PersonalInfoSchema,
    SkillCategorySchema,
    EducationRecordSchema,
    ProjectRecordSchema,
    InternshipRecordSchema,
    CertificationRecordSchema,
    ImportResumeResponse,
)


def import_and_extract_resume(filename: str, file_bytes: bytes) -> ImportResumeResponse:
    """
    Parses an uploaded PDF or DOCX resume and extracts structured records into ResumeDataSchema.
    Does not invent fake information; extracts existing data with high accuracy.
    """
    extraction_notes: list[str] = []

    # 1. Parse raw text from PDF or DOCX
    raw_text = parse_resume_content(filename, file_bytes)
    if not raw_text or len(raw_text.strip()) < 30:
        return ImportResumeResponse(
            success=False,
            resume_name=filename,
            extracted_data=ResumeDataSchema(),
            extraction_notes=["Text extraction yielded insufficient content. Scanned document without OCR or corrupted stream."],
        )

    cleaned = clean_and_normalize_resume_text(raw_text)
    extraction_notes.append(f"Successfully extracted {len(cleaned.split())} words from {filename}.")

    # 2. Extract Contact Info
    contact = extract_contact_info(cleaned)
    lines = [l.strip() for l in cleaned.split("\n") if l.strip()]

    # Name and Title inference
    first_line = lines[0] if lines else "Candidate Name"
    second_line = lines[1] if len(lines) > 1 and "@" not in lines[1] and len(lines[1].split()) <= 6 else None

    name = contact.get("candidate_name") or first_line
    headline = second_line or ""

    personal_info = PersonalInfoSchema(
        full_name=name,
        headline=headline,
        email=contact.get("email") or "",
        phone=contact.get("phone") or "",
        location=contact.get("location") or "",
        linkedin_url=contact.get("linkedin") if contact.get("linkedin") and "http" in contact.get("linkedin") else None,
        github_url=contact.get("github") if contact.get("github") and "http" in contact.get("github") else None,
        portfolio_url=contact.get("portfolio"),
    )
    extraction_notes.append(f"Identified contact details for '{name}'.")

    # 3. Segment by section
    SECTION_HEADERS = [
        "PROFESSIONAL SUMMARY", "SUMMARY", "CAREER OBJECTIVE", "OBJECTIVE",
        "TECHNICAL SKILLS", "SKILLS", "TECHNOLOGIES",
        "INTERNSHIP EXPERIENCE", "WORK EXPERIENCE", "EXPERIENCE", "EMPLOYMENT",
        "PROJECTS", "TECHNICAL PROJECTS", "ACADEMIC PROJECTS",
        "EDUCATION", "ACADEMIC BACKGROUND",
        "CERTIFICATIONS", "LICENSES & CERTIFICATIONS",
        "ACHIEVEMENTS", "AWARDS",
    ]

    def is_sec_header(l: str) -> str | None:
        norm = l.replace(":", "").replace("#", "").strip().upper()
        for h in SECTION_HEADERS:
            if norm == h or norm.startswith(h + " "):
                return h
        return None

    current_sec = "HEADER"
    sections: dict[str, list[str]] = {current_sec: []}

    for l in lines:
        matched_h = is_sec_header(l)
        if matched_h:
            current_sec = matched_h
            if current_sec not in sections:
                sections[current_sec] = []
        else:
            sections[current_sec].append(l)

    # Career Objective / Summary
    summary_lines = (
        sections.get("PROFESSIONAL SUMMARY", [])
        or sections.get("CAREER OBJECTIVE", [])
        or sections.get("SUMMARY", [])
        or sections.get("OBJECTIVE", [])
    )
    career_objective = " ".join(summary_lines).strip()
    if career_objective:
        extraction_notes.append("Extracted professional summary / career objective.")

    # Technical Skills
    skills_lines = sections.get("TECHNICAL SKILLS", []) or sections.get("SKILLS", []) or sections.get("TECHNOLOGIES", [])
    skill_categories: list[SkillCategorySchema] = []
    
    for sl in skills_lines:
        if ":" in sl:
            cat, val_str = sl.split(":", 1)
            sk_list = [s.strip("•-* ,") for s in re.split(r"[,|•]", val_str) if s.strip("•-* ,")]
            if sk_list:
                skill_categories.append(SkillCategorySchema(category=cat.strip(), skills=sk_list))
        else:
            sk_list = [s.strip("•-* ,") for s in re.split(r"[,|•]", sl) if s.strip("•-* ,")]
            if sk_list:
                skill_categories.append(SkillCategorySchema(category="Core Skills", skills=sk_list))

    if skill_categories:
        total_sk = sum(len(c.skills) for c in skill_categories)
        extraction_notes.append(f"Categorized {total_sk} technical skills across {len(skill_categories)} skill groups.")

    # Education
    edu_lines = sections.get("EDUCATION", []) or sections.get("ACADEMIC BACKGROUND", [])
    parsed_edu = parse_education_section(edu_lines)
    education_records = [
        EducationRecordSchema(
            degree=e.get("degree", ""),
            institution=e.get("institution", ""),
            graduation_date=e.get("dates", ""),
            score=e.get("score", ""),
        )
        for e in parsed_edu
    ]
    if education_records:
        extraction_notes.append(f"Extracted {len(education_records)} education credentials.")

    # Projects
    proj_lines = sections.get("PROJECTS", []) or sections.get("TECHNICAL PROJECTS", [])
    parsed_proj = parse_projects_section(proj_lines)
    project_records = [
        ProjectRecordSchema(
            title=p.get("title", ""),
            tech_stack=p.get("tech_stack", ""),
            github_url=p.get("link", ""),
            bullets=p.get("bullets", []),
        )
        for p in parsed_proj
    ]
    if project_records:
        extraction_notes.append(f"Extracted {len(project_records)} technical projects.")

    # Internships & Experience
    exp_lines = (
        sections.get("INTERNSHIP EXPERIENCE", [])
        or sections.get("WORK EXPERIENCE", [])
        or sections.get("EXPERIENCE", [])
        or sections.get("EMPLOYMENT", [])
    )
    parsed_exp = parse_experience_section(exp_lines)
    internship_records = [
        InternshipRecordSchema(
            role=e.get("title", ""),
            organization=e.get("company", ""),
            duration=e.get("dates", ""),
            location=e.get("location", ""),
            bullets=e.get("bullets", []),
        )
        for e in parsed_exp
    ]
    if internship_records:
        extraction_notes.append(f"Extracted {len(internship_records)} experience/internship entries.")

    # Certifications
    cert_lines = sections.get("CERTIFICATIONS", []) or sections.get("LICENSES & CERTIFICATIONS", [])
    cert_records = []
    for cl in cert_lines:
        clean_cl = cl.lstrip("•-* >").strip()
        if clean_cl:
            cert_records.append(CertificationRecordSchema(name=clean_cl))
    if cert_records:
        extraction_notes.append(f"Extracted {len(cert_records)} certifications.")

    resume_data = ResumeDataSchema(
        personal_info=personal_info,
        career_objective=career_objective,
        technical_skills=skill_categories,
        education=education_records,
        projects=project_records,
        internships=internship_records,
        certifications=cert_records,
    )

    detected_role = headline or (project_records[0].title if project_records else "Software Engineer")

    return ImportResumeResponse(
        success=True,
        resume_name=filename.rsplit(".", 1)[0].replace("_", " ").title(),
        detected_target_role=detected_role,
        extracted_data=resume_data,
        extraction_notes=extraction_notes,
    )
