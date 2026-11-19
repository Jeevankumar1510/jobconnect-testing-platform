from resume_studio.schemas import ResumeDataSchema, FormattingConfigSchema
from resume_studio.templates.html_renderers import render_template_html
from resume_studio.templates.docx_renderers import render_template_docx


def generate_resume_html(
    data: ResumeDataSchema,
    template_id: str = "modern-professional",
    custom_config: FormattingConfigSchema | None = None,
) -> str:
    """
    Generates a single-page, ATS-optimized, print-ready HTML document.
    """
    return render_template_html(data, template_id=template_id, custom_config=custom_config)


def generate_resume_docx(
    data: ResumeDataSchema,
    template_id: str = "modern-professional",
    custom_config: FormattingConfigSchema | None = None,
) -> bytes:
    """
    Generates an editable Microsoft Word (.docx) document.
    """
    return render_template_docx(data, template_id=template_id, custom_config=custom_config)


def generate_resume_plain_text(data: ResumeDataSchema) -> str:
    """
    Generates pure aligned plain text for ATS verification and plain-text copying.
    """
    parts: list[str] = []
    pi = data.personal_info
    name = pi.full_name or "CANDIDATE NAME"
    parts.append(name.upper())
    if pi.headline:
        parts.append(pi.headline)
    contact_parts = [p for p in [pi.location, pi.phone, pi.email, "LinkedIn" if pi.linkedin_url else "", "GitHub" if pi.github_url else ""] if p]
    if contact_parts:
        parts.append(" | ".join(contact_parts))
    parts.append("")

    if data.career_objective:
        parts.append("CAREER OBJECTIVE")
        parts.append(data.career_objective)
        parts.append("")

    if data.technical_skills:
        parts.append("TECHNICAL SKILLS")
        for sk in data.technical_skills:
            if sk.skills:
                parts.append(f"• {sk.category}: {', '.join(sk.skills)}")
        parts.append("")

    if data.internships:
        parts.append("INTERNSHIP EXPERIENCE")
        for it in data.internships:
            header_left = it.role + (f" | {it.organization}" if it.organization else "")
            header_right = (f"{it.duration}" if it.duration else "") + (f" | {it.location}" if it.location else "")
            if header_right:
                padding = max(2, 78 - len(header_left) - len(header_right))
                parts.append(f"{header_left}{' ' * padding}{header_right}")
            else:
                parts.append(header_left)
            for b in it.bullets:
                if b.strip():
                    parts.append(f"• {b.strip()}")
            parts.append("")

    if data.projects:
        parts.append("PROJECTS")
        for pr in data.projects:
            header_left = pr.title + (f" | {pr.tech_stack}" if pr.tech_stack else "")
            header_right = pr.github_url or pr.project_url or ""
            if header_right:
                padding = max(2, 78 - len(header_left) - len(header_right))
                parts.append(f"{header_left}{' ' * padding}{header_right}")
            else:
                parts.append(header_left)
            for b in pr.bullets:
                if b.strip():
                    parts.append(f"• {b.strip()}")
            parts.append("")

    if data.education:
        parts.append("EDUCATION")
        for ed in data.education:
            header_left = ed.degree + (f" | {ed.institution}" if ed.institution else "")
            header_right = (f"{ed.graduation_date or ed.start_date}" if (ed.graduation_date or ed.start_date) else "") + (f" | {ed.score}" if ed.score else "")
            if header_right:
                padding = max(2, 78 - len(header_left) - len(header_right))
                parts.append(f"{header_left}{' ' * padding}{header_right}")
            else:
                parts.append(header_left)
        parts.append("")

    if data.certifications:
        parts.append("CERTIFICATIONS")
        for cr in data.certifications:
            org = f" ({cr.organization})" if cr.organization else ""
            parts.append(f"• {cr.name}{org}")
        parts.append("")

    return "\n".join(parts).strip()
