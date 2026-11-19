import os
import re
from pathlib import Path
from typing import Any
from resume_studio.templates.registry import BUILTIN_TEMPLATES
from resume_studio.templates.html_renderers import render_template_html
from resume_studio.templates.docx_renderers import render_template_docx
from resume_studio.schemas import (
    ResumeDataSchema,
    PersonalInfoSchema,
    SkillCategorySchema,
    EducationRecordSchema,
    ProjectRecordSchema,
    InternshipRecordSchema,
    CertificationRecordSchema,
    TemplateResponse,
)

# Demo resume data used for template preview cards
DEMO_PREVIEW_DATA = ResumeDataSchema(
    personal_info=PersonalInfoSchema(
        full_name="Alex Morgan",
        headline="Full-Stack Cloud & Automation Engineer",
        email="alex.morgan@example.com",
        phone="+91 98765 43210",
        location="Bengaluru, India",
        linkedin_url="https://linkedin.com/in/alexmorgan",
        github_url="https://github.com/alexmorgan",
    ),
    career_objective="Computer Science graduate specialized in cloud-native microservices, automated testing, and scalable backend architectures. Committed to high-velocity software engineering.",
    technical_skills=[
        SkillCategorySchema(category="Languages", skills=["Python", "TypeScript", "SQL"]),
        SkillCategorySchema(category="Frameworks & Testing", skills=["FastAPI", "React", "Pytest"]),
        SkillCategorySchema(category="Cloud & DevOps", skills=["AWS (EC2, S3, Lambda)", "Docker", "GitHub Actions"]),
    ],
    education=[
        EducationRecordSchema(
            degree="B.Tech in Computer Science & Engineering",
            institution="National Institute of Technology",
            graduation_date="2022 - 2026",
            score="CGPA: 8.8 / 10",
        )
    ],
    projects=[
        ProjectRecordSchema(
            title="Distributed Cloud Telemetry Pipeline",
            tech_stack="Python, FastAPI, Redis, Docker",
            github_url="github.com/alexmorgan/telemetry",
            bullets=[
                "Engineered asynchronous event-driven telemetry ingest processing 10,000+ RPS with 99.9% uptime.",
                "Automated end-to-end regression validation suites reducing test latency by 45%.",
            ],
        )
    ],
    internships=[
        InternshipRecordSchema(
            role="Cloud Engineering Intern",
            organization="CloudScale Systems",
            duration="Feb 2024 - Aug 2024",
            location="Bengaluru",
            bullets=[
                "Automated AWS provisioning workflows across S3, Lambda, and IAM roles.",
                "Spearheaded deployment automation reducing build execution time by 35%.",
            ],
        )
    ],
    certifications=[
        CertificationRecordSchema(name="AWS Certified Cloud Practitioner", organization="Amazon Web Services", completion_date="2024")
    ],
)


def _classify_template(stem: str) -> dict[str, str]:
    """
    Intelligently parses template filename into clean display name,
    category, badge, accent color, and typography.
    Supports filenames like:
      - '01_Google_SWE' -> 'Google SWE'
      - '02_Amazon_SDE' -> 'Amazon SDE'
      - '11_Flipkart_SDE' -> 'Flipkart SDE'
      - 'minimal-ats' -> 'Minimal ATS'
    """
    clean_name = re.sub(r"^\d+_", "", stem).replace("_", " ").replace("-", " ").strip().title()

    lower = clean_name.lower()
    category = "Specialized Roles"
    badge = "ATS Optimized"
    accent_color = "#0f172a"
    font_family = "Inter"

    if "google" in lower:
        category = "FAANG & Big Tech"
        badge = "Google Standard"
        accent_color = "#1a73e8"
        font_family = "Roboto"
    elif "amazon" in lower:
        category = "FAANG & Big Tech"
        badge = "Amazon SDE"
        accent_color = "#232f3e"
        font_family = "Arial"
    elif "meta" in lower:
        category = "FAANG & Big Tech"
        badge = "Meta SWE"
        accent_color = "#0081fb"
        font_family = "Inter"
    elif "apple" in lower:
        category = "FAANG & Big Tech"
        badge = "Apple Design"
        accent_color = "#1d1d1f"
        font_family = "Inter"
    elif "microsoft" in lower:
        category = "FAANG & Big Tech"
        badge = "Microsoft SDE"
        accent_color = "#0078d4"
        font_family = "Segoe UI"
    elif "netflix" in lower:
        category = "FAANG & Big Tech"
        badge = "Netflix Senior"
        accent_color = "#e50914"
        font_family = "Inter"
    elif any(k in lower for k in ["flipkart", "razorpay", "swiggy", "zomato", "phonepe", "paytm", "cred", "atlassian", "uber", "freshworks", "dream11", "zerodha"]):
        category = "Top Unicorns"
        badge = "Unicorn Scale"
        accent_color = "#0284c7"
        font_family = "Inter"
    elif any(k in lower for k in ["tcs", "infosys", "wipro", "cognizant", "capgemini", "deloitte", "accenture", "fresher", "career switcher"]):
        category = "Freshers & IT Services"
        badge = "Campus & Fresher"
        accent_color = "#0f766e"
        font_family = "Inter"
    elif any(k in lower for k in ["data", "analyst", "scientist", "ml", "machine learning", "ai"]):
        category = "Data & AI"
        badge = "AI & Analytics"
        accent_color = "#4f46e5"
        font_family = "Inter"
    elif any(k in lower for k in ["product", "pm", "business", "mba", "marketing"]):
        category = "Product & Business"
        badge = "Product Leader"
        accent_color = "#7c3aed"
        font_family = "Inter"

    return {
        "name": clean_name,
        "category": category,
        "badge": badge,
        "accent_color": accent_color,
        "font_family": font_family,
    }


# In-memory template cache for sub-millisecond retrieval
_CACHED_TEMPLATES: list[TemplateResponse] | None = None


def get_all_templates(force_reload: bool = False) -> list[TemplateResponse]:
    """
    Returns the catalog of all templates, combining built-in templates
    with any custom templates (.pdf, .html, .htm) uploaded to
    resume_studio/templates/ or templates/resumes/.
    """
    global _CACHED_TEMPLATES
    if _CACHED_TEMPLATES is not None and not force_reload:
        return _CACHED_TEMPLATES

    templates: list[TemplateResponse] = []

    # 1. Built-in templates
    for t in BUILTIN_TEMPLATES:
        preview_html = render_template_html(DEMO_PREVIEW_DATA, template_id=t["id"])
        templates.append(
            TemplateResponse(
                id=t["id"],
                template_name=t["template_name"],
                category=t["category"],
                description=t["description"],
                badge=t["badge"],
                accent_color=t["accent_color"],
                font_family=t["font_family"],
                is_single_column=t["is_single_column"],
                preview_html=preview_html,
                is_active=t["is_active"],
            )
        )

    # 2. Dynamic Discovery of User-Uploaded Templates (.pdf, .html, .htm)
    scan_dirs = [
        Path(__file__).resolve().parent / "templates",
        Path(__file__).resolve().parent.parent / "templates" / "resumes",
    ]

    discovered_ids = {t["id"] for t in BUILTIN_TEMPLATES}

    for s_dir in scan_dirs:
        if s_dir.exists() and s_dir.is_dir():
            # Sort files so 01_Google_SWE appears before 100_Portfolio_Creative
            sorted_files = sorted(
                list(s_dir.iterdir()),
                key=lambda x: (
                    int(re.match(r"^(\d+)", x.stem).group(1))
                    if re.match(r"^(\d+)", x.stem)
                    else 9999,
                    x.name.lower()
                )
            )

            for f in sorted_files:
                ext = f.suffix.lower()
                if not f.is_file() or ext not in [".pdf", ".html", ".htm"]:
                    continue

                stem = f.stem
                tid = stem.lower().replace("_", "-").replace(" ", "-")
                if tid in discovered_ids:
                    continue

                discovered_ids.add(tid)
                classified = _classify_template(stem)

                # Render preview HTML using the template's designated style
                if ext in [".html", ".htm"]:
                    try:
                        raw_preview = f.read_text(encoding="utf-8", errors="ignore")
                    except Exception:
                        raw_preview = render_template_html(DEMO_PREVIEW_DATA, template_id=tid)
                else:
                    # PDF template: render live preview formatted with company ATS styling
                    raw_preview = render_template_html(DEMO_PREVIEW_DATA, template_id=tid)

                templates.append(
                    TemplateResponse(
                        id=tid,
                        template_name=classified["name"],
                        category=classified["category"],
                        description=f"ATS single-page format calibrated for {classified['name']} standards.",
                        badge=classified["badge"],
                        accent_color=classified["accent_color"],
                        font_family=classified["font_family"],
                        is_single_column=True,
                        preview_html=raw_preview,
                        is_active=True,
                    )
                )

    _CACHED_TEMPLATES = templates
    return templates


def get_template_by_id(template_id: str) -> TemplateResponse | None:
    all_t = get_all_templates()
    for t in all_t:
        if t.id == template_id:
            return t
    # Fallback to first template or modern-professional
    return all_t[0] if all_t else None
