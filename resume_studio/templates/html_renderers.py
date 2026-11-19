import html as html_lib
from typing import Any
from resume_studio.schemas import ResumeDataSchema, FormattingConfigSchema

def render_template_html(
    data: ResumeDataSchema,
    template_id: str = "modern-professional",
    custom_config: FormattingConfigSchema | None = None,
) -> str:
    """
    Renders a pixel-perfect, ATS-compliant, single-page printable HTML resume.
    Adapts layout, typography, section ordering, and accents based on template_id and custom_config.
    """
    esc = html_lib.escape
    cfg = custom_config or data.formatting_config

    # Template-specific default styles
    template_styles = {
        # 1. ATS Professional
        "ats-technical-pro": {"color": "#0f172a", "font": "Calibri", "border_style": "1.2px solid #0f172a"},
        "ats-professional": {"color": "#0f172a", "font": "Calibri", "border_style": "1.2px solid #0f172a"},
        # 2. Modern Minimal
        "modern-minimal": {"color": "#111827", "font": "Arial", "border_style": "1px solid #111827"},
        "minimal-ats": {"color": "#111827", "font": "Arial", "border_style": "1px solid #111827"},
        # 3. Software Engineer
        "software-engineer": {"color": "#2563eb", "font": "Inter", "border_style": "1.5px solid #2563eb"},
        "software-developer": {"color": "#2563eb", "font": "Inter", "border_style": "1.5px solid #2563eb"},
        "tech-modern": {"color": "#2563eb", "font": "Inter", "border_style": "1.5px solid #2563eb"},
        # 4. AI/ML Engineer
        "aiml-engineer": {"color": "#4f46e5", "font": "Inter", "border_style": "1.5px solid #4f46e5"},
        # 5. Data Analyst
        "data-analyst": {"color": "#0284c7", "font": "Calibri", "border_style": "1.5px solid #0284c7"},
        # 6. Cloud & DevOps Engineer
        "cloud-devops-engineer": {"color": "#0d9488", "font": "Inter", "border_style": "1.5px solid #0d9488"},
        "cloud-devops": {"color": "#0d9488", "font": "Inter", "border_style": "1.5px solid #0d9488"},
        # 7. Fresher
        "fresher-starter": {"color": "#0f766e", "font": "Calibri", "border_style": "1.5px solid #0f766e"},
        "fresher": {"color": "#0f766e", "font": "Calibri", "border_style": "1.5px solid #0f766e"},
        "fresher-graduate": {"color": "#0f766e", "font": "Calibri", "border_style": "1.5px solid #0f766e"},
        # 8. Experienced Professional
        "experienced-professional": {"color": "#1e293b", "font": "Georgia", "border_style": "1.5px solid #1e293b"},
        "experienced-pro": {"color": "#1e293b", "font": "Georgia", "border_style": "1.5px solid #1e293b"},
        # 9. One-Page Resume
        "one-page-resume": {"color": "#0f172a", "font": "Calibri", "border_style": "1.2px solid #0f172a"},
        "faang-compact": {"color": "#0f172a", "font": "Calibri", "border_style": "1.2px solid #0f172a"},
        "modern-professional": {"color": "#0f172a", "font": "Inter", "border_style": "1.5px solid #0f172a"},
        "python-developer": {"color": "#059669", "font": "Roboto", "border_style": "1.5px solid #059669"},
        "internship-resume": {"color": "#7c3aed", "font": "Roboto", "border_style": "1.5px solid #7c3aed"},
    }

    t_style = template_styles.get(template_id)
    if not t_style:
        from resume_studio.template_service import _classify_template
        classified = _classify_template(template_id)
        t_style = {
            "color": classified["accent_color"],
            "font": classified["font_family"],
            "border_style": f"1.5px solid {classified['accent_color']}",
        }

    accent = cfg.accent_color if cfg.accent_color and cfg.accent_color != "#0f172a" else t_style["color"]
    font = cfg.font_family or t_style["font"]

    # ATS Recommended Page Margins (inches): Top 0.5", Bottom 0.5", Left 0.65", Right 0.65"
    margin_top = getattr(cfg, "margin_top_in", None) or 0.50
    margin_bottom = getattr(cfg, "margin_bottom_in", None) or 0.50
    margin_left = getattr(cfg, "margin_left_in", None) or 0.65
    margin_right = getattr(cfg, "margin_right_in", None) or 0.65

    # Alignments: Single column, left-aligned body text, center-aligned header
    header_align = getattr(cfg, "header_align", None) or "center"
    header_justify = "center" if header_align == "center" else "flex-start"
    text_align = getattr(cfg, "text_align", None) or "left"

    # Typography Hierarchy (pt): Name 20-22, Heading 12-13, Project 10.5-11, Body 9.5-10.5, Contact 9-10
    name_size = getattr(cfg, "name_size_pt", None) or 21.0
    job_title_size = getattr(cfg, "job_title_size_pt", None) or 10.5
    heading_size = getattr(cfg, "heading_size_pt", None) or 12.0
    project_title_size = getattr(cfg, "project_title_size_pt", None) or 10.5
    body_size = getattr(cfg, "body_size_pt", None) or getattr(cfg, "font_size_pt", None) or 10.0
    contact_size = getattr(cfg, "contact_size_pt", None) or 9.5

    # Spacing & Indentation: Line spacing 1.0-1.1, Paragraph after 2-4pt, Section before 8-10pt, Bullet indent 0.15-0.20"
    line_h = getattr(cfg, "line_spacing", None) or 1.08
    para_before = getattr(cfg, "paragraph_before_pt", None) or 0.0
    para_after = getattr(cfg, "paragraph_after_pt", None) or 3.0
    sec_before = getattr(cfg, "section_spacing_before_pt", None) or 8.5
    sec_after = getattr(cfg, "section_spacing_after_pt", None) or 4.0
    bullet_indent = getattr(cfg, "bullet_indent_in", None) or 0.18

    # 1. Header Information
    pi = data.personal_info
    full_name = pi.full_name.strip() if pi.full_name else "YOUR NAME"
    headline = pi.headline.strip() if pi.headline else ""
    
    contact_parts = []
    if pi.location: contact_parts.append(pi.location)
    if pi.phone: contact_parts.append(pi.phone)
    if pi.email: contact_parts.append(pi.email)
    if pi.linkedin_url: contact_parts.append("LinkedIn")
    if pi.github_url: contact_parts.append("GitHub")
    if pi.portfolio_url: contact_parts.append("Portfolio")
    
    contact_spans = [f"<span>{esc(p)}</span>" for p in contact_parts]
    contact_html = ' <span class="sep">•</span> '.join(contact_spans)

    # 2. Section Builders
    def build_summary() -> str:
        if not data.career_objective:
            return ""
        return f'''
        <div class="section-block">
          <div class="section-header">CAREER OBJECTIVE</div>
          <p class="summary-text">{esc(data.career_objective)}</p>
        </div>
        '''

    def build_skills() -> str:
        if not data.technical_skills:
            return ""
        skill_rows = []
        for sk in data.technical_skills:
            if sk.skills:
                vals = ", ".join(sk.skills)
                skill_rows.append(f'''
                <div class="skill-line">
                  <strong class="skill-cat">{esc(sk.category)}:</strong>
                  <span class="skill-vals">{esc(vals)}</span>
                </div>
                ''')
        return f'''
        <div class="section-block">
          <div class="section-header">TECHNICAL SKILLS</div>
          <div class="skills-block">
            {''.join(skill_rows)}
          </div>
        </div>
        '''

    def build_education() -> str:
        if not data.education:
            return ""
        edu_entries = []
        for ed in data.education:
            inst = f'<span class="entry-sep">|</span> <span class="entry-inst">{esc(ed.institution)}</span>' if ed.institution else ""
            dates = f'<span class="entry-dates">{esc(ed.graduation_date or ed.start_date or "")}</span>' if (ed.graduation_date or ed.start_date) else ""
            score = f'<span class="entry-sep">|</span> <span class="entry-score">{esc(ed.score)}</span>' if ed.score else ""
            edu_entries.append(f'''
            <div class="edu-item">
              <div class="entry-header">
                <div class="entry-left">
                  <strong class="entry-title">{esc(ed.degree)}</strong> {inst}
                </div>
                <div class="entry-right">
                  {dates} {score}
                </div>
              </div>
            </div>
            ''')
        return f'''
        <div class="section-block">
          <div class="section-header">EDUCATION</div>
          {''.join(edu_entries)}
        </div>
        '''

    def build_projects() -> str:
        if not data.projects:
            return ""
        proj_entries = []
        for pr in data.projects:
            stack = f'<span class="entry-sep">|</span> <span class="entry-tech">{esc(pr.tech_stack)}</span>' if pr.tech_stack else ""
            link = f'<span class="entry-link">{esc(pr.github_url or pr.project_url or "")}</span>' if (pr.github_url or pr.project_url) else ""
            bullets = "".join([f"<li>{esc(b)}</li>" for b in pr.bullets if b.strip()])
            proj_entries.append(f'''
            <div class="entry-item">
              <div class="entry-header">
                <div class="entry-left">
                  <strong class="entry-title">{esc(pr.title)}</strong> {stack}
                </div>
                <div class="entry-right">
                  {link}
                </div>
              </div>
              {f'<ul class="entry-bullets">{bullets}</ul>' if bullets else ''}
            </div>
            ''')
        return f'''
        <div class="section-block">
          <div class="section-header">PROJECTS</div>
          {''.join(proj_entries)}
        </div>
        '''

    def build_internships() -> str:
        if not data.internships:
            return ""
        int_entries = []
        for it in data.internships:
            org = f'<span class="entry-sep">|</span> <span class="entry-company">{esc(it.organization)}</span>' if it.organization else ""
            duration = f'<span class="entry-dates">{esc(it.duration)}</span>' if it.duration else ""
            loc = f'<span class="entry-sep">|</span> <span class="entry-loc">{esc(it.location)}</span>' if it.location else ""
            bullets = "".join([f"<li>{esc(b)}</li>" for b in it.bullets if b.strip()])
            int_entries.append(f'''
            <div class="entry-item">
              <div class="entry-header">
                <div class="entry-left">
                  <strong class="entry-title">{esc(it.role)}</strong> {org}
                </div>
                <div class="entry-right">
                  {duration} {loc}
                </div>
              </div>
              {f'<ul class="entry-bullets">{bullets}</ul>' if bullets else ''}
            </div>
            ''')
        return f'''
        <div class="section-block">
          <div class="section-header">PROFESSIONAL EXPERIENCE / INTERNSHIP</div>
          {''.join(int_entries)}
        </div>
        '''

    def build_certifications() -> str:
        if not data.certifications:
            return ""
        cert_items = []
        for cr in data.certifications:
            org = f" ({esc(cr.organization)})" if cr.organization else ""
            cert_items.append(f"<li>{esc(cr.name)}{org}</li>")
        return f'''
        <div class="section-block">
          <div class="section-header">CERTIFICATIONS</div>
          <ul class="certs-list">
            {''.join(cert_items)}
          </ul>
        </div>
        '''

    # Section Ordering Logic
    sections_order = []
    if template_id in ["fresher-graduate", "internship-resume"]:
        # Education and projects prioritized
        sections_order = [build_summary, build_skills, build_education, build_projects, build_internships, build_certifications]
    elif template_id in ["ats-technical-pro", "software-developer", "python-developer", "aiml-engineer", "data-analyst", "cloud-devops"]:
        # Skills and projects prioritized
        sections_order = [build_summary, build_skills, build_projects, build_internships, build_education, build_certifications]
    else:
        # Standard balanced layout
        sections_order = [build_summary, build_skills, build_internships, build_projects, build_education, build_certifications]

    rendered_sections = "".join([fn() for fn in sections_order if fn()])

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{esc(full_name)} - Resume</title>
  <style>
    @page {{
      size: A4 portrait;
      margin: {margin_top}in {margin_right}in {margin_bottom}in {margin_left}in;
    }}
    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}
    body {{
      font-family: "{font}", Calibri, Arial, "Times New Roman", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #111827;
      background: #ffffff;
      font-size: {body_size}pt;
      line-height: {line_h};
      text-align: {text_align};
    }}
    .resume-container {{
      width: 100%;
      max-width: 8.27in;
      margin: 0 auto;
      background: #ffffff;
      text-align: {text_align};
    }}
    .candidate-name {{
      font-size: {name_size}pt;
      font-weight: 800;
      letter-spacing: 0.03em;
      text-align: {header_align};
      color: {accent};
      text-transform: uppercase;
      line-height: 1.15;
    }}
    .candidate-title {{
      font-size: {job_title_size}pt;
      font-weight: 600;
      text-align: {header_align};
      color: {accent};
      opacity: 0.9;
      margin-top: 2px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }}
    .contact-bar {{
      display: flex;
      flex-wrap: wrap;
      justify-content: {header_justify};
      align-items: center;
      text-align: {header_align};
      gap: 6px;
      font-size: {contact_size}pt;
      color: #475569;
      margin-top: {para_after}pt;
      margin-bottom: {para_after}pt;
    }}
    .contact-bar .sep {{
      color: #cbd5e1;
    }}
    .section-block {{
      margin-top: {sec_before}pt;
      margin-bottom: {sec_after}pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }}
    .section-header {{
      font-size: {heading_size}pt;
      font-weight: 700;
      color: {accent};
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1.2px solid {accent};
      padding-bottom: 1.5px;
      margin-bottom: {sec_after}pt;
      text-align: left;
    }}
    .summary-text {{
      font-size: {body_size}pt;
      line-height: {line_h};
      color: #111827;
      text-align: {text_align};
      margin-top: {para_before}pt;
      margin-bottom: {para_after}pt;
    }}
    .skills-block {{
      display: flex;
      flex-direction: column;
      gap: 1.5px;
    }}
    .skill-line {{
      font-size: {body_size}pt;
      line-height: {line_h};
      color: #111827;
      margin-top: {para_before}pt;
      margin-bottom: {para_after}pt;
      text-align: {text_align};
    }}
    .skill-cat {{
      font-weight: 700;
      color: #0f172a;
    }}
    .entry-item {{
      margin-top: {para_before}pt;
      margin-bottom: {para_after}pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }}
    .entry-header {{
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 1px;
    }}
    .entry-left {{
      display: flex;
      align-items: baseline;
      gap: 4px;
      flex-wrap: wrap;
    }}
    .entry-right {{
      display: flex;
      align-items: baseline;
      gap: 4px;
      white-space: nowrap;
      text-align: right;
    }}
    .entry-title {{
      font-size: {project_title_size}pt;
      font-weight: 700;
      color: #0f172a;
    }}
    .entry-company, .entry-inst {{
      font-size: {body_size}pt;
      font-style: italic;
      color: #334155;
    }}
    .entry-sep {{
      color: #94a3b8;
      font-size: {body_size * 0.9}pt;
    }}
    .entry-dates {{
      font-size: {contact_size}pt;
      font-weight: 600;
      color: #475569;
    }}
    .entry-loc {{
      font-size: {contact_size}pt;
      color: #64748b;
    }}
    .entry-tech {{
      font-size: {body_size}pt;
      color: {accent};
      font-weight: 500;
    }}
    .entry-link {{
      font-size: {contact_size}pt;
      color: #475569;
      font-style: italic;
    }}
    .entry-score {{
      font-size: {contact_size}pt;
      font-weight: 600;
      color: #16a34a;
    }}
    .entry-bullets {{
      margin: {para_before}pt 0 {para_after}pt {bullet_indent}in;
      padding-left: 0;
      list-style-position: outside;
    }}
    .entry-bullets li {{
      font-size: {body_size}pt;
      line-height: {line_h};
      color: #334155;
      margin-bottom: 1.5px;
      text-align: {text_align};
    }}
    .edu-item {{
      margin-top: {para_before}pt;
      margin-bottom: {para_after}pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }}
    .certs-list {{
      margin: {para_before}pt 0 {para_after}pt {bullet_indent}in;
      padding-left: 0;
      list-style-position: outside;
    }}
    .certs-list li {{
      font-size: {body_size}pt;
      line-height: {line_h};
      color: #334155;
      margin-bottom: 1.5px;
      text-align: {text_align};
    }}
    @media print {{
      html, body {{
        width: 210mm;
        height: 297mm;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        overflow: hidden !important;
      }}
      .resume-container {{
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }}
    }}
  </style>
</head>
<body>
  <div class="resume-container">
    <h1 class="candidate-name">{esc(full_name)}</h1>
    {f'<div class="candidate-title">{esc(headline)}</div>' if headline else ''}
    <div class="contact-bar">{contact_html}</div>
    {rendered_sections}
  </div>
</body>
</html>
"""
