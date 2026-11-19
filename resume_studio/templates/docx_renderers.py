import io
import zipfile
import html as html_lib
from resume_studio.schemas import ResumeDataSchema, FormattingConfigSchema

def render_template_docx(
    data: ResumeDataSchema,
    template_id: str = "modern-professional",
    custom_config: FormattingConfigSchema | None = None,
) -> bytes:
    """
    Generates a native Microsoft Word (.docx) binary package using Python's standard library zipfile.
    Adheres strictly to single-column ATS specifications:
    - Page Size: A4 (11906 x 16838 dxa)
    - Margins: Top 0.5", Bottom 0.5", Left 0.65", Right 0.65"
    - Alignments: Center header, Left body text
    - Typography Hierarchy: Name 20-22pt, Heading 12-13pt, Subtitle 10.5-11pt, Body 9.5-10.5pt, Contact 9-10pt
    - Spacing: Paragraph after 2-4pt, Section before 8-10pt, Bullet indent 0.15-0.20"
    """
    esc = html_lib.escape
    cfg = custom_config or data.formatting_config

    font_family = getattr(cfg, "font_family", "Calibri") or "Calibri"
    accent = getattr(cfg, "accent_color", "#0f172a") or "#0f172a"
    accent_hex = accent.lstrip("#").upper()
    if len(accent_hex) != 6:
        accent_hex = "0F172A"

    # Convert margins to dxa (1 inch = 1440 dxa)
    top_dxa = int((getattr(cfg, "margin_top_in", 0.50) or 0.50) * 1440)
    bottom_dxa = int((getattr(cfg, "margin_bottom_in", 0.50) or 0.50) * 1440)
    left_dxa = int((getattr(cfg, "margin_left_in", 0.65) or 0.65) * 1440)
    right_dxa = int((getattr(cfg, "margin_right_in", 0.65) or 0.65) * 1440)

    # Element half-point font sizes (pt * 2)
    name_sz = int((getattr(cfg, "name_size_pt", 21.0) or 21.0) * 2)
    title_sz = int((getattr(cfg, "job_title_size_pt", 10.5) or 10.5) * 2)
    heading_sz = int((getattr(cfg, "heading_size_pt", 12.0) or 12.0) * 2)
    proj_sz = int((getattr(cfg, "project_title_size_pt", 10.5) or 10.5) * 2)
    body_sz = int((getattr(cfg, "body_size_pt", 10.0) or getattr(cfg, "font_size_pt", 10.0) or 10.0) * 2)
    contact_sz = int((getattr(cfg, "contact_size_pt", 9.5) or 9.5) * 2)

    # Alignments
    header_align = getattr(cfg, "header_align", "center") or "center"
    body_align = getattr(cfg, "text_align", "left") or "left"

    # Spacing in dxa (1 pt = 20 dxa)
    para_after_dxa = int((getattr(cfg, "paragraph_after_pt", 3.0) or 3.0) * 20)
    sec_before_dxa = int((getattr(cfg, "section_spacing_before_pt", 8.5) or 8.5) * 20)
    sec_after_dxa = int((getattr(cfg, "section_spacing_after_pt", 4.0) or 4.0) * 20)
    bullet_indent_dxa = int((getattr(cfg, "bullet_indent_in", 0.18) or 0.18) * 1440)

    # Prepare document content XML lines
    p_elements = []

    def make_p(
        text: str,
        is_bold: bool = False,
        font_size_half_pt: int = 20,
        is_heading: bool = False,
        bullet: bool = False,
        align: str = "left",
        color: str = "334155",
        space_before: int = 0,
        space_after: int = 60,
    ) -> str:
        esc_text = esc(text)
        bold_tag = "<w:b/>" if is_bold else ""
        jc_tag = f'<w:jc w:val="{align}"/>'
        
        if is_heading:
            p_pr = (
                f'<w:pPr>{jc_tag}'
                f'<w:spacing w:before="{sec_before_dxa}" w:after="{sec_after_dxa}"/>'
                f'<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="{accent_hex}"/></w:pBdr>'
                f'</w:pPr>'
            )
        elif bullet:
            p_pr = (
                f'<w:pPr>{jc_tag}'
                f'<w:pStyle w:val="ListParagraph"/>'
                f'<w:ind w:left="{bullet_indent_dxa}"/>'
                f'<w:spacing w:before="0" w:after="{para_after_dxa}"/>'
                f'</w:pPr>'
            )
        else:
            p_pr = f'<w:pPr>{jc_tag}<w:spacing w:before="{space_before}" w:after="{space_after}"/></w:pPr>'

        r_pr = (
            f'<w:rPr>{bold_tag}'
            f'<w:color w:val="{color}"/>'
            f'<w:sz w:val="{font_size_half_pt}"/>'
            f'<w:szCs w:val="{font_size_half_pt}"/>'
            f'<w:rFonts w:ascii="{font_family}" w:hAnsi="{font_family}"/>'
            f'</w:rPr>'
        )
        return f'<w:p>{p_pr}<w:r>{r_pr}<w:t xml:space="preserve">{esc_text}</w:t></w:r></w:p>'

    # 1. Header Information (Center aligned)
    pi = data.personal_info
    name = pi.full_name.strip() if pi.full_name else "CANDIDATE NAME"
    p_elements.append(
        make_p(name.upper(), is_bold=True, font_size_half_pt=name_sz, align=header_align, color=accent_hex, space_after=20)
    )
    if pi.headline:
        p_elements.append(
            make_p(pi.headline, is_bold=True, font_size_half_pt=title_sz, align=header_align, color=accent_hex, space_after=30)
        )

    # Contact line
    contacts = [c for c in [pi.location, pi.phone, pi.email, "LinkedIn" if pi.linkedin_url else "", "GitHub" if pi.github_url else ""] if c]
    if contacts:
        p_elements.append(
            make_p(" | ".join(contacts), font_size_half_pt=contact_sz, align=header_align, color="64748B", space_after=100)
        )

    # 2. Career Objective
    if data.career_objective:
        p_elements.append(make_p("CAREER OBJECTIVE", is_bold=True, font_size_half_pt=heading_sz, is_heading=True, color=accent_hex))
        p_elements.append(make_p(data.career_objective, font_size_half_pt=body_sz, align=body_align, color="334155", space_after=para_after_dxa))

    # 3. Technical Skills
    if data.technical_skills:
        p_elements.append(make_p("TECHNICAL SKILLS", is_bold=True, font_size_half_pt=heading_sz, is_heading=True, color=accent_hex))
        for sk in data.technical_skills:
            if sk.skills:
                p_elements.append(
                    make_p(f"• {sk.category}: {', '.join(sk.skills)}", font_size_half_pt=body_sz, align=body_align, color="334155", space_after=20)
                )

    # 4. Internships & Experience
    if data.internships:
        p_elements.append(make_p("INTERNSHIP EXPERIENCE", is_bold=True, font_size_half_pt=heading_sz, is_heading=True, color=accent_hex))
        for it in data.internships:
            header = f"{it.role}" + (f" | {it.organization}" if it.organization else "") + (f" ({it.duration})" if it.duration else "")
            p_elements.append(make_p(header, is_bold=True, font_size_half_pt=proj_sz, align=body_align, color="0F172A", space_after=20))
            for b in it.bullets:
                if b.strip():
                    p_elements.append(make_p(f"• {b.strip()}", bullet=True, font_size_half_pt=body_sz, align=body_align, color="334155"))

    # 5. Projects
    if data.projects:
        p_elements.append(make_p("PROJECTS", is_bold=True, font_size_half_pt=heading_sz, is_heading=True, color=accent_hex))
        for pr in data.projects:
            header = f"{pr.title}" + (f" | {pr.tech_stack}" if pr.tech_stack else "")
            p_elements.append(make_p(header, is_bold=True, font_size_half_pt=proj_sz, align=body_align, color="0F172A", space_after=20))
            for b in pr.bullets:
                if b.strip():
                    p_elements.append(make_p(f"• {b.strip()}", bullet=True, font_size_half_pt=body_sz, align=body_align, color="334155"))

    # 6. Education
    if data.education:
        p_elements.append(make_p("EDUCATION", is_bold=True, font_size_half_pt=heading_sz, is_heading=True, color=accent_hex))
        for ed in data.education:
            header = f"{ed.degree}" + (f" | {ed.institution}" if ed.institution else "") + (f" ({ed.graduation_date or ed.start_date})" if (ed.graduation_date or ed.start_date) else "") + (f" - {ed.score}" if ed.score else "")
            p_elements.append(make_p(header, is_bold=True, font_size_half_pt=body_sz, align=body_align, color="0F172A", space_after=30))

    # 7. Certifications
    if data.certifications:
        p_elements.append(make_p("CERTIFICATIONS", is_bold=True, font_size_half_pt=heading_sz, is_heading=True, color=accent_hex))
        for cr in data.certifications:
            org = f" ({cr.organization})" if cr.organization else ""
            p_elements.append(make_p(f"• {cr.name}{org}", font_size_half_pt=body_sz, align=body_align, color="334155", space_after=20))

    # Package into OpenXML ZIP archive
    body_xml = "".join(p_elements)

    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {body_xml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="{top_dxa}" w:right="{right_dxa}" w:bottom="{bottom_dxa}" w:left="{left_dxa}" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>"""

    content_types_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

    rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types_xml)
        z.writestr("_rels/.rels", rels_xml)
        z.writestr("word/document.xml", document_xml)

    return buf.getvalue()
