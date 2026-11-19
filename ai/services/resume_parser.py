import io
import logging
import re
import xml.etree.ElementTree as ET
import zipfile
import zlib
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Try optional third-party packages if installed, otherwise fall back gracefully
try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    import docx  # python-docx
except ImportError:
    docx = None


def extract_text_from_docx(file_bytes: bytes) -> str:
    """
    Extracts plain text from DOCX bytes.
    Uses python-docx if installed, otherwise uses standard library zipfile + XML parsing.
    """
    # 1. Try python-docx if available
    if docx is not None:
        try:
            doc = docx.Document(io.BytesIO(file_bytes))
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            for table in doc.tables:
                for row in table.rows:
                    for cell in row.cells:
                        if cell.text.strip():
                            paragraphs.append(cell.text.strip())
            text = "\n".join(paragraphs).strip()
            if text:
                return text
        except Exception as e:
            logger.debug("python-docx parsing failed, using native fallback: %s", e)

    # 2. Pure-Python Fallback using standard zipfile & XML parser
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
            xml_content = z.read("word/document.xml")
            tree = ET.fromstring(xml_content)
            ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            paragraphs: list[str] = []
            for p in tree.iterfind(".//w:p", ns):
                texts = [node.text for node in p.iterfind(".//w:t", ns) if node.text]
                if texts:
                    paragraphs.append("".join(texts))
            return "\n".join(paragraphs).strip()
    except Exception as exc:
        logger.warning("DOCX extraction error: %s", exc)
        return ""


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Extracts plain text from PDF bytes.
    Uses PyMuPDF (fitz) if installed, otherwise uses native regex & zlib stream decompression.
    """
    # 1. Try PyMuPDF if available
    if fitz is not None:
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            pages_text = [page.get_text() for page in doc]
            text = "\n".join(pages_text).strip()
            if len(text) > 30:
                return text
        except Exception as e:
            logger.debug("PyMuPDF parsing failed, using native fallback: %s", e)

    # 2. Pure-Python fallback using PDF object stream decompression
    extracted_chunks: list[str] = []
    stream_pattern = re.compile(rb"stream\r?\n(.*?)\r?\nendstream", re.DOTALL)
    for match in stream_pattern.finditer(file_bytes):
        stream_data = match.group(1)
        decompressed: bytes | None = None
        try:
            decompressed = zlib.decompress(stream_data)
        except Exception:
            try:
                decompressed = zlib.decompress(stream_data, -15)
            except Exception:
                decompressed = stream_data

        if decompressed:
            # Look for text blocks: BT ... ET
            text_blocks = re.findall(rb"BT(.*?)ET", decompressed, re.DOTALL)
            for block in text_blocks:
                # Text inside parentheses: (Some text) Tj or [(Some) -20 (Text)] TJ
                tj_matches = re.findall(rb"\((.*?)\)\s*(?:Tj|'|\")", block)
                for tj in tj_matches:
                    try:
                        text_str = tj.decode("utf-8", errors="ignore")
                        if text_str.strip():
                            extracted_chunks.append(text_str)
                    except Exception:
                        pass

                # Text array inside brackets: [(Some) 20 (Text)] TJ
                array_matches = re.findall(rb"\[(.*?)\]\s*TJ", block)
                for arr in array_matches:
                    tokens = re.findall(rb"\((.*?)\)|(-?\d+(?:\.\d+)?)", arr)
                    reconstructed = []
                    for text_part, num_part in tokens:
                        if text_part:
                            reconstructed.append(text_part.decode("utf-8", errors="ignore"))
                        elif num_part:
                            try:
                                if float(num_part) < -150:  # Negative displacement indicates word boundary
                                    reconstructed.append(" ")
                            except Exception:
                                pass
                    combined = "".join(reconstructed)
                    if combined.strip():
                        extracted_chunks.append(combined)

    result_text = "\n".join(extracted_chunks)

    # 3. If stream extraction found minimal text, scan printable ASCII tokens (handles raw/uncompressed PDFs)
    if len(result_text.strip()) < 50:
        raw_strings = re.findall(rb"[A-Za-z0-9,.:;@_\-/#+*&() ]{4,}", file_bytes)
        filtered = [
            s.decode("ascii", errors="ignore").strip()
            for s in raw_strings
            if not s.startswith(b"%PDF")
            and not s.startswith(b"obj")
            and not s.startswith(b"endobj")
            and not s.startswith(b"xref")
            and not s.startswith(b"/Filter")
            and not s.startswith(b"/Font")
            and not s.startswith(b"/CID")
        ]
        result_text = "\n".join(filtered)

    return clean_and_normalize_resume_text(result_text)


def clean_and_normalize_resume_text(text: str) -> str:
    """
    Cleans raw resume text by:
    1. Removing non-printable binary glyph junk and PDF stream artifacts.
    2. Reconstructing spaced-out letters and fragmented words (e.g. 'J I Y Y A N I' -> 'JIYYANI').
    3. Normalizing fragmented emails, phone numbers, and technical vocabulary.
    4. Normalizing whitespace while preserving paragraph and section breaks.
    """
    if not text:
        return ""

    # 1. Remove non-printable control characters, CID artifacts, and PDF binary stream artifacts
    cleaned = re.sub(r"\(cid:\d+\)", "", text)
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\xff]", "", cleaned)

    # Normalize weird unicode bullets and decorative dingbats to standard bullet
    cleaned = re.sub(r"[\u2022\u25cf\u25aa\u25cb\u2043\u2219\uf0b7\uf0a7\u25b8\u27a4]", " • ", cleaned)
    cleaned = re.sub(r"(?:â€¢|â€“|â€”)", " • ", cleaned)
    cleaned = re.sub(r"(?:•\s*){2,}", "• ", cleaned)

    # Rejoin hyphenated words split across line breaks (e.g. "devel-\noper" -> "developer")
    cleaned = re.sub(r"(\b[a-zA-Z]{3,})-\s*\n\s*([a-zA-Z]{3,}\b)", r"\1\2", cleaned)

    # Filter out garbage lines that have high symbol ratio or font table junk
    good_lines: list[str] = []
    for line in cleaned.split("\n"):
        stripped = line.strip()
        if not stripped:
            good_lines.append("")
            continue

        # Check symbol / punctuation noise
        alpha_count = sum(1 for c in stripped if c.isalnum())
        total_len = len(stripped)
        if total_len > 8 and (alpha_count / total_len) < 0.30:
            continue
        if any(junk in stripped for junk in ["+++", "@@", "###", "&&&", "}}*", "CX@", "@ U", "endstream", "/Filter"]):
            continue
        good_lines.append(stripped)

    text = "\n".join(good_lines)

    # 2. Fix fragmented emails (e.g. 'j e e v a n @ g m a i l . c o m' -> 'jeevan@gmail.com')
    def _fix_emails(m: re.Match) -> str:
        return re.sub(r"\s+", "", m.group(0))

    text = re.sub(
        r"[a-zA-Z0-9_.+-]+(?:\s*@\s*|\s+at\s+)[a-zA-Z0-9-]+\s*(?:\.\s*[a-zA-Z0-9-.]+)+",
        _fix_emails,
        text,
    )

    # 3. Fix fragmented phone numbers (e.g. '+ 9 1 - 9 3 9 1 3 4 0 9 7 8' -> '+91-9391340978')
    def _fix_phone(m: re.Match) -> str:
        return re.sub(r"\s+", "", m.group(0))

    text = re.sub(r"(?:\+\s*\d{1,3}\s*[-.]?\s*)?(?:\d\s*){10,12}", _fix_phone, text)

    # 3.5 Pre-normalize known section headers with arbitrary kerning/spaces
    header_patterns = [
        (r"(?im)^\s*P\s*r\s*o\s*f\s*e\s*s\s*s\s*i\s*o\s*n\s*a\s*l\s+S\s*u\s*m\s*m\s*a\s*r\s*y\s*$", "PROFESSIONAL SUMMARY"),
        (r"(?im)^\s*S\s*u\s*m\s*m\s*a\s*r\s*y\s*$", "PROFESSIONAL SUMMARY"),
        (r"(?im)^\s*T\s*e\s*c\s*h\s*n?\s*i\s*c\s*a\s*l\s+S\s*k\s*i\s*l\s*l\s*s\s*$", "TECHNICAL SKILLS"),
        (r"(?im)^\s*I\s*n\s*t\s*e\s*r\s*n\s*s\s*h\s*i\s*p\s*(?:E\s*x\s*p\s*e\s*r\s*i\s*e\s*n\s*c\s*e)?\s*$", "INTERNSHIP EXPERIENCE"),
        (r"(?im)^\s*(?:W\s*o\s*r\s*k\s+)?E\s*x\s*p\s*e\s*r\s*i\s*e\s*n\s*c\s*e\s*$", "WORK EXPERIENCE"),
        (r"(?im)^\s*P\s*r\s*o\s*j\s*e\s*c\s*t\s*s\s*$", "PROJECTS"),
        (r"(?im)^\s*E\s*d\s*u\s*c\s*a\s*t\s*i\s*o\s*n\s*$", "EDUCATION"),
        (r"(?im)^\s*C\s*e\s*r\s*t\s*i\s*f\s*i\s*c\s*a\s*t\s*i\s*o\s*n\s*s\s*$", "CERTIFICATIONS"),
    ]
    for pat, rep in header_patterns:
        text = re.sub(pat, rep, text)

    # 4. De-space single-character spaced words (e.g. 'J I Y Y A N I   J E E V A N')
    lines = text.split("\n")
    processed_lines: list[str] = []

    for line in lines:
        if not line.strip():
            processed_lines.append("")
            continue

        # Split on 2 or more spaces or tabs (word boundaries in PDF extractions)
        word_chunks = re.split(r"\s{2,}|\t+", line.strip())
        new_chunks: list[str] = []

        for chunk in word_chunks:
            tokens = chunk.split()
            if len(tokens) >= 2:
                avg_len = sum(len(t) for t in tokens) / len(tokens)
                if avg_len <= 2.2:  # Mostly single or two-letter fragments
                    new_chunks.append("".join(tokens))
                else:
                    merged: list[str] = []
                    single_buf: list[str] = []
                    for t in tokens:
                        if len(t) <= 2:
                            single_buf.append(t)
                        else:
                            if single_buf:
                                merged.append("".join(single_buf))
                                single_buf = []
                            merged.append(t)
                    if single_buf:
                        merged.append("".join(single_buf))
                    new_chunks.append(" ".join(merged))
            else:
                new_chunks.append(chunk)

        processed_lines.append(" ".join(new_chunks))

    normalized = "\n".join(processed_lines)

    # 5. Standardize common resume keywords and section headers
    term_repairs = {
        r"\bPy\s*th\s*o\s*n\b": "Python",
        r"\bPy\s*t\s*es\s*t\b": "Pytest",
        r"\bRe\s*qu\s*es\s*ts\b": "Requests",
        r"\bS\s*Q\s*L\b": "SQL",
        r"\bJa\s*va\s*S\s*cr\s*ipt\b": "JavaScript",
        r"\bR\s*E\s*S\s*T(?:\s+|)A\s*P\s*Is?\b": "REST APIs",
        r"\bA\s*P\s*I\b": "API",
        r"\bC\s*R\s*U\s*D\b": "CRUD",
        r"\bJ\s*S\s*O\s*N\b": "JSON",
        r"\bH\s*T\s*T\s*P\b": "HTTP",
        r"\bP\s*os\s*tm\s*a\s*n\b": "Postman",
        r"\bGi\s*t\s*Hu\s*b\b": "GitHub",
        r"\bL\s*in\s*k\s*ed\s*I\s*n\b": "LinkedIn",
        r"\bA\s*W\s*S\b": "AWS",
        r"\bA\s*zu\s*re\b": "Azure",
        r"\bE\s*C\s*2\b": "EC2",
        r"\bS\s*3\b": "S3",
        r"\bI\s*A\s*M\b": "IAM",
        r"\bC\s*I\s*/\s*C\s*D\b": "CI/CD",
        r"\bNu\s*m\s*P\s*y\b": "NumPy",
        r"\bPa\s*nd\s*a\s*s\b": "Pandas",
        r"\bSc\s*ik\s*it\s*-\s*le\s*ar\s*n\b": "Scikit-Learn",
        r"\bS\s*o\s*f\s*t\s*w\s*a\s*r\s*e\b": "Software",
        r"\bT\s*e\s*s\s*t\s*i\s*n\s*g\b": "Testing",
        r"\bA\s*u\s*t\s*o\s*m\s*a\s*t\s*i\s*o\s*n\b": "Automation",
        r"\bF\s*r\s*a\s*m\s*e\s*w\s*o\s*r\s*k\b": "Framework",
        r"\bE\s*n\s*g\s*i\s*n\s*e\s*e\s*r\b": "Engineer",
        r"\bE\s*d\s*u\s*c\s*a\s*t\s*i\s*o\s*n\b": "Education",
        r"\bP\s*r\s*o\s*j\s*e\s*c\s*t\s*s\b": "Projects",
        r"\bC\s*e\s*r\s*t\s*i\s*f\s*i\s*c\s*a\s*t\s*i\s*o\s*n\s*s\b": "Certifications",
        r"\bI\s*n\s*t\s*e\s*r\s*n\s*s\s*h\s*i\s*p\b": "Internship",
        r"\bE\s*x\s*p\s*e\s*r\s*i\s*e\s*n\s*c\s*e\b": "Experience",
        r"\bP\s*r\s*o\s*f\s*e\s*s\s*s\s*i\s*o\s*n\s*a\s*l\b": "Professional",
        r"\bS\s*u\s*m\s*m\s*a\s*r\s*y\b": "Summary",
        r"\bT\s*e\s*c\s*h\s*n\s*i\s*c\s*a\s*l\b": "Technical",
        r"\bS\s*k\s*i\s*l\s*l\s*s\b": "Skills",
        r"\bP\s*r\s*o\s*g\s*r\s*a\s*m\s*m\s*i\s*n\s*g\b": "Programming",
    }
    for pat, rep in term_repairs.items():
        normalized = re.sub(pat, rep, normalized, flags=re.IGNORECASE)

    # 6. Standardize standard section header lines
    section_headers_map = [
        (r"(?im)^\s*(?:Professional\s+)?Summary\s*$", "PROFESSIONAL SUMMARY"),
        (r"(?im)^\s*Technical\s+Skills\s*$", "TECHNICAL SKILLS"),
        (r"(?im)^\s*Internship(?:\s+Experience)?\s*$", "INTERNSHIP EXPERIENCE"),
        (r"(?im)^\s*(?:Work\s+)?Experience\s*$", "WORK EXPERIENCE"),
        (r"(?im)^\s*Projects\s*$", "PROJECTS"),
        (r"(?im)^\s*Education\s*$", "EDUCATION"),
        (r"(?im)^\s*Certifications\s*$", "CERTIFICATIONS"),
    ]
    for pat, rep in section_headers_map:
        normalized = re.sub(pat, rep, normalized)

    # 7. Deduplicate consecutive duplicate words caused by double-rendered PDF text layers (e.g. 'Python Python')
    # Preserves intentional double words like 'that that' or 'had had' if any, but eliminates font shadow echoes
    def _dedup_consecutive(match: re.Match) -> str:
        word = match.group(1)
        # Only deduplicate words with 3+ characters to avoid false matches
        if len(word) >= 3 and word.lower() not in {"that", "had"}:
            return word
        return match.group(0)

    normalized = re.sub(r"\b([A-Za-z0-9+#.-]{3,})\s+\1\b", _dedup_consecutive, normalized, flags=re.IGNORECASE)

    # 8. Clean redundant symbol divider lines and excess blank lines
    normalized = re.sub(r"(?:^|\s)[=\-_*~#]{3,}(?:\s|$)", " ", normalized)
    normalized = re.sub(r"^[=\-_*~#]{3,}\s*$", "", normalized, flags=re.MULTILINE)
    normalized = re.sub(r"[ \t]+", " ", normalized)
    normalized = re.sub(r"\n\s*\n+", "\n\n", normalized)
    return normalized.strip()


def parse_resume_content(filename: str, file_bytes: bytes) -> str:
    """
    Parses either DOCX or PDF resume binary bytes into normalized, clean plain text.
    Preserves document structure while eliminating kerning spacing artifacts.
    """
    lower_name = filename.lower()
    raw_text = ""
    if lower_name.endswith(".docx"):
        raw_text = extract_text_from_docx(file_bytes)
    elif lower_name.endswith(".pdf"):
        raw_text = extract_text_from_pdf(file_bytes)
    else:
        try:
            raw_text = file_bytes.decode("utf-8", errors="ignore")
        except Exception:
            raw_text = ""

    return clean_and_normalize_resume_text(raw_text)


# -----------------------------------------------------------------------------
# Section Extraction & Resume Parsing Engine
# -----------------------------------------------------------------------------

SECTION_PATTERNS = {
    "summary": [
        r"\b(?:professional\s+)?summary\b",
        r"\bcareer\s+objective\b",
        r"\bobjective\b",
        r"\babout\s+me\b",
        r"\bprofile\b",
        r"\bexecutive\s+summary\b",
    ],
    "skills": [
        r"\btechnical\s+skills\b",
        r"\bskills\b",
        r"\btechnologies\b",
        r"\btech\s+stack\b",
        r"\bcore\s+competencies\b",
        r"\bcompetencies\b",
        r"\btools\s+(?:&|and)\s+technologies\b",
        r"\bprogramming\s+languages\b",
    ],
    "education": [
        r"\beducation\b",
        r"\bacademics\b",
        r"\bacacademic\s+background\b",
        r"\bqualifications\b",
        r"\beducational\s+qualifications\b",
    ],
    "projects": [
        r"\bprojects\b",
        r"\bacademic\s+projects\b",
        r"\bpersonal\s+projects\b",
        r"\bkey\s+projects\b",
        r"\bcapstone\s+projects?\b",
        r"\btechnical\s+projects\b",
    ],
    "experience": [
        r"\bwork\s+experience\b",
        r"\bprofessional\s+experience\b",
        r"\bexperience\b",
        r"\bemployment\s+history\b",
        r"\bwork\s+history\b",
    ],
    "internships": [
        r"\binternships?\b",
        r"\binternship\s+experience\b",
        r"\bsummer\s+internship\b",
        r"\bindustrial\s+training\b",
        r"\bapprentice\b",
    ],
    "certifications": [
        r"\bcertifications?\b",
        r"\blicenses\s+(?:&|and)\s+certifications\b",
        r"\bcertificates?\b",
        r"\bcourses\s+(?:&|and)\s+certifications\b",
    ],
    "achievements": [
        r"\bachievements?\b",
        r"\bawards\b",
        r"\bawards\s+(?:&|and)\s+achievements\b",
        r"\bhonors\b",
        r"\baccomplishments\b",
        r"\bextracurricular\s+activities\b",
        r"\bco-curricular\b",
    ],
}


def extract_contact_info(text: str) -> dict[str, Any]:
    """
    Extracts contact info: name, email, phone, linkedin, github, portfolio/demo URLs, location.
    """
    text_lower = text.lower()

    # Email
    email_match = re.search(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", text)
    email = email_match.group(0) if email_match else None

    # Phone (Indian + International formats)
    phone_match = re.search(
        r"(?:\+?91[\s.-]?)?[6-9]\d{4}[\s.-]?\d{5}|(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}",
        text,
    )
    phone = phone_match.group(0).strip() if phone_match else None

    # LinkedIn
    linkedin_match = re.search(r"linkedin\.com/in/([a-zA-Z0-9_-]+)", text_lower)
    linkedin = f"https://linkedin.com/in/{linkedin_match.group(1)}" if linkedin_match else None
    if not linkedin and ("linkedin.com" in text_lower or "linkedin" in text_lower):
        linkedin = "LinkedIn Profile Included"

    # GitHub
    github_match = re.search(r"github\.com/([a-zA-Z0-9_-]+)", text_lower)
    github = f"https://github.com/{github_match.group(1)}" if github_match else None
    if not github and ("github.com" in text_lower or "github" in text_lower):
        github = "GitHub Profile Included"

    # Portfolio / Web / Demo
    portfolio_match = re.search(
        r"\b(?:https?://)?(?:[a-zA-Z0-9-]+\.)*(?:vercel\.app|netlify\.app|github\.io|pages\.dev|[a-zA-Z0-9-]+\.(?:com|org|dev|tech|me))\b",
        text_lower,
    )
    portfolio = None
    if portfolio_match:
        found_url = portfolio_match.group(0)
        if "github.com" not in found_url and "linkedin.com" not in found_url:
            portfolio = found_url

    # City / Location Detection
    major_cities = [
        "Bengaluru", "Bangalore", "Hyderabad", "Pune", "Mumbai", "Chennai", "Delhi",
        "Noida", "Gurugram", "Gurgaon", "Kolkata", "Ahmedabad", "Coimbatore", "Kochi",
        "Trivandrum", "Indore", "Jaipur", "Chandigarh", "Mysuru", "Remote"
    ]
    detected_location = None
    for city in major_cities:
        if re.search(r"\b" + re.escape(city) + r"\b", text, re.IGNORECASE):
            detected_location = city
            break

    # Candidate Name (Usually the first line or first 4-word heading)
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    candidate_name = None
    for line in lines[:5]:
        if (
            len(line.split()) <= 4
            and "@" not in line
            and "http" not in line.lower()
            and not any(re.search(r"\b" + re.escape(s) + r"\b", line, re.IGNORECASE) for s in ["resume", "curriculum", "vitae", "summary", "skills"])
        ):
            candidate_name = line
            break

    return {
        "candidate_name": candidate_name or "Candidate",
        "email": email,
        "phone": phone,
        "linkedin": linkedin,
        "github": github,
        "portfolio": portfolio,
        "location": detected_location,
        "has_email": bool(email),
        "has_phone": bool(phone),
        "has_linkedin": bool(linkedin),
        "has_github": bool(github),
    }


def extract_resume_sections(text: str) -> dict[str, Any]:
    """
    Segments resume text into standard sections:
    summary, skills, education, projects, experience, internships, certifications, achievements.
    """
    lines = text.split("\n")
    sections: dict[str, list[str]] = {k: [] for k in SECTION_PATTERNS}
    current_section = "summary"  # Default header region

    # Find section header matches
    for line in lines:
        clean_line = line.strip()
        if not clean_line:
            continue

        # Check if line matches a section header (usually short, <= 6 words)
        if len(clean_line.split()) <= 6:
            matched_header = None
            for sec_key, patterns in SECTION_PATTERNS.items():
                for pat in patterns:
                    if re.fullmatch(pat, clean_line, re.IGNORECASE) or re.match(r"^#*\s*" + pat + r"[:\s]*$", clean_line, re.IGNORECASE):
                        matched_header = sec_key
                        break
                if matched_header:
                    break

            if matched_header:
                current_section = matched_header
                continue

        sections[current_section].append(clean_line)

    contact_info = extract_contact_info(text)

    # Convert line arrays to structured text snippets
    structured_sections: dict[str, Any] = {
        "contact_info": contact_info,
        "summary": "\n".join(sections["summary"]).strip(),
        "skills": "\n".join(sections["skills"]).strip(),
        "education": "\n".join(sections["education"]).strip(),
        "projects": "\n".join(sections["projects"]).strip(),
        "experience": "\n".join(sections["experience"]).strip(),
        "internships": "\n".join(sections["internships"]).strip(),
        "certifications": "\n".join(sections["certifications"]).strip(),
        "achievements": "\n".join(sections["achievements"]).strip(),
        "raw_text": text,
    }

    return structured_sections
