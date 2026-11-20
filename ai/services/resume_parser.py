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
    import pymupdf as fitz  # PyMuPDF
except ImportError:
    try:
        import fitz
    except ImportError:
        fitz = None

try:
    import pypdf
except ImportError:
    pypdf = None

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
    Uses PyMuPDF (fitz) or pypdf if installed, otherwise uses native regex & zlib stream decompression.
    """
    # 1. Try PyMuPDF if available
    if fitz is not None:
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            pages_text = [page.get_text() for page in doc if page.get_text().strip()]
            text = "\n\n".join(pages_text).strip()
            if len(text) > 30:
                return clean_and_normalize_resume_text(text)
        except Exception as e:
            logger.debug("PyMuPDF parsing failed, trying pypdf: %s", e)

    # 2. Try pypdf if available
    if pypdf is not None:
        try:
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            pages_text = [page.extract_text() for page in reader.pages if page.extract_text() and page.extract_text().strip()]
            text = "\n\n".join(pages_text).strip()
            if len(text) > 30:
                return clean_and_normalize_resume_text(text)
        except Exception as e:
            logger.debug("pypdf parsing failed, using native fallback: %s", e)

    # 3. Pure-Python fallback using PDF object stream decompression
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
        r"\b(?:professional\s+|career\s+|executive\s+)?(?:summary|objective|profile|overview|about\s+me)\b",
    ],
    "skills": [
        r"\b(?:technical\s+skills|core\s+competencies|key\s+skills|skills\s*(?:&|and|/)\s*abilities|skills\s*(?:&|and|/)\s*technologies|technologies\s*(?:&|and|/)\s*tools|tools\s*(?:&|and|/)\s*technologies|programming\s+languages|tech\s+stack|technical\s+expertise|competencies|areas\s+of\s+expertise|technical\s+proficiencies)\b",
        r"^(?:skills|technical\s+skill|technologies|tools|it\s+skills)$",
    ],
    "education": [
        r"\b(?:academic\s+background|educational\s+background|education\s*(?:&|and|/)\s*training|educational\s+qualifications?|qualifications?|academics?)\b",
        r"^(?:education|academic)$",
    ],
    "projects": [
        r"\b(?:academic\s+projects|personal\s+projects|technical\s+projects|key\s+projects|capstone\s+projects?|featured\s+projects|project\s+work)\b",
        r"^(?:projects|project)$",
    ],
    "experience": [
        r"\b(?:work\s+experience|professional\s+experience|employment\s+history|work\s+history|career\s+history|practical\s+experience)\b",
        r"^(?:experience|experiences)$",
    ],
    "internships": [
        r"\b(?:internships?|internship\s+experience|summer\s+internship|industrial\s+training|apprentice(?:ship)?)\b",
    ],
    "certifications": [
        r"\b(?:certifications?|licenses?\s*(?:&|and|/)\s*certifications?|courses?\s*(?:&|and|/)\s*certifications?|certificates?|professional\s+certifications?)\b",
    ],
    "achievements": [
        r"\b(?:achievements?|awards?\s*(?:&|and|/)\s*achievements?|honors?\s*(?:&|and|/)\s*awards?|extracurricular\s+activities|co-curricular\s+activities|accomplishments?|publications?)\b",
        r"^(?:achievements|awards|honors)$",
    ],
}


def classify_section_header(line: str) -> str | None:
    """
    Identifies whether a line is a resume section header.
    Handles Markdown headings, colons, bullets, and multi-term variations.
    """
    cleaned = re.sub(r"^[\s#*\-_•>|0-9.)]+", "", line).strip()
    cleaned = re.sub(r"[\s*#_\-:|]+$", "", cleaned).strip()
    if not cleaned or len(cleaned.split()) > 7 or len(cleaned) > 55:
        return None

    cleaned_lower = cleaned.lower()

    # 1. Summary / Objective
    if re.fullmatch(r"(?:professional\s+|career\s+|executive\s+)?(?:summary|objective|profile|overview|about\s+me)", cleaned_lower):
        return "summary"

    # 2. Skills / Competencies
    if re.search(
        r"\b(?:technical\s+skills|core\s+competencies|key\s+skills|skills\s*(?:&|and|/)\s*abilities|skills\s*(?:&|and|/)\s*technologies|technologies\s*(?:&|and|/)\s*tools|tools\s*(?:&|and|/)\s*technologies|programming\s+languages|tech\s+stack|technical\s+expertise|competencies|areas\s+of\s+expertise|technical\s+proficiencies)\b",
        cleaned_lower,
    ) or cleaned_lower in ["skills", "technical skill", "technologies", "tools", "it skills"]:
        return "skills"

    # 3. Work Experience / History
    if re.search(
        r"\b(?:work\s+experience|professional\s+experience|employment\s+history|work\s+history|career\s+history|practical\s+experience)\b",
        cleaned_lower,
    ):
        return "experience"

    # 4. Internships (or combined Experience / Internships)
    if re.search(
        r"\b(?:internships?|internship\s+experience|summer\s+internship|industrial\s+training|apprentice(?:ship)?)\b",
        cleaned_lower,
    ):
        return "experience" if "work" in cleaned_lower else "internships"

    if cleaned_lower in ["experience", "experiences"]:
        return "experience"

    # 5. Projects
    if re.search(
        r"\b(?:academic\s+projects|personal\s+projects|technical\s+projects|key\s+projects|capstone\s+projects?|featured\s+projects|project\s+work)\b",
        cleaned_lower,
    ) or cleaned_lower in ["projects", "project"]:
        return "projects"

    # 6. Education
    if re.search(
        r"\b(?:academic\s+background|educational\s+background|education\s*(?:&|and|/)\s*training|educational\s+qualifications?|qualifications?|academics?)\b",
        cleaned_lower,
    ) or cleaned_lower in ["education", "academic"]:
        return "education"

    # 7. Certifications
    if re.search(
        r"\b(?:certifications?|licenses?\s*(?:&|and|/)\s*certifications?|courses?\s*(?:&|and|/)\s*certifications?|certificates?|professional\s+certifications?)\b",
        cleaned_lower,
    ):
        return "certifications"

    # 8. Achievements / Awards
    if re.search(
        r"\b(?:achievements?|awards?\s*(?:&|and|/)\s*achievements?|honors?\s*(?:&|and|/)\s*awards?|extracurricular\s+activities|co-curricular\s+activities|accomplishments?|publications?)\b",
        cleaned_lower,
    ) or cleaned_lower in ["achievements", "awards", "honors"]:
        return "achievements"

    return None


def extract_contact_info(text: str) -> dict[str, Any]:
    """
    Extracts contact info: candidate name, email, phone, linkedin, github, portfolio/demo URLs, and location.
    Preserves clean separation without leaking preamble into resume sections.
    """
    text_lower = text.lower()

    # 1. Email Address
    email_match = re.search(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", text)
    email = email_match.group(0) if email_match else None

    # 2. Phone (Indian + US + International formats)
    phone_match = re.search(
        r"(?:\+?91[\s.-]?)?[6-9]\d{4}[\s.-]?\d{5}|(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\+\d{1,3}[\s.-]?\d{3,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}",
        text,
    )
    phone = phone_match.group(0).strip() if phone_match else None

    # 3. LinkedIn Profile
    linkedin_match = re.search(r"linkedin\.com/in/([a-zA-Z0-9_\-\.]+)/?", text_lower)
    linkedin = f"https://linkedin.com/in/{linkedin_match.group(1)}" if linkedin_match else None
    if not linkedin and ("linkedin.com" in text_lower or "linkedin" in text_lower):
        linkedin = "LinkedIn Profile Included"

    # 4. GitHub Profile
    github_match = re.search(r"github\.com/([a-zA-Z0-9_\-\.]+)/?", text_lower)
    github = f"https://github.com/{github_match.group(1)}" if github_match else None
    if not github and ("github.com" in text_lower or "github" in text_lower):
        github = "GitHub Profile Included"

    # 5. Portfolio / Web / Demo (ensuring email domain or academic degrees like B.Tech are not misidentified)
    portfolio_match = re.search(
        r"\b(?:https?://)?(?:[a-zA-Z0-9-]+\.)*(?:vercel\.app|netlify\.app|github\.io|pages\.dev|[a-zA-Z0-9-]+\.(?:tech|dev|me|io|space))\b",
        text_lower,
    )
    portfolio = None
    if portfolio_match:
        found_url = portfolio_match.group(0)
        clean_cand = found_url.lower().replace(".", "").strip()
        if (
            "github.com" not in found_url
            and "linkedin.com" not in found_url
            and clean_cand not in ["btech", "mtech", "bca", "mca", "bsc", "msc", "ba", "ma", "phd"]
        ):
            portfolio = found_url

    # Also check generic websites starting with http/https or www
    if not portfolio:
        web_match = re.search(r"\b(?:https?://|www\.)[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:/[^\s]*)?\b", text_lower)
        if web_match:
            candidate_web = web_match.group(0)
            if not any(blocked in candidate_web for blocked in ["github.com", "linkedin.com", "twitter.com", "facebook.com", "instagram.com"]):
                portfolio = candidate_web

    # 6. City / Location Detection
    detected_location = None
    # Inspect top header lines for 'City, State' or 'City, Country' pattern
    for line in text.split("\n")[:10]:
        for part in re.split(r"[|•·\t]|\s{2,}", line):
            part = part.strip()
            m = re.match(r"^([A-Za-z]+(?:\s+[A-Za-z]+)?),\s*([A-Za-z]{2,}|[A-Za-z]{2})$", part)
            if m and not any(kw in part.lower() for kw in ["resume", "developer", "engineer", "analyst", "manager", "lead"]):
                detected_location = part
                break
        if detected_location:
            break

    if not detected_location:
        major_cities = [
            "Bengaluru", "Bangalore", "Hyderabad", "Pune", "Mumbai", "Chennai", "Delhi",
            "Noida", "Gurugram", "Gurgaon", "Kolkata", "Ahmedabad", "Coimbatore", "Kochi",
            "Trivandrum", "Indore", "Jaipur", "Chandigarh", "Mysuru",
            "San Francisco", "New York", "Seattle", "Austin", "Boston", "Chicago", "Los Angeles",
            "London", "Toronto", "Vancouver", "Berlin", "Munich", "Singapore", "Sydney", "Dubai", "Remote"
        ]
        for city in major_cities:
            if re.search(r"\b" + re.escape(city) + r"\b", text, re.IGNORECASE):
                detected_location = city
                break

    # 7. Candidate Name (from first 6 lines, cleaned of titles and role subtitles)
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    candidate_name = None
    for line in lines[:6]:
        # If line has separators like '|' or '•', take the first chunk
        candidate_chunk = re.split(r"[|•·\t]", line)[0].strip()
        candidate_chunk = re.sub(r"^(?:Mr\.|Ms\.|Mrs\.|Dr\.)\s*", "", candidate_chunk, flags=re.IGNORECASE).strip()
        words = candidate_chunk.split()
        if (
            1 <= len(words) <= 4
            and len(candidate_chunk) <= 40
            and "@" not in candidate_chunk
            and "http" not in candidate_chunk.lower()
            and not any(char.isdigit() for char in candidate_chunk)
            and not any(re.search(r"\b" + re.escape(s) + r"\b", candidate_chunk, re.IGNORECASE) for s in [
                "resume", "curriculum", "vitae", "summary", "skills", "objective", "profile",
                "software", "engineer", "developer", "intern", "fresher", "portfolio", "contact"
            ])
        ):
            candidate_name = candidate_chunk.title() if candidate_chunk.isupper() else candidate_chunk
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
    Segments resume text cleanly into standard ATS sections:
    summary, skills, education, projects, experience, internships, certifications, achievements.
    Ensures contact header / preamble lines never contaminate the professional summary.
    """
    lines = text.split("\n")
    sections: dict[str, list[str]] = {
        "summary": [],
        "skills": [],
        "experience": [],
        "internships": [],
        "projects": [],
        "education": [],
        "certifications": [],
        "achievements": [],
    }
    current_section: str | None = None
    preamble_lines: list[str] = []

    for line in lines:
        clean_line = line.strip()
        if not clean_line:
            continue

        matched_header = classify_section_header(clean_line)
        if matched_header:
            current_section = matched_header
            continue

        if current_section is None:
            preamble_lines.append(clean_line)
        else:
            sections[current_section].append(clean_line)

    summary_text = "\n".join(sections["summary"]).strip()
    # If no explicit summary header existed, check preamble for a genuine prose statement
    if not summary_text:
        for pline in preamble_lines:
            words = pline.split()
            # Must be a substantial sentence and not contact information
            if (
                len(words) >= 8
                and "@" not in pline
                and not any(kw in pline.lower() for kw in ["http", "linkedin", "github", "phone", "+91"])
                and "|" not in pline
                and "•" not in pline
            ):
                summary_text = pline
                break

    contact_info = extract_contact_info(text)

    # Convert line arrays to structured text snippets
    structured_sections: dict[str, Any] = {
        "contact_info": contact_info,
        "summary": summary_text,
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
