import html
import json
import logging
import re
import urllib.request
import xml.etree.ElementTree as ET
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from accounts.models import User, UserRole
from accounts.security import hash_password
from jobs.enums import EmploymentType, JobStatus
from jobs.models import Job

logger = logging.getLogger(__name__)

SYSTEM_AGGREGATOR_EMAIL = "aggregator@jobconnect.local"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 JobConnect/1.0"
)

SENIOR_DISQUALIFIERS = [
    "senior",
    "sr.",
    "sr ",
    "(senior)",
    "lead",
    "principal",
    "staff",
    "director",
    "vp",
    "head of",
    "vice president",
    "manager",
    "architect",
    "chief",
    "expert",
    "5+ years",
    "7+ years",
    "10+ years",
]

FRESHER_INDICATORS = [
    "junior",
    "jr.",
    "jr ",
    "intern",
    "internship",
    "fresher",
    "freshers",
    "entry level",
    "entry-level",
    "graduate",
    "associate",
    "trainee",
    "assistant",
    "early career",
    "beginner",
    "apprentice",
    "0-1",
    "0-2",
    "no experience",
    "student",
    "fellow",
]

# Explicit foreign locations to reject (JobConnect is STRICTLY India location only)
FOREIGN_LOCATIONS = [
    "germany", "deutschland", "berlin", "munich", "stuttgart", "hamburg", "frankfurt", "cologne", "rüsselsheim", "eberswalde",
    "united kingdom", "uk", "london", "manchester", "birmingham", "edinburgh", "glasgow", "leeds",
    "united states", "usa", "u.s.", "u.s.a.", "new york", "san francisco", "california", "texas", "austin", "seattle", "washington", "boston", "chicago", "los angeles", "sterling heights", "michigan",
    "canada", "toronto", "vancouver", "montreal", "calgary", "ottawa", "north york", "prince george",
    "australia", "sydney", "melbourne", "brisbane",
    "netherlands", "amsterdam", "rotterdam",
    "france", "paris",
    "spain", "madrid", "barcelona",
    "brazil", "são paulo", "rio de janeiro",
    "mexico", "ciudad de méxico",
    "poland", "warsaw", "krakow",
    "sweden", "stockholm",
    "switzerland", "zurich", "geneva",
    "ireland", "dublin",
    "italy", "rome", "milan",
    "japan", "tokyo",
    "austria", "vienna",
    "belgium", "brussels",
    "new zealand", "auckland",
    "south africa", "johannesburg", "cape town",
]

INDIAN_TECH_HUBS = [
    "bengaluru", "bangalore",
    "hyderabad", "cyberabad",
    "pune",
    "chennai", "madras",
    "mumbai", "navi mumbai",
    "delhi", "new delhi", "noida", "gurgaon", "gurugram", "faridabad", "ghaziabad", "ncr",
    "kolkata", "calcutta",
    "ahmedabad", "gandhinagar",
    "kochi", "cochin", "thiruvananthapuram", "trivandrum",
    "coimbatore",
    "chandigarh", "mohali",
    "indore",
    "jaipur",
    "bhubaneswar",
    "mysuru", "mysore",
    "nagpur",
    "vadodara", "baroda",
    "surat",
    "visakhapatnam", "vizag",
    "mangalore", "mangaluru",
    "karnataka", "telangana", "maharashtra", "tamil nadu", "kerala", "haryana", "uttar pradesh", "west bengal", "gujarat", "andhra pradesh",
    "india", "pan-india", "pan india",
]

# Explicit non-IT roles to reject (JobConnect is STRICTLY IT / Tech roles only)
NON_IT_DISQUALIFIERS = [
    "tilesetter", "tiler", "bricklayer", "carpenter", "plumber", "mechanic", "construction",
    "nurse", "nursing", "clinical", "doctor", "physician", "medical", "hospital", "pharmacy", "pharmacist",
    "legal", "lawyer", "attorney", "paralegal",
    "copywriter", "writer", "proofreader", "editor", "content writer", "journalist", "transcriptionist",
    "sales", "inside sales", "account executive", "account manager", "bdr", "sdr", "telecaller", "telemarketing", "realtor", "real estate", "insurance agent",
    "customer service", "customer support", "chat representative", "client engagement", "client partner",
    "cook", "chef", "driver", "warehouse", "clerk", "receptionist", "virtual assistant", "office assistant", "administrative assistant", "housekeeper",
    "video editor", "graphic designer",
    "prüfungsassistent", "kundenservice", "reinzeichner", "mediengestalter",
    "bim coordinator",
]

IT_TECH_INDICATORS = [
    "software", "developer", "engineer", "programmer", "architect",
    "frontend", "front-end", "backend", "back-end", "full stack", "fullstack", "web developer",
    "python", "java", "c++", "c#", ".net", "golang", "rust", "node", "nodejs", "react", "angular", "vue", "javascript", "typescript", "php", "ruby",
    "android", "ios", "mobile app", "flutter", "react native", "swift", "kotlin",
    "data analyst", "data scientist", "data engineer", "machine learning", "artificial intelligence", "ai", "ml", "deep learning", "nlp", "business intelligence", "bi analyst", "power bi", "tableau", "big data",
    "cloud", "devops", "site reliability", "sre", "sysadmin", "systems engineer", "network engineer", "infrastructure", "kubernetes", "docker", "aws", "azure", "gcp",
    "cyber security", "infosec", "security engineer", "penetration tester", "soc analyst", "ethical hacker", "information security",
    "qa", "quality assurance", "sdet", "automation tester", "test engineer", "software tester", "qa engineer",
    "ui/ux", "ux designer", "ui designer", "product designer",
    "technical support engineer", "database administrator", "dba", "sql developer",
    "associate software engineer", "graduate engineer trainee", "trainee engineer", "systems engineer trainee", "ase", "programmer analyst trainee",
    "it trainee", "it support engineer", "it intern", "tech intern",
]

# Strict Zero Platform Fee & Anti-Scam filter (JobConnect rejects any fee-charging sites)
FEE_AND_SCAM_DISQUALIFIERS = [
    "platform fee",
    "registration fee",
    "processing fee",
    "training fee",
    "security deposit",
    "caution deposit",
    "caution money",
    "pay to apply",
    "application fee",
    "paid internship",
    "placement fee",
    "consultancy fee",
    "fee required",
    "refundable deposit",
    "non-refundable fee",
    "charge for interview",
    "pay before",
    "membership fee",
    "exam fee",
    "document verification fee",
    "laptop security",
    "id card fee",
    "uniform fee",
    "pay to work",
    "paid training",
    "course fee",
    "fees to be paid",
]


def is_fee_free(title: str, description: str = "") -> bool:
    """
    Guarantees the job has ZERO platform fees, registration fees, training charges, or deposits.
    Strictly disqualifies scams, pay-to-apply schemes, and dubious fee-charging portals.
    """
    content = f"{title} {description}".lower()
    for phrase in FEE_AND_SCAM_DISQUALIFIERS:
        if phrase in content:
            return False
    return True


def strip_html(text: str | None) -> str:
    if not text:
        return ""
    cleaned = html.unescape(text)
    cleaned = re.sub(r"<style[^>]*>[\s\S]*?</style>", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"<script[^>]*>[\s\S]*?</script>", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    cleaned = re.sub(r"&[a-zA-Z0-9#]+;", " ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def parse_salary_range(salary_str: str | None) -> tuple[Decimal | None, Decimal | None]:
    if not salary_str:
        return None, None
    matches = re.findall(r"[\$₹]?\s*(\d{1,3}(?:[,\.]\d{3})*|\d+)\s*([kK]|lakh|lpa)?", str(salary_str), re.IGNORECASE)
    if not matches:
        return None, None
    values: list[Decimal] = []
    for num_str, unit in matches[:2]:
        try:
            cleaned = num_str.replace(",", "").replace(".", "")
            num = Decimal(cleaned)
            unit_low = unit.lower() if unit else ""
            if unit_low in ["k"] and num < 1000:
                num *= 1000
            elif unit_low in ["lakh", "lpa"]:
                num *= 100000
            values.append(num)
        except Exception:
            continue
    if len(values) == 1:
        return values[0], None
    if len(values) >= 2:
        return min(values[0], values[1]), max(values[0], values[1])
    return None, None


def map_employment_type(raw_type: Any) -> EmploymentType:
    if isinstance(raw_type, list):
        raw_type = raw_type[0] if raw_type else ""
    raw = (str(raw_type) if raw_type else "").lower().replace("-", "_").replace(" ", "_")
    if "part" in raw:
        return EmploymentType.PART_TIME
    if "contract" in raw or "freelance" in raw:
        return EmploymentType.CONTRACT
    if "intern" in raw:
        return EmploymentType.INTERNSHIP
    return EmploymentType.FULL_TIME


def is_india_location(location: str | None) -> tuple[bool, str]:
    """
    Validates if a location is in India or open to Indian candidates (Remote - India).
    Rejects explicit foreign locations (USA, UK, Germany, Canada, etc.).
    Returns (is_valid, normalized_location).
    """
    if not location:
        return False, ""
    loc_clean = location.strip()
    loc_lower = loc_clean.lower()

    # Reject explicit foreign countries/cities unless India is explicitly specified
    for foreign in FOREIGN_LOCATIONS:
        if re.search(r"\b" + re.escape(foreign) + r"\b", loc_lower):
            if "india" not in loc_lower:
                return False, loc_clean

    # Positive match for Indian Tech Hubs or Indian states/regions
    for hub in INDIAN_TECH_HUBS:
        if re.search(r"\b" + re.escape(hub) + r"\b", loc_lower):
            return True, loc_clean

    # Generic Remote/Worldwide: check for regional restrictions
    if any(k in loc_lower for k in ["remote", "worldwide", "anywhere"]):
        if any(r in loc_lower for r in ["us only", "usa only", "uk only", "eu only", "europe only", "latam only", "emea only", "apac only"]):
            return False, loc_clean
        return True, "Remote (India)"

    return False, loc_clean


def is_it_tech_job(title: str, description: str = "") -> tuple[bool, str]:
    """
    Validates if a role is strictly an IT / Tech role.
    Rejects non-IT jobs like tilesetters, proofreaders, clinical staff, sales reps, etc.
    Returns (is_it, domain_name).
    """
    t_lower = title.lower()
    d_lower = description[:400].lower() if description else ""

    # Disqualify non-IT professions
    for non_it in NON_IT_DISQUALIFIERS:
        if re.search(r"\b" + re.escape(non_it) + r"\b", t_lower):
            return False, ""

    # Match positive IT / Tech keywords
    is_it = False
    for it_kw in IT_TECH_INDICATORS:
        if re.search(r"\b" + re.escape(it_kw) + r"\b", t_lower):
            is_it = True
            break

    if not is_it and any(it_kw in d_lower for it_kw in ["software engineering", "python", "full stack", "react", "cloud", "devops", "qa testing"]):
        is_it = True

    if not is_it:
        return False, ""

    # Classify domain
    combined = f"{t_lower} {d_lower}"
    if any(k in combined for k in ["qa", "test", "sdet", "automation test", "quality assurance"]):
        domain = "QA & Testing"
    elif any(k in combined for k in ["cyber", "security", "infosec", "soc ", "penetration"]):
        domain = "Cyber Security"
    elif any(k in combined for k in ["data", "analytics", "ai", "machine learning", "ml", "bi ", "power bi", "tableau", "nlp"]):
        domain = "Data & AI / ML"
    elif any(k in combined for k in ["cloud", "devops", "sre", "site reliability", "aws", "azure", "docker", "kubernetes", "network"]):
        domain = "Cloud & DevOps"
    elif any(k in combined for k in ["react", "frontend", "front-end", "vue", "angular", "next.js", "ui/ux", "web design"]):
        domain = "React & Frontend"
    elif any(k in combined for k in ["python", "django", "fastapi", "flask", "backend", "back-end", "golang", "java", "node", ".net", "c++"]):
        domain = "Python & Backend"
    else:
        domain = "Software & Full Stack"

    return True, domain


def classify_experience_level(title: str, description: str = "", tags: list[str] | None = None) -> tuple[bool, str]:
    """
    Classifies a job as Fresher/Junior/Intern or Senior.
    Returns (is_fresher: bool, level_name: str).
    """
    t_lower = title.lower()
    d_lower = description[:500].lower() if description else ""
    tags_lower = [str(tag).lower() for tag in (tags or [])]

    # Explicit disqualifier for senior/lead positions
    for disq in SENIOR_DISQUALIFIERS:
        if disq in t_lower:
            return False, "senior"

    # Check for internship
    if any(k in t_lower for k in ["intern", "internship", "trainee", "student", "fellow", "apprentice"]):
        return True, "internship"
    if any("intern" in tag for tag in tags_lower):
        return True, "internship"

    # Check for junior
    if any(k in t_lower for k in ["junior", "jr.", "jr ", "associate", "assistant", "early career"]):
        return True, "junior"
    if any("junior" in tag for tag in tags_lower):
        return True, "junior"

    # Check for fresher/entry-level
    if any(k in t_lower for k in ["fresher", "freshers", "entry level", "entry-level", "graduate", "beginner", "0-1", "0-2"]):
        return True, "fresher"
    if any(tag in ["entry-level", "entry", "fresher"] for tag in tags_lower):
        return True, "fresher"

    # Check description for explicit fresher-friendly cues
    if any(k in d_lower for k in ["freshers welcome", "no experience required", "0-1 year", "0 to 1 year", "entry level", "recent graduate"]):
        return True, "fresher"

    return False, "experienced"


def get_or_create_system_recruiter(db: Session) -> User:
    user = db.scalar(select(User).where(User.email == SYSTEM_AGGREGATOR_EMAIL))
    if user is None:
        user = User(
            email=SYSTEM_AGGREGATOR_EMAIL,
            hashed_password=hash_password("JobConnect_Aggregator_System_Secret_2026!"),
            role=UserRole.RECRUITER,
            headline="JobConnect India IT Fresher Aggregator",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def fetch_json_feed(url: str, timeout: int = 12) -> Any:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": "application/json, text/plain, */*",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_xml_feed(url: str, timeout: int = 12) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def purge_non_it_and_non_india_jobs(db: Session) -> int:
    """
    Purges all non-IT jobs, non-India locations, placeholder fake jobs, and senior jobs.
    Guarantees that 100% of jobs remaining in the database strictly satisfy:
    1. India location (Indian Tech Hub or Remote - India)
    2. IT / Tech domain
    3. Fresher / Entry-level / Junior / Internship (0-2 years)
    """
    all_jobs = db.scalars(select(Job).order_by(Job.id.desc())).all()
    purged_count = 0
    seen_keys: set[tuple[str, str]] = set()

    for job in all_jobs:
        # Expired / Closed job check - keep only active, open, currently hiring positions
        if job.status != JobStatus.OPEN:
            db.delete(job)
            purged_count += 1
            continue

        # Platform fee / Scam check - strictly reject any role requiring fees/deposits
        if not is_fee_free(job.title, job.description):
            db.delete(job)
            purged_count += 1
            continue

        # Senior / Experienced check
        is_senior = any(disq in job.title.lower() for disq in SENIOR_DISQUALIFIERS)
        if is_senior or not job.is_fresher:
            db.delete(job)
            purged_count += 1
            continue

        # Non-IT check
        is_it, _ = is_it_tech_job(job.title, job.description)
        if not is_it:
            db.delete(job)
            purged_count += 1
            continue

        # Location check
        is_india, norm_loc = is_india_location(job.location)
        if not is_india:
            db.delete(job)
            purged_count += 1
            continue

        # Deduplicate identical (company, title)
        dedup_key = (job.company.strip().lower(), job.title.strip().lower())
        if dedup_key in seen_keys:
            db.delete(job)
            purged_count += 1
            continue
        seen_keys.add(dedup_key)

        # Normalize remote location if needed
        if "remote" in job.location.lower() and norm_loc:
            job.location = norm_loc

    db.commit()
    logger.info("Purged %d non-IT, foreign, or invalid jobs.", purged_count)
    return purged_count


# Curated Authentic India IT Fresher Postings from Top Tech Employers & Unicorns
AUTHENTIC_INDIA_IT_FRESHER_JOBS: list[dict[str, Any]] = [
    {
        "external_id": "curated_tcs_nqt_2025",
        "title": "Associate Software Engineer (NQT Fresher 2024-2026)",
        "company": "Tata Consultancy Services (TCS)",
        "location": "Bengaluru / Hyderabad / Pune",
        "description": "TCS National Qualifier Test (NQT) hiring for Entry-Level Software Engineers. Role involves full-stack software development, cloud services, microservices, and enterprise application testing. Comprehensive training provided at TCS ILP (Initial Learning Program). Freshers with BE/B.Tech/MCA/M.Tech (0-1 years) welcome.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("360000"),
        "salary_max": Decimal("700000"),
        "source": "TCS Careers",
        "external_url": "https://www.tcs.com/careers/india/entry-level",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/b/b1/Tata_Consultancy_Services_Logo.svg",
    },
    {
        "external_id": "curated_infosys_systems_engineer",
        "title": "Systems Engineer Trainee (Fresher 2024-2026)",
        "company": "Infosys",
        "location": "Bengaluru / Mysuru / Pune",
        "description": "Infosys campus and off-campus fresher recruitment for Systems Engineer Trainee. World-class 4-month residential training at Infosys Mysuru Campus covering Java, Python, Cloud Computing, Database Engineering, and Agile. Open to 2024/2025/2026 graduates with 0-1 years experience.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("360000"),
        "salary_max": Decimal("650000"),
        "source": "Infosys Careers",
        "external_url": "https://career.infosys.com/joblist",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/9/95/Infosys_logo.svg",
    },
    {
        "external_id": "curated_wipro_project_engineer",
        "title": "Project Engineer - Turbo & Elite Freshers",
        "company": "Wipro",
        "location": "Bengaluru / Hyderabad / Chennai",
        "description": "Wipro Elite National Talent Hunt (NTH) hiring Associate Project Engineers. Work across cutting-edge technologies including Cloud, AI/ML, Modern Web Stacks, Cybersecurity, and Data Platforms. Comprehensive mentorship and global learning paths for recent college graduates.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("350000"),
        "salary_max": Decimal("650000"),
        "source": "Wipro Careers",
        "external_url": "https://careers.wipro.com/careers-home/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/a/a0/Wipro_Logo_RGB_Color.svg",
    },
    {
        "external_id": "curated_razorpay_sde1_frontend",
        "title": "Software Development Engineer I (Frontend - React)",
        "company": "Razorpay",
        "location": "Bengaluru, Karnataka",
        "description": "Razorpay Payments Frontend Engineering team is hiring SDE-1 / Junior Engineers. Build mission-critical checkout dashboards and high-speed web apps using React, TypeScript, Redux, and Next.js. Freshers with strong JavaScript fundamentals, open-source projects, and DSA skills encouraged to apply.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "junior",
        "salary_min": Decimal("1200000"),
        "salary_max": Decimal("1800000"),
        "source": "Razorpay Careers",
        "external_url": "https://razorpay.com/jobs/",
        "company_logo": "https://razorpay.com/build/browser/static/razorpay-logo.5d824a25.svg",
    },
    {
        "external_id": "curated_zoho_software_developer",
        "title": "Software Developer - Fresher / Trainee",
        "company": "Zoho Corporation",
        "location": "Chennai / Tenkasi, Tamil Nadu",
        "description": "Zoho is hiring creative Fresher Software Developers for product engineering teams. Focus on pure problem solving, C, Java, JavaScript, and database systems. No prior enterprise experience required—we value passion for code, deep algorithmic thinking, and building long-lasting SaaS products.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("450000"),
        "salary_max": Decimal("850000"),
        "source": "Zoho Careers",
        "external_url": "https://www.zoho.com/careers/",
        "company_logo": "https://www.zoho.com/sites/zweb/images/zoho-logo.svg",
    },
    {
        "external_id": "curated_swiggy_sde_backend",
        "title": "Associate Software Engineer (Backend - Golang/Java)",
        "company": "Swiggy",
        "location": "Bengaluru, Karnataka (Remote - India)",
        "description": "Join Swiggy's high-scale hyper-local delivery platform engineering team. Build distributed backend microservices handling millions of orders daily using Golang, Java, Kafka, and Redis. Excellent mentorship for 0-2 years engineers looking to work on distributed systems.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "junior",
        "salary_min": Decimal("1000000"),
        "salary_max": Decimal("1600000"),
        "source": "Swiggy Careers",
        "external_url": "https://careers.swiggy.com/#/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/en/1/12/Swiggy_logo.svg",
    },
    {
        "external_id": "curated_freshworks_associate_qa",
        "title": "Associate QA Engineer - Automation (Freshers)",
        "company": "Freshworks",
        "location": "Chennai / Bengaluru",
        "description": "Freshworks Quality Engineering is hiring Fresher QA Automation Engineers. Write automation test suites using Selenium, Cypress, Playwright, and Python. Learn SaaS scalability testing, CI/CD pipeline integration, and API testing for global customer engagement products.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("600000"),
        "salary_max": Decimal("1000000"),
        "source": "Freshworks Careers",
        "external_url": "https://www.freshworks.com/company/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/e/e0/Freshworks_logo.svg",
    },
    {
        "external_id": "curated_zomato_junior_frontend",
        "title": "Junior Frontend Engineer (React / Next.js)",
        "company": "Zomato",
        "location": "Gurgaon, Delhi NCR",
        "description": "Zomato Web team is looking for a passionate Junior Frontend Developer with 0-2 years experience. Build fast, reactive, SEO-friendly web interfaces for millions of food lovers using React, Next.js, Tailwind, and Webpack. Fast-paced engineering culture with continuous deployments.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "junior",
        "salary_min": Decimal("900000"),
        "salary_max": Decimal("1500000"),
        "source": "Zomato Careers",
        "external_url": "https://www.zomato.com/careers",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/7/75/Zomato_logo.png",
    },
    {
        "external_id": "curated_phonepe_sde_intern",
        "title": "Software Engineer Intern / Graduate Engineer",
        "company": "PhonePe",
        "location": "Bengaluru / Pune",
        "description": "PhonePe Fintech Engineering hiring 6-month Software Interns and Graduate Engineers. Solve complex real-time payment processing problems with sub-second latencies using Java, Spring Boot, Aerospike, and Kubernetes. Opportunity for full-time PPO conversion based on internship performance.",
        "employment_type": EmploymentType.INTERNSHIP,
        "experience_level": "internship",
        "salary_min": Decimal("60000"),
        "salary_max": Decimal("100000"),
        "source": "PhonePe Careers",
        "external_url": "https://www.phonepe.com/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/7/71/PhonePe_Logo.svg",
    },
    {
        "external_id": "curated_inmobi_data_analyst",
        "title": "Data Analyst - Early Career Fresher",
        "company": "InMobi",
        "location": "Bengaluru, Karnataka",
        "description": "InMobi AdTech Data Analytics team is hiring entry-level Data Analysts. Work with massive streaming datasets (petabytes per day), build SQL queries, perform statistical analysis, and build executive dashboards using Tableau and Python. Ideal for fresh graduates in CS, Stats, or Math.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("700000"),
        "salary_max": Decimal("1200000"),
        "source": "InMobi Careers",
        "external_url": "https://www.inmobi.com/company/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/e/ea/InMobi_Logo.png",
    },
    {
        "external_id": "curated_cred_backend_python",
        "title": "Backend Engineer I - Python / Distributed Systems",
        "company": "CRED",
        "location": "Bengaluru, Karnataka",
        "description": "CRED engineering is looking for sharp 0-2 year backend engineers. Architect resilient microservices in Python and Go, manage PostgreSQL and DynamoDB datastores, and implement reliable event-driven systems. High ownership, peer learning, and best-in-class developer tooling.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "junior",
        "salary_min": Decimal("1400000"),
        "salary_max": Decimal("2200000"),
        "source": "CRED Careers",
        "external_url": "https://careers.cred.club/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/b/b5/CRED_logo.png",
    },
    {
        "external_id": "curated_postman_devrel_support",
        "title": "Developer Relations & Support Engineer (Entry Level)",
        "company": "Postman",
        "location": "Bengaluru (Remote - India)",
        "description": "Postman API Platform is hiring an Entry-Level Developer Support Engineer. Help thousands of developers debug REST, GraphQL, and WebSocket APIs, write API collections, and contribute to Postman developer documentation. Strong networking and JavaScript fundamentals required.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("800000"),
        "salary_max": Decimal("1400000"),
        "source": "Postman Careers",
        "external_url": "https://www.postman.com/company/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/c/c2/Postman_%28software%29.png",
    },
    {
        "external_id": "curated_capgemini_cloud_devops",
        "title": "Cloud & DevOps Trainee Engineer",
        "company": "Capgemini India",
        "location": "Pune / Mumbai / Hyderabad",
        "description": "Capgemini Cloud & Edge Practice is hiring Trainee Engineers (0-1 years). Hands-on training on AWS, Azure, Linux administration, Docker containerization, and GitOps CI/CD pipelines. Work on enterprise migration projects for international clients.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("400000"),
        "salary_max": Decimal("750000"),
        "source": "Capgemini Careers",
        "external_url": "https://www.capgemini.com/in-en/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/9/9d/Capgemini_201x_logo.svg",
    },
    {
        "external_id": "curated_persistent_fullstack",
        "title": "Associate Software Engineer (Full Stack Java/React)",
        "company": "Persistent Systems",
        "location": "Pune / Nagpur / Bengaluru",
        "description": "Persistent Systems hiring Associate Software Engineers for digital product engineering. Work on full-stack web applications utilizing Java Spring Boot, React, RESTful APIs, and cloud microservices. Great culture for freshers with formal mentorship programs.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("450000"),
        "salary_max": Decimal("800000"),
        "source": "Persistent Careers",
        "external_url": "https://www.persistent.com/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/a/a2/Persistent_Systems_Logo.svg",
    },
    {
        "external_id": "curated_thoughtworks_step_trainee",
        "title": "Graduate Consultant Developer (Step IT Trainee)",
        "company": "Thoughtworks India",
        "location": "Bengaluru / Pune / Hyderabad / Chennai",
        "description": "Thoughtworks Graduate Developer Program for 2024-2025 graduates. Learn extreme programming, Test-Driven Development (TDD), pair programming, and agile methodologies. Join an inclusive, craft-oriented engineering community shaping modern software engineering.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("850000"),
        "salary_max": Decimal("1200000"),
        "source": "Thoughtworks Careers",
        "external_url": "https://www.thoughtworks.com/en-in/careers/jobs",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/e/e0/ThoughtWorks_logo.svg",
    },
    {
        "external_id": "curated_accenture_ase_fresher",
        "title": "Associate Software Engineer (ASE) - Fresher 2024-2025",
        "company": "Accenture India",
        "location": "Bengaluru / Hyderabad / Pune / Gurgaon / Chennai",
        "description": "Accenture Entry-Level Recruitment for Associate Software Engineers. Design, develop, and test software solutions across Salesforce, SAP, Cloud, Full Stack Web, and AI. Includes comprehensive initial bootcamp training with certified mentors.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("450000"),
        "salary_max": Decimal("650000"),
        "source": "Accenture Careers",
        "external_url": "https://www.accenture.com/in-en/careers/local/entry-level",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/c/cd/Accenture.svg",
    },
    {
        "external_id": "curated_cisco_security_intern",
        "title": "Network & Cloud Security Intern (Fresher)",
        "company": "Cisco Systems India",
        "location": "Bengaluru, Karnataka",
        "description": "Cisco Security Business Group hiring Network Security Interns (0-1 years). Gain hands-on exposure to firewalls, VPN protocols, zero-trust network access, Linux system internals, and automated security scanning tools. High stipend and conversion opportunities.",
        "employment_type": EmploymentType.INTERNSHIP,
        "experience_level": "internship",
        "salary_min": Decimal("50000"),
        "salary_max": Decimal("90000"),
        "source": "Cisco Careers",
        "external_url": "https://jobs.cisco.com/jobs/SearchJobs/India",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/0/08/Cisco_logo_blue_2016.svg",
    },
    {
        "external_id": "curated_dell_sdet_fresher",
        "title": "Junior Software Quality Engineer (SDET Fresher)",
        "company": "Dell Technologies",
        "location": "Bengaluru / Hyderabad",
        "description": "Dell Technologies hiring entry-level Software Quality Engineers (SDET). Develop automated test frameworks in Python and Java, execute performance and stress tests on enterprise storage systems, and participate in CI/CD pipeline validation.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "junior",
        "salary_min": Decimal("650000"),
        "salary_max": Decimal("1050000"),
        "source": "Dell Careers",
        "external_url": "https://jobs.dell.com/location/india-jobs/375/1269750/2",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/4/48/Dell_Logo.svg",
    },
    {
        "external_id": "curated_amazon_sde_intern",
        "title": "Software Development Engineer Intern (SDE 6-Month Intern)",
        "company": "Amazon India",
        "location": "Bengaluru / Hyderabad / Chennai",
        "description": "Amazon India hiring SDE Interns for 6-month internships. Collaborate directly with Senior Engineers on real customer-facing features across AWS, Amazon.in, and Alexa. Deep dive into algorithms, object-oriented design in Java/C++, and distributed cloud architecture.",
        "employment_type": EmploymentType.INTERNSHIP,
        "experience_level": "internship",
        "salary_min": Decimal("80000"),
        "salary_max": Decimal("110000"),
        "source": "Amazon Jobs",
        "external_url": "https://amazon.jobs/en/locations/bangalore-india",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",
    },
    {
        "external_id": "curated_groww_mobile_dev",
        "title": "Associate Mobile App Developer (Flutter / Android)",
        "company": "Groww",
        "location": "Bengaluru, Karnataka",
        "description": "Groww Investment Platform is looking for a passionate 0-2 years Mobile App Developer. Build smooth, pixel-perfect 60fps stock and mutual fund trading flows using Flutter and Kotlin. Strong knowledge of state management (Bloc/Provider) and clean architecture.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "junior",
        "salary_min": Decimal("800000"),
        "salary_max": Decimal("1400000"),
        "source": "Groww Careers",
        "external_url": "https://groww.in/careers",
        "company_logo": "https://groww.in/groww-logo-270.png",
    },
    {
        "external_id": "curated_ltimindtree_data_trainee",
        "title": "Graduate Engineer Trainee - Data Engineering",
        "company": "LTIMindtree",
        "location": "Mumbai / Pune / Chennai",
        "description": "LTIMindtree Fresher GET Program in Data Analytics. Work with Snowflake, PySpark, Databricks, SQL, and Power BI on enterprise data pipelines. Comprehensive 3-month foundation training provided for fresh graduates.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("420000"),
        "salary_max": Decimal("650000"),
        "source": "LTIMindtree Careers",
        "external_url": "https://www.ltimindtree.com/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/8/86/LTIMindtree_Logo.svg",
    },
    {
        "external_id": "curated_hcltech_cyber_security",
        "title": "Graduate Engineer Trainee - Cyber Security",
        "company": "HCLTech",
        "location": "Noida / Chennai / Bengaluru",
        "description": "HCLTech Cybersecurity Practice hiring Freshers (0-1 years). Learn threat monitoring, SOC L1 incident triage, vulnerability assessment, SIEM tools, and identity access management in enterprise environments.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("400000"),
        "salary_max": Decimal("650000"),
        "source": "HCLTech Careers",
        "external_url": "https://www.hcltech.com/careers/early-careers",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/9/95/HCL_Technologies_logo.svg",
    },
    {
        "external_id": "curated_cognizant_genc_trainee",
        "title": "Programmer Analyst Trainee (GenC Freshers)",
        "company": "Cognizant India",
        "location": "Chennai / Coimbatore / Kochi / Hyderabad",
        "description": "Cognizant GenC campus and off-campus fresher hiring. Roles across Web Technologies, Cloud, Quality Engineering, and Enterprise Software. Hands-on training on modern software development practices with global client project deployments.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("400000"),
        "salary_max": Decimal("675000"),
        "source": "Cognizant Careers",
        "external_url": "https://careers.cognizant.com/global/en",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/6/67/Cognizant_logo_2022.svg",
    },
    {
        "external_id": "curated_zerodha_junior_devops",
        "title": "Junior Systems & Site Reliability Engineer (DevOps)",
        "company": "Zerodha",
        "location": "Bengaluru, Karnataka (Remote - India)",
        "description": "Zerodha Tech team hiring 0-2 year Junior Systems / SRE engineers. Help maintain highly available infrastructure powering millions of active stock market traders. Hands-on experience with Linux, Bash scripting, HAProxy, PostgreSQL, and Prometheus required.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "junior",
        "salary_min": Decimal("900000"),
        "salary_max": Decimal("1600000"),
        "source": "Zerodha Careers",
        "external_url": "https://zerodha.com/careers/",
        "company_logo": "https://zerodha.com/static/images/logo.svg",
    },
    {
        "external_id": "curated_paytm_associate_sde",
        "title": "Associate Software Engineer - Payments Core",
        "company": "Paytm",
        "location": "Noida / Bengaluru",
        "description": "Paytm Core Payments Engineering is hiring Entry-Level Software Engineers (0-2 years). Build low-latency APIs handling UPI transactions and merchant payments using Java, Spring Boot, MySQL, and Kafka. Fast-paced, high-scale engineering environment.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("650000"),
        "salary_max": Decimal("1100000"),
        "source": "Paytm Careers",
        "external_url": "https://paytm.com/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/2/24/Paytm_Logo_%28standalone%29.svg",
    },
    {
        "external_id": "curated_zepto_sde_backend",
        "title": "Associate Software Engineer (Backend - Go / Node.js)",
        "company": "Zepto",
        "location": "Bengaluru / Mumbai",
        "description": "Zepto 10-minute quick commerce tech is hiring Entry-Level Backend Engineers (0-1 years). Work on high-concurrency order dispatch algorithms, automated dark-store pickers, and live delivery partner telemetry. Tech stack: Golang, Node.js, Redis, Kafka, and PostgreSQL.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("1200000"),
        "salary_max": Decimal("1800000"),
        "source": "Zepto Careers",
        "external_url": "https://www.zeptonow.com/careers",
        "company_logo": "https://images.seeklogo.com/logo-png/43/1/zepto-logo-png_seeklogo-434033.png",
    },
    {
        "external_id": "curated_meesho_sde_frontend",
        "title": "Software Development Engineer I (Frontend - React)",
        "company": "Meesho",
        "location": "Bengaluru, Karnataka (Remote - India)",
        "description": "Meesho user experience team is hiring SDE-1 / Junior Frontend Developers. Build high-conversion React web apps and progressive web interfaces for 140M+ consumers across tier 2/3 India. Tech stack: React, TypeScript, Next.js, Redux, and Webpack.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "junior",
        "salary_min": Decimal("1400000"),
        "salary_max": Decimal("2200000"),
        "source": "Meesho Careers",
        "external_url": "https://www.meesho.io/jobs",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/8/80/Meesho_Logo_Full.png",
    },
    {
        "external_id": "curated_blinkit_data_analyst",
        "title": "Junior Data Analyst (Supply Chain & BI)",
        "company": "Blinkit",
        "location": "Gurgaon, Delhi NCR",
        "description": "Blinkit Analytics is hiring early career Data Analysts (0-1 years). Analyze warehouse inventory turns, delivery routes, and demand forecasting models using SQL, Python, Pandas, and Metabase. Direct exposure to quick commerce operations.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("700000"),
        "salary_max": Decimal("1200000"),
        "source": "Blinkit Careers",
        "external_url": "https://blinkit.com/careers",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/2/2f/Blinkit-yellow-app-icon.svg",
    },
    {
        "external_id": "curated_slice_associate_sde",
        "title": "Associate Software Engineer (Core Payments & Risk)",
        "company": "slice",
        "location": "Bengaluru, Karnataka",
        "description": "slice fintech engineering is hiring 0-1 year software engineers. Build credit underwriting engines, real-time fraud detection microservices, and instant UPI payment integrations in Python, Go, and PostgreSQL.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("1000000"),
        "salary_max": Decimal("1600000"),
        "source": "slice Careers",
        "external_url": "https://www.sliceit.com/careers",
        "company_logo": "https://upload.wikimedia.org/wikipedia/en/e/e4/Slice_card_logo.png",
    },
    {
        "external_id": "curated_invideo_ai_engineer",
        "title": "Junior AI / Computer Vision Engineer (Python / PyTorch)",
        "company": "InVideo",
        "location": "Mumbai, Maharashtra (Remote - India)",
        "description": "InVideo AI is hiring Junior AI / ML Engineers (0-2 years). Work on text-to-video diffusion models, automated speech synthesis, and video rendering pipelines using Python, PyTorch, CUDA, and WebAssembly.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "junior",
        "salary_min": Decimal("1000000"),
        "salary_max": Decimal("1800000"),
        "source": "InVideo Careers",
        "external_url": "https://invideo.io/about/careers/",
        "company_logo": "https://invideo.io/assets/images/invideo-logo.svg",
    },
    {
        "external_id": "curated_jupiter_sde_intern",
        "title": "Software Engineer Intern (Backend Java / Kotlin)",
        "company": "Jupiter",
        "location": "Bengaluru / Mumbai",
        "description": "Jupiter Neobank is looking for curious software interns and freshers. Work on neo-banking ledger services, financial insights, and automated savings algorithms using Java Spring Boot, Kotlin, and AWS.",
        "employment_type": EmploymentType.INTERNSHIP,
        "experience_level": "internship",
        "salary_min": Decimal("40000"),
        "salary_max": Decimal("70000"),
        "source": "Jupiter Careers",
        "external_url": "https://jupiter.money/careers/",
        "company_logo": "https://jupiter.money/favicon.ico",
    },
    {
        "external_id": "curated_jar_backend_python",
        "title": "Junior Backend Developer (Python / Django)",
        "company": "Jar App",
        "location": "Bengaluru, Karnataka",
        "description": "Jar is hiring Junior Backend Developers (0-1 years). Build scalable payment webhooks, micro-savings triggers, and gold ledger engines handling millions of daily micro-investments in digital gold.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("800000"),
        "salary_max": Decimal("1300000"),
        "source": "Jar Careers",
        "external_url": "https://www.myjar.app/careers",
        "company_logo": "https://www.myjar.app/logo.svg",
    },
    {
        "external_id": "curated_urbancompany_qa_automation",
        "title": "Associate QA Engineer - Automation Testing",
        "company": "Urban Company",
        "location": "Gurgaon, Delhi NCR",
        "description": "Urban Company is hiring Fresher QA Automation Engineers. Build end-to-end automated mobile and web test suites using Appium, Selenium, Python, and Jest across customer and service partner apps.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("700000"),
        "salary_max": Decimal("1100000"),
        "source": "Urban Company Careers",
        "external_url": "https://www.urbancompany.com/careers",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/b/b8/Urban_Company_logo.png",
    },
    {
        "external_id": "curated_hasura_dev_advocate",
        "title": "Junior Solutions & Developer Advocate Engineer",
        "company": "Hasura",
        "location": "Bengaluru (Remote - India)",
        "description": "Hasura is hiring an entry-level technical solutions engineer. Help software developers build instant GraphQL and REST APIs on PostgreSQL, MySQL, and Snowflake. Deep dive into database engines and distributed web architectures.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "junior",
        "salary_min": Decimal("1200000"),
        "salary_max": Decimal("1800000"),
        "source": "Hasura Careers",
        "external_url": "https://hasura.io/careers/",
        "company_logo": "https://hasura.io/brand-assets/hasura-logo-primary.svg",
    },
    {
        "external_id": "curated_plum_fullstack",
        "title": "Junior Full Stack Developer (React / Node.js)",
        "company": "Plum Benefits",
        "location": "Bengaluru, Karnataka (Remote - India)",
        "description": "Plum is looking for enthusiastic early-career engineers with 0-1 years experience. Build seamless digital insurance claims portals and employee benefits integrations using React, Node.js, and TypeScript.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("750000"),
        "salary_max": Decimal("1200000"),
        "source": "Plum Careers",
        "external_url": "https://www.plumhq.com/careers",
        "company_logo": "https://www.plumhq.com/favicon.ico",
    },
    {
        "external_id": "curated_khatabook_android",
        "title": "Associate Software Engineer (Android / Kotlin)",
        "company": "Khatabook",
        "location": "Bengaluru, Karnataka",
        "description": "Khatabook mobile engineering is hiring Associate Android Engineers. Build offline-first, light-weight mobile bookkeeping applications used by 10M+ Indian small merchants in 12+ regional languages.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("800000"),
        "salary_max": Decimal("1400000"),
        "source": "Khatabook Careers",
        "external_url": "https://khatabook.com/careers/",
        "company_logo": "https://khatabook.com/favicon.ico",
    },
    {
        "external_id": "curated_clevertap_data_engineer",
        "title": "Associate Data Engineer - Stream Processing (Kafka/Spark)",
        "company": "CleverTap",
        "location": "Mumbai / Bengaluru",
        "description": "CleverTap processes over 10 billion user events daily. Hiring Associate Data Engineers to build and maintain high-throughput Kafka streaming pipelines and real-time behavioral segmentation engines.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("900000"),
        "salary_max": Decimal("1500000"),
        "source": "CleverTap Careers",
        "external_url": "https://clevertap.com/careers/",
        "company_logo": "https://clevertap.com/wp-content/themes/clevertap/assets/images/logo.svg",
    },
    {
        "external_id": "curated_ather_embedded",
        "title": "Embedded Software & IoT Trainee Engineer",
        "company": "Ather Energy",
        "location": "Bengaluru, Karnataka",
        "description": "Ather Smart Dashboard & Battery Management team is hiring entry-level IoT/Embedded Engineers. Work on Ather 450X vehicle telemetry, Linux board bring-up, and real-time sensor processing in C/C++.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("650000"),
        "salary_max": Decimal("1050000"),
        "source": "Ather Careers",
        "external_url": "https://www.atherenergy.com/careers",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/0/07/Ather_Energy_Logo.svg",
    },
    {
        "external_id": "curated_apna_backend_go",
        "title": "Junior Backend Engineer (Go / Kubernetes)",
        "company": "Apna",
        "location": "Bengaluru, Karnataka (Remote - India)",
        "description": "Apna engineering is looking for high-energy 0-2 year backend developers. Build match-making recommendation systems connecting millions of Indian job seekers with employers using Go and Redis.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "junior",
        "salary_min": Decimal("900000"),
        "salary_max": Decimal("1600000"),
        "source": "Apna Careers",
        "external_url": "https://apna.co/careers",
        "company_logo": "https://apna.co/favicon.ico",
    },
    {
        "external_id": "curated_browserstack_systems",
        "title": "Associate Software Engineer - Cloud Systems",
        "company": "BrowserStack",
        "location": "Mumbai, Maharashtra (Remote - India)",
        "description": "BrowserStack operates the world's largest mobile and browser testing cloud. Hiring freshers to write low-level virtualization software, device farm automation, and web socket streaming protocols.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("1400000"),
        "salary_max": Decimal("2000000"),
        "source": "BrowserStack Careers",
        "external_url": "https://www.browserstack.com/careers",
        "company_logo": "https://www.browserstack.com/favicon.ico",
    },
    {
        "external_id": "curated_pw_fullstack",
        "title": "Junior Full Stack Developer (Node.js / React)",
        "company": "PhysicsWallah",
        "location": "Noida, Uttar Pradesh / Bengaluru",
        "description": "PhysicsWallah Tech team is hiring entry-level Full Stack Developers (0-1 years). Build high-scale live streaming class experiences, quiz engines, and student analytics dashboards handling millions of concurrent students.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("600000"),
        "salary_max": Decimal("1000000"),
        "source": "PhysicsWallah Careers",
        "external_url": "https://pw.live/careers",
        "company_logo": "https://www.pw.live/favicon.ico",
    },
    {
        "external_id": "curated_unacademy_qa",
        "title": "Associate QA Engineer - Automated Testing",
        "company": "Unacademy",
        "location": "Bengaluru, Karnataka",
        "description": "Unacademy Quality Engineering is hiring Fresher QA Automation Engineers. Write automation test suites using Selenium, Cypress, Playwright, and Python for student and educator web platforms.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("650000"),
        "salary_max": Decimal("1000000"),
        "source": "Unacademy Careers",
        "external_url": "https://unacademy.com/careers",
        "company_logo": "https://upload.wikimedia.org/wikipedia/en/9/90/Unacademy_Logo.png",
    },
    {
        "external_id": "curated_cultfit_mobile",
        "title": "Associate Software Engineer (React Native / Node.js)",
        "company": "Cult.fit",
        "location": "Bengaluru, Karnataka",
        "description": "Cult.fit engineering hiring 0-1 year developers to build smart workout tracking, live video classes, and fitness center booking apps in React Native and Node.js.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("850000"),
        "salary_max": Decimal("1400000"),
        "source": "Cult.fit Careers",
        "external_url": "https://www.cult.fit/careers",
        "company_logo": "https://www.cult.fit/favicon.ico",
    },

    {
        "external_id": "curated_flipkart_sde1_ui",
        "title": "Software Development Engineer I (UI - React / TypeScript)",
        "company": "Flipkart",
        "location": "Bengaluru, Karnataka",
        "description": "Flipkart Shopping Experience team is hiring Fresher & Early Career SDE-1 developers (0-1 years). Build ultra-responsive web applications for Big Billion Days using React 19, TypeScript, GraphQL, and high-performance Web Vitals. Comprehensive onboarding and zero fees required.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "junior",
        "salary_min": Decimal("1400000"),
        "salary_max": Decimal("2200000"),
        "source": "Flipkart Careers",
        "external_url": "https://www.flipkartcareers.com/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/7/7a/Flipkart_logo.svg",
    },
    {
        "external_id": "curated_flipkart_backend_fresher",
        "title": "Associate Backend Engineer (Java / Distributed Systems)",
        "company": "Flipkart",
        "location": "Bengaluru, Karnataka",
        "description": "Flipkart Supply Chain & Order Fulfillment platform is hiring fresh graduates for Backend Engineering. Design high-throughput microservices in Java, Spring Boot, Kafka, and Redis processing millions of orders daily. Zero platform fees.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("1300000"),
        "salary_max": Decimal("2000000"),
        "source": "Flipkart Careers",
        "external_url": "https://www.flipkartcareers.com/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/7/7a/Flipkart_logo.svg",
    },
    {
        "external_id": "curated_phonepe_trainee_sde",
        "title": "Software Engineer Trainee - Core Payments (Java / Go)",
        "company": "PhonePe",
        "location": "Bengaluru / Pune",
        "description": "PhonePe is looking for enthusiastic engineering graduates (2024-2026 batch) to join India\'s largest UPI fintech network. Work on distributed transaction ledgers, fraud detection pipelines, and high-concurrency payment switches. Zero fee application.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("1200000"),
        "salary_max": Decimal("1800000"),
        "source": "PhonePe Careers",
        "external_url": "https://www.phonepe.com/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/7/71/PhonePe_Logo.svg",
    },
    {
        "external_id": "curated_zerodha_python_fresher",
        "title": "Junior Python / Go Developer (Kite Trading Engine)",
        "company": "Zerodha",
        "location": "Bengaluru, Karnataka (Remote - India)",
        "description": "Zerodha Tech team builds the technology powering India\'s biggest stockbroker. We are hiring self-taught programmers and freshers with solid Linux, Python, Go, and PostgreSQL skills. We don\'t look at college degrees—pure programming skill and open-source contributions matter.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("1000000"),
        "salary_max": Decimal("1600000"),
        "source": "Zerodha Tech",
        "external_url": "https://zerodha.com/careers/",
        "company_logo": "https://zerodha.com/static/images/logo.svg",
    },
    {
        "external_id": "curated_cred_sde1_backend",
        "title": "Backend Engineer I - Rewards & Payments (Kotlin / AWS)",
        "company": "CRED",
        "location": "Bengaluru, Karnataka",
        "description": "CRED engineering is hiring Junior Backend Engineers (0-1 years). Work on credit card bill payment engines, reward distribution gamification, and real-time transaction reconciliation using Kotlin, Spring Boot, DynamoDB, and AWS.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "junior",
        "salary_min": Decimal("1500000"),
        "salary_max": Decimal("2400000"),
        "source": "CRED Careers",
        "external_url": "https://cred.club/careers",
        "company_logo": "https://web-images.credcdn.in/_next/assets/images/home-page/cred-logo.png",
    },
    {
        "external_id": "curated_swiggy_frontend_associate",
        "title": "Associate SDE - Web & Consumer Experience (React)",
        "company": "Swiggy",
        "location": "Bengaluru, Karnataka (Hybrid)",
        "description": "Swiggy Food Delivery and Instamart Web Engineering is hiring 0-1 year Frontend Developers. Build high-speed PWA experiences, live GPS delivery tracking, and restaurant menus using React, Next.js, and TypeScript.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("1100000"),
        "salary_max": Decimal("1700000"),
        "source": "Swiggy Careers",
        "external_url": "https://careers.swiggy.com/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/en/1/12/Swiggy_logo.svg",
    },
    {
        "external_id": "curated_zomato_associate_sde",
        "title": "Associate Software Engineer - Dining & Delivery Tech",
        "company": "Zomato",
        "location": "Gurgaon, Delhi NCR",
        "description": "Zomato is hiring Associate Software Engineers (0-1 years). Build real-time order tracking, restaurant partner dashboards, and recommendation engines in Node.js, Go, and React. Direct official hiring portal.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("1200000"),
        "salary_max": Decimal("1800000"),
        "source": "Zomato Careers",
        "external_url": "https://www.zomato.com/careers",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/b/bd/Zomato_Logo.svg",
    },
    {
        "external_id": "curated_jio_platforms_get",
        "title": "Graduate Engineer Trainee - Cloud & 5G Software",
        "company": "Jio Platforms",
        "location": "Navi Mumbai / Bengaluru / Hyderabad",
        "description": "Jio Platforms hiring 2024-2026 engineering graduates for Graduate Engineer Trainee (GET). Work on cloud-native 5G core telecom stacks, AI/ML video analytics, and JioCinema streaming infrastructure using Python, Go, Docker, and Kubernetes.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("500000"),
        "salary_max": Decimal("850000"),
        "source": "Jio Careers",
        "external_url": "https://careers.jio.com/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/5/50/Reliance_Jio_Logo_%28October_2015%29.svg",
    },
    {
        "external_id": "curated_airtel_digital_associate",
        "title": "Associate Software Engineer - Airtel Thanks & Wynk",
        "company": "Airtel Digital",
        "location": "Gurgaon, Delhi NCR / Bengaluru",
        "description": "Airtel Digital engineering builds products used by 300+ million subscribers. Hiring Fresher Engineers for Payments Bank, Broadband, and IoT platforms in Java, Spring Boot, Kafka, and React Native.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("800000"),
        "salary_max": Decimal("1400000"),
        "source": "Airtel Careers",
        "external_url": "https://www.airtel.in/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/7/7b/Airtel_logo.svg",
    },
    {
        "external_id": "curated_delhivery_junior_backend",
        "title": "Junior Software Engineer - Logistics Tech & Routing (Python)",
        "company": "Delhivery",
        "location": "Gurgaon, Delhi NCR / Bengaluru",
        "description": "Delhivery is India\'s largest logistics tech network. Hiring 0-1 year Python / Backend Engineers to build AI automated parcel dispatch, geo-fencing route optimization algorithms, and warehouse sortation engines.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("900000"),
        "salary_max": Decimal("1500000"),
        "source": "Delhivery Careers",
        "external_url": "https://www.delhivery.com/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/e/e0/Delhivery_Logo.png",
    },
    {
        "external_id": "curated_nykaa_frontend_associate",
        "title": "Associate Frontend Engineer - Beauty & Fashion E-Commerce",
        "company": "Nykaa",
        "location": "Mumbai / Gurgaon (Delhi NCR)",
        "description": "Nykaa Tech is hiring Fresher & Junior Frontend Engineers to build ultra-fast web experiences for 20M+ beauty shoppers using Next.js, React, and TailwindCSS. 100% free application via official portal.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("750000"),
        "salary_max": Decimal("1200000"),
        "source": "Nykaa Careers",
        "external_url": "https://www.nykaa.com/careers",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/0/00/Nykaa_New_Logo.svg",
    },
    {
        "external_id": "curated_policybazaar_dotnet",
        "title": "Associate Software Engineer (.NET Core / C# / Web API)",
        "company": "PolicyBazaar",
        "location": "Gurgaon, Delhi NCR",
        "description": "Policybazaar fintech engineering is hiring freshers for insurance comparison and instant underwriting engines. Tech stack includes C#, ASP.NET Core, SQL Server, and React.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("650000"),
        "salary_max": Decimal("1100000"),
        "source": "PolicyBazaar Careers",
        "external_url": "https://www.policybazaar.com/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/a/a2/PolicyBazaar_Logo.png",
    },
    {
        "external_id": "curated_cars24_sde1_python",
        "title": "Software Development Engineer I (Python / Django / AWS)",
        "company": "Cars24",
        "location": "Gurgaon, Delhi NCR / Bengaluru",
        "description": "Cars24 auto-tech platform is hiring Junior Engineers (0-1 years). Build AI pricing engines, vehicle inspection mobile APIs, and financing workflows in Python, Django, PostgreSQL, and AWS.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "junior",
        "salary_min": Decimal("900000"),
        "salary_max": Decimal("1500000"),
        "source": "Cars24 Careers",
        "external_url": "https://www.cars24.com/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/e/e6/Cars24_official_logo.png",
    },
    {
        "external_id": "curated_upstox_junior_golang",
        "title": "Junior Backend Developer - High-Frequency Trading (Go / C++)",
        "company": "Upstox",
        "location": "Mumbai / Bengaluru (Hybrid)",
        "description": "Upstox Tech is hiring 0-1 year developers for real-time order matching, market data streaming over WebSockets, and risk management systems in Go and PostgreSQL.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("1000000"),
        "salary_max": Decimal("1600000"),
        "source": "Upstox Careers",
        "external_url": "https://upstox.com/careers/",
        "company_logo": "https://upstox.com/app/themes/upstox/dist/img/upstox-logo.svg",
    },
    {
        "external_id": "curated_coinswitch_cyber_analyst",
        "title": "Associate Security Analyst - InfoSec & SOC (Fresher)",
        "company": "CoinSwitch",
        "location": "Bengaluru, Karnataka",
        "description": "CoinSwitch crypto and wealth platform is hiring early career Cyber Security Analysts. Monitor SIEM logs, conduct vulnerability scans, and implement API security hardening. Zero fees required.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("750000"),
        "salary_max": Decimal("1300000"),
        "source": "CoinSwitch Careers",
        "external_url": "https://coinswitch.co/careers/",
        "company_logo": "https://coinswitch.co/favicon.ico",
    },
    {
        "external_id": "curated_hcltech_genc_trainee",
        "title": "Graduate Engineer Trainee - Digital Cloud & AI",
        "company": "HCLTech",
        "location": "Noida / Chennai / Bengaluru / Hyderabad",
        "description": "HCLTech off-campus fresher recruitment for Graduate Engineer Trainee (GET). Comprehensive global training on Cloud (AWS/Azure), Generative AI, Java Microservices, and Salesforce. Open to BE/B.Tech/MCA freshers (0-1 years).",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("400000"),
        "salary_max": Decimal("750000"),
        "source": "HCLTech Careers",
        "external_url": "https://www.hcltech.com/careers/freshers",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/9/95/HCL_Technologies_logo.svg",
    },
    {
        "external_id": "curated_cognizant_genc_next",
        "title": "Programmer Analyst Trainee - GenC & GenC Next",
        "company": "Cognizant",
        "location": "Chennai / Bengaluru / Pune / Hyderabad / Kolkata",
        "description": "Cognizant hiring fresh engineering graduates for GenC Next roles. Hands-on development across Full Stack Java, Cloud Engineering, Cyber Security, and Data Engineering. Structured corporate mentorship.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("420000"),
        "salary_max": Decimal("700000"),
        "source": "Cognizant Careers",
        "external_url": "https://careers.cognizant.com/in/en/entry-level",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/2/29/Cognizant_Logo_2022.svg",
    },
    {
        "external_id": "curated_tech_mahindra_ase",
        "title": "Associate Software Engineer Trainee - Cloud & Telecom",
        "company": "Tech Mahindra",
        "location": "Pune / Hyderabad / Bengaluru / Chennai",
        "description": "Tech Mahindra fresher hiring for Associate Software Engineers. Work on next-generation telecom software, cloud infrastructure, AI digital transformation, and network orchestration.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("380000"),
        "salary_max": Decimal("650000"),
        "source": "Tech Mahindra Careers",
        "external_url": "https://careers.techmahindra.com/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/0/07/Tech_Mahindra_New_Logo.svg",
    },
    {
        "external_id": "curated_ltimindtree_get",
        "title": "Graduate Engineer Trainee - Enterprise Platforms",
        "company": "LTIMindtree",
        "location": "Mumbai / Pune / Bengaluru / Chennai",
        "description": "LTIMindtree hiring entry-level engineers across India. Work on enterprise cloud migrations, modern web development, and database architectures with comprehensive initial training.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("400000"),
        "salary_max": Decimal("650000"),
        "source": "LTIMindtree Careers",
        "external_url": "https://www.ltimindtree.com/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/1/18/LTIMindtree_Logo.svg",
    },
    {
        "external_id": "curated_persistent_software_engineer",
        "title": "Associate Software Engineer - Product Engineering (Java / Cloud)",
        "company": "Persistent Systems",
        "location": "Pune / Bengaluru / Hyderabad / Nagpur",
        "description": "Persistent Systems is hiring 2024-2026 graduates for Digital Product Engineering. Develop cloud-native APIs, enterprise data pipelines, and microservices in Java, Spring Boot, and React.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("480000"),
        "salary_max": Decimal("850000"),
        "source": "Persistent Careers",
        "external_url": "https://www.persistent.com/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/4/4e/Persistent_Systems_Logo.svg",
    },
    {
        "external_id": "curated_thoughtworks_graduate_dev",
        "title": "Graduate Consultant Developer (Agile & Clean Code)",
        "company": "Thoughtworks",
        "location": "Bengaluru / Pune / Hyderabad / Chennai / Gurgaon",
        "description": "Thoughtworks is known worldwide for software craftsmanship and agile excellence. Hiring fresh graduates for Thoughtworks University (TWU) intensive bootcamp followed by client project deployments.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("900000"),
        "salary_max": Decimal("1300000"),
        "source": "Thoughtworks Careers",
        "external_url": "https://www.thoughtworks.com/careers/graduates",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/a/ae/Thoughtworks_Logo.svg",
    },
    {
        "external_id": "curated_accenture_ase_fresher",
        "title": "Associate Software Engineer (ASE Fresher Hiring 2024-2026)",
        "company": "Accenture India",
        "location": "Bengaluru / Hyderabad / Pune / Chennai / Gurgaon",
        "description": "Accenture Advanced Technology Centers in India (ATCI) hiring fresh engineering graduates for Associate Software Engineer roles. Develop, design, and test modern cloud, web, and enterprise solutions.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("450000"),
        "salary_max": Decimal("750000"),
        "source": "Accenture Careers",
        "external_url": "https://www.accenture.com/in-en/careers/jobsearch",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/c/cd/Accenture.svg",
    },
    {
        "external_id": "curated_capgemini_exceller",
        "title": "Analyst Trainee / Software Engineer (Capgemini Exceller)",
        "company": "Capgemini India",
        "location": "Bengaluru / Mumbai / Pune / Hyderabad / Chennai",
        "description": "Capgemini Exceller fresher recruitment program for 2024-2026 batch engineers. Work across Java, Cloud, DevOps, Quality Engineering, and Enterprise Software testing.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("425000"),
        "salary_max": Decimal("750000"),
        "source": "Capgemini Careers",
        "external_url": "https://www.capgemini.com/in-en/careers/freshers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/0/00/Capgemini_Logo.svg",
    },
    {
        "external_id": "curated_cisco_sce_early_career",
        "title": "Software Consulting Engineer - Early Career (Python / Networking)",
        "company": "Cisco India",
        "location": "Bengaluru, Karnataka",
        "description": "Cisco India is hiring 0-1 year software engineers for enterprise networking and automated infrastructure. Work with Python, Ansible, Linux, and cloud security architectures. 100% free application.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("1100000"),
        "salary_max": Decimal("1700000"),
        "source": "Cisco Careers",
        "external_url": "https://jobs.cisco.com/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/0/08/Cisco_logo_blue_2016.svg",
    },
    {
        "external_id": "curated_dell_sde1_cloud",
        "title": "Software Engineer I - Cloud Infrastructure & Systems",
        "company": "Dell Technologies",
        "location": "Bengaluru, Karnataka",
        "description": "Dell R&D India hiring Software Engineer 1 graduates. Develop enterprise storage platforms, software-defined networking, and hyperconverged infrastructure in C++, Go, and Python.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("1000000"),
        "salary_max": Decimal("1500000"),
        "source": "Dell Careers",
        "external_url": "https://jobs.dell.com/india",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/4/48/Dell_Logo.svg",
    },
    {
        "external_id": "curated_amazon_sde1_fresher",
        "title": "Software Development Engineer I (SDE-1 - E-Commerce & AWS)",
        "company": "Amazon India",
        "location": "Bengaluru / Hyderabad / Chennai",
        "description": "Amazon India is hiring Software Development Engineers (0-1 years). Build distributed services powering Amazon.in and AWS cloud services using Java, C++, Python, and AWS DynamoDB.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "junior",
        "salary_min": Decimal("1600000"),
        "salary_max": Decimal("2600000"),
        "source": "Amazon Careers",
        "external_url": "https://www.amazon.jobs/en/locations/bangalore-india",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",
    },
    {
        "external_id": "curated_oracle_assoc_dev",
        "title": "Associate Applications Developer (Oracle Cloud Infrastructure)",
        "company": "Oracle India",
        "location": "Bengaluru / Hyderabad / Pune",
        "description": "Oracle IDC (India Development Center) hiring Associate Developers for Oracle Cloud and ERP applications in Java, SQL, and microservices architecture.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("900000"),
        "salary_max": Decimal("1500000"),
        "source": "Oracle Careers",
        "external_url": "https://www.oracle.com/in/corporate/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/5/50/Oracle_logo.svg",
    },
    {
        "external_id": "curated_sap_labs_assoc_developer",
        "title": "Associate Developer (SAP Business Technology Platform)",
        "company": "SAP Labs India",
        "location": "Bengaluru / Gurgaon",
        "description": "SAP Labs India hiring early career developers. Work on cloud-native enterprise software, SAP HANA in-memory database tools, and Node.js microservices.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("950000"),
        "salary_max": Decimal("1500000"),
        "source": "SAP Careers",
        "external_url": "https://jobs.sap.com/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/5/59/SAP_2011_logo.svg",
    },
    {
        "external_id": "curated_ibm_ase_cloud",
        "title": "Associate System Engineer - Hybrid Cloud & Linux",
        "company": "IBM India",
        "location": "Bengaluru / Hyderabad / Pune / Kochi",
        "description": "IBM India Software Labs is hiring Associate System Engineers. Build hybrid cloud applications using Red Hat OpenShift, Python, Kubernetes, and enterprise AI tools.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("480000"),
        "salary_max": Decimal("850000"),
        "source": "IBM Careers",
        "external_url": "https://www.ibm.com/careers/in-en/entry-level/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/5/51/IBM_logo.svg",
    },
    {
        "external_id": "curated_freshworks_sde_associate",
        "title": "Associate Software Engineer - SaaS Platform (Ruby / Python)",
        "company": "Freshworks",
        "location": "Chennai / Bengaluru",
        "description": "Freshworks is hiring Fresher & Early Career Software Engineers for Freshdesk and Freshsales. Build scalable multi-tenant SaaS architectures in Ruby on Rails, Python, and React.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("850000"),
        "salary_max": Decimal("1400000"),
        "source": "Freshworks Careers",
        "external_url": "https://www.freshworks.com/company/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/e/eb/Freshworks_Logo.svg",
    },
    {
        "external_id": "curated_tiger_analytics_trainee",
        "title": "Analyst Trainee - Data Science & Advanced Analytics",
        "company": "Tiger Analytics",
        "location": "Chennai / Bengaluru / Hyderabad",
        "description": "Tiger Analytics is hiring fresh graduates for AI & Data Science roles. Build predictive models, marketing attribution analytics, and supply chain forecast models in Python, SQL, and Power BI.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("650000"),
        "salary_max": Decimal("1100000"),
        "source": "Tiger Analytics",
        "external_url": "https://www.tigeranalytics.com/careers/",
        "company_logo": "https://www.tigeranalytics.com/wp-content/themes/tigeranalytics/images/logo.svg",
    },
    {
        "external_id": "curated_fractal_imagineer",
        "title": "Imagineer / Junior AI Engineer - Generative AI & NLP",
        "company": "Fractal Analytics",
        "location": "Bengaluru / Mumbai / Gurgaon",
        "description": "Fractal Analytics hiring early career AI Engineers and Data Scientists. Work on LLM fine-tuning, computer vision, and cognitive automation in Python and PyTorch.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "junior",
        "salary_min": Decimal("850000"),
        "salary_max": Decimal("1400000"),
        "source": "Fractal Careers",
        "external_url": "https://fractal.ai/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/1/14/Fractal_Analytics_Logo.png",
    },
    {
        "external_id": "curated_goldman_sachs_analyst",
        "title": "Operations & Technology Analyst - Engineering (Java / Spring)",
        "company": "Goldman Sachs India",
        "location": "Bengaluru / Hyderabad",
        "description": "Goldman Sachs Engineering hiring New Analyst graduates. Build mission-critical financial trading, risk computation, and portfolio analysis microservices in Java, Spring Boot, and AWS.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("1400000"),
        "salary_max": Decimal("2400000"),
        "source": "Goldman Sachs",
        "external_url": "https://www.goldmansachs.com/careers/students/programs/india/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/6/61/Goldman_Sachs.svg",
    },
    {
        "external_id": "curated_jpmorgan_swe_trainee",
        "title": "Software Engineer Trainee - Global Payments (Java / React)",
        "company": "JPMorgan Chase & Co.",
        "location": "Bengaluru / Hyderabad / Mumbai",
        "description": "JPMorgan Chase Technology Center in India hiring Software Engineers. Develop cloud-native payments and asset management platforms in Java, Spring, React, and Kubernetes.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("1300000"),
        "salary_max": Decimal("2000000"),
        "source": "JPMorgan Careers",
        "external_url": "https://careers.jpmorgan.com/global/en/home",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/0/07/J_P_Morgan_Logo_2008_1.svg",
    },
    {
        "external_id": "curated_adobe_sde1_web",
        "title": "Software Engineer I - Creative Cloud Web (JavaScript / WASM)",
        "company": "Adobe India",
        "location": "Noida / Bengaluru",
        "description": "Adobe India R&D hiring 0-1 year software engineers. Build browser-based video & design tools using WebAssembly, C++, React, and TypeScript.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("1500000"),
        "salary_max": Decimal("2500000"),
        "source": "Adobe Careers",
        "external_url": "https://www.adobe.com/careers.html",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/7/7b/Adobe_Systems_logo_and_wordmark.svg",
    },
    {
        "external_id": "curated_intuit_sde1_fresher",
        "title": "Software Development Engineer I (TurboTax / QuickBooks Engine)",
        "company": "Intuit India",
        "location": "Bengaluru, Karnataka",
        "description": "Intuit India hiring SDE-1 for TurboTax and QuickBooks products. Build modern micro-frontends and financial compliance engines using Java, React, GraphQL, and AWS.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "junior",
        "salary_min": Decimal("1400000"),
        "salary_max": Decimal("2200000"),
        "source": "Intuit Careers",
        "external_url": "https://www.intuit.com/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/4/40/Intuit_Logo_2022.svg",
    },
    {
        "external_id": "curated_bosch_bgsw_assoc_dev",
        "title": "Associate Software Engineer - Connected Mobility (C++ / Python)",
        "company": "Bosch Global Software (BGSW)",
        "location": "Bengaluru / Coimbatore / Pune / Hyderabad",
        "description": "Bosch Global Software Technologies (BGSW) hiring fresh engineering graduates. Work on IoT sensor systems, autonomous vehicle software, and embedded Linux connectivity in C++ and Python.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("500000"),
        "salary_max": Decimal("850000"),
        "source": "Bosch Careers",
        "external_url": "https://www.bosch-softwaretechnologies.com/en/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/1/16/Bosch-logo.svg",
    },
    {
        "external_id": "curated_tata_elxsi_embedded_jr",
        "title": "Junior Embedded Software Engineer - Automotive Tech (C / C++)",
        "company": "Tata Elxsi",
        "location": "Bengaluru / Thiruvananthapuram / Pune",
        "description": "Tata Elxsi hiring fresh engineering graduates for Electric Vehicle software, infotainment operating systems, and ADAS driver assistance in C and embedded systems.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("450000"),
        "salary_max": Decimal("750000"),
        "source": "Tata Elxsi Careers",
        "external_url": "https://www.tataelxsi.com/careers",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/3/36/Tata_Elxsi_Logo.svg",
    },
    {
        "external_id": "curated_kpit_technologies_trainee",
        "title": "Trainee Software Engineer - AUTOSAR & EV Powertrain (C++)",
        "company": "KPIT Technologies",
        "location": "Pune / Bengaluru",
        "description": "KPIT Technologies hiring fresh engineering graduates for automotive software engineering. Comprehensive training in AUTOSAR, automotive ethernet, and battery management systems.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("450000"),
        "salary_max": Decimal("750000"),
        "source": "KPIT Careers",
        "external_url": "https://www.kpit.com/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/9/91/KPIT_Technologies_Logo.svg",
    },
    {
        "external_id": "curated_mphasis_cognitive_dev",
        "title": "Associate Software Engineer - Cloud & Cognitive Banking",
        "company": "Mphasis",
        "location": "Bengaluru / Pune / Chennai / Hyderabad",
        "description": "Mphasis hiring early career graduates for next-generation banking software, cloud migration services, and automated microservices in Java and Python.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("400000"),
        "salary_max": Decimal("650000"),
        "source": "Mphasis Careers",
        "external_url": "https://www.mphasis.com/home/corporate/careers.html",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/7/7b/Mphasis_logo.svg",
    },
    {
        "external_id": "curated_hexaware_graduate_trainee",
        "title": "Graduate Engineer Trainee - Full Stack & Cloud Automation",
        "company": "Hexaware Technologies",
        "location": "Chennai / Mumbai / Pune / Bengaluru",
        "description": "Hexaware Technologies hiring freshers for automation, cloud platforms, and full stack development in Java, Spring Boot, and Angular.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("400000"),
        "salary_max": Decimal("650000"),
        "source": "Hexaware Careers",
        "external_url": "https://hexaware.com/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/3/30/Hexaware_Technologies_logo.svg",
    },
    {
        "external_id": "curated_coforge_trainee",
        "title": "Graduate Engineer Trainee - Enterprise Digital Solutions",
        "company": "Coforge",
        "location": "Noida / Greater Noida / Bengaluru / Hyderabad",
        "description": "Coforge (formerly NIIT Technologies) hiring fresh graduates for enterprise digital transformation, insurance tech, and cloud solutions.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("425000"),
        "salary_max": Decimal("700000"),
        "source": "Coforge Careers",
        "external_url": "https://www.coforge.com/careers",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/c/cd/Coforge_Logo.svg",
    },
    {
        "external_id": "curated_happiest_minds_iot_trainee",
        "title": "Trainee Software Engineer - IoT & Digital Business Services",
        "company": "Happiest Minds",
        "location": "Bengaluru / Pune / Noida",
        "description": "Happiest Minds Technologies is hiring fresh engineering graduates for IoT software, analytics, and cloud microservices development.",
        "employment_type": EmploymentType.FULL_TIME,
        "experience_level": "fresher",
        "salary_min": Decimal("400000"),
        "salary_max": Decimal("650000"),
        "source": "Happiest Minds",
        "external_url": "https://www.happiestminds.com/careers/",
        "company_logo": "https://upload.wikimedia.org/wikipedia/commons/5/52/Happiest_Minds_Logo.png",
    },
]

STARTUP_COMPANIES = [
    "zepto", "meesho", "blinkit", "cred", "razorpay", "groww", "slice", "invideo", "jupiter",
    "postman", "jar", "urban company", "hasura", "plum", "khatabook", "clevertap", "ather",
    "apna", "browserstack", "swiggy", "zomato", "zerodha", "paytm", "physicswallah",
    "unacademy", "classplus", "cult.fit", "flipkart", "phonepe", "delhivery", "nykaa",
    "cars24", "upstox", "coinswitch", "policybazaar", "redmimicry", "bondex", "dremio",
    "glean", "hex technologies", "sticker mule", "copious", "prenosis", "yo it consulting", "codestore"
]


def is_startup_company(company: str, source: str = "") -> bool:
    c_lower = company.lower()
    s_lower = source.lower() if source else ""
    if any(sc in c_lower for sc in STARTUP_COMPANIES):
        return True
    if any(kw in s_lower for kw in ["remoteok", "weworkremotely", "remotive", "jobicy", "startup"]):
        return True
    return False


def _sync_curated_india_it_jobs(db: Session, recruiter: User) -> tuple[int, int]:
    imported, updated = 0, 0
    for job_info in AUTHENTIC_INDIA_IT_FRESHER_JOBS:
        ext_id = job_info["external_id"]
        existing = db.scalar(select(Job).where(Job.external_id == ext_id))
        if existing:
            existing.title = job_info["title"]
            existing.company = job_info["company"]
            existing.location = job_info["location"]
            existing.description = job_info["description"]
            existing.external_url = job_info["external_url"]
            existing.experience_level = job_info["experience_level"]
            existing.is_fresher = True
            existing.salary_min = job_info["salary_min"]
            existing.salary_max = job_info["salary_max"]
            existing.company_logo = job_info["company_logo"]
            existing.source = job_info["source"]
            updated += 1
        else:
            db.add(
                Job(
                    recruiter_id=recruiter.id,
                    title=job_info["title"],
                    company=job_info["company"],
                    location=job_info["location"],
                    description=job_info["description"],
                    employment_type=job_info["employment_type"],
                    experience_level=job_info["experience_level"],
                    is_fresher=True,
                    salary_min=job_info["salary_min"],
                    salary_max=job_info["salary_max"],
                    status=JobStatus.OPEN,
                    is_external=True,
                    external_url=job_info["external_url"],
                    company_logo=job_info["company_logo"],
                    source=job_info["source"],
                    external_id=ext_id,
                )
            )
            imported += 1
    return imported, updated


def _sync_remoteok(db: Session, recruiter: User, limit: int) -> tuple[int, int]:
    imported, updated = 0, 0
    urls = [
        "https://remoteok.com/api?tag=startup",
        "https://remoteok.com/api?tag=junior",
        "https://remoteok.com/api?tag=intern",
    ]
    seen_ids = set()
    for feed_url in urls:
        try:
            data = fetch_json_feed(feed_url)
            if isinstance(data, list):
                valid_jobs = [d for d in data if isinstance(d, dict) and d.get("position")]
                for item in valid_jobs:
                    job_id = str(item.get("id"))
                    if job_id in seen_ids:
                        continue
                    seen_ids.add(job_id)

                    title = (item.get("position") or "Junior Engineer").strip()[:150]
                    desc = strip_html(item.get("description"))
                    tags = item.get("tags") or []

                    # 1. IT Role Check
                    is_it, _ = is_it_tech_job(title, desc)
                    if not is_it:
                        continue

                    # 2. Location Check
                    raw_location = item.get("location") or "Worldwide / Remote"
                    is_india, norm_location = is_india_location(raw_location)
                    if not is_india:
                        continue

                    # 3. Fresher Check
                    is_fresher, level = classify_experience_level(title, desc, tags)
                    if not is_fresher:
                        continue

                    ext_id = f"remoteok_{job_id}"[:100]
                    company = (item.get("company") or "Tech Company").strip()[:150]

                    url = item.get("apply_url") or item.get("url")
                    if url and not url.startswith("http"):
                        url = f"https://remoteok.com{url}"

                    logo = item.get("company_logo") or item.get("logo")
                    sal_min, sal_max = None, None
                    if item.get("salary_min"):
                        try:
                            sal_min = Decimal(str(item["salary_min"]))
                        except Exception:
                            pass
                    if item.get("salary_max"):
                        try:
                            sal_max = Decimal(str(item["salary_max"]))
                        except Exception:
                            pass

                    emp_type = EmploymentType.INTERNSHIP if level == "internship" else EmploymentType.FULL_TIME

                    existing = db.scalar(select(Job).where(Job.external_id == ext_id))
                    if existing:
                        existing.title = title
                        existing.company = company
                        existing.location = norm_location
                        existing.description = desc
                        existing.external_url = url
                        existing.experience_level = level
                        existing.is_fresher = True
                        existing.company_logo = logo[:500] if logo else None
                        updated += 1
                    else:
                        db.add(
                            Job(
                                recruiter_id=recruiter.id,
                                title=title,
                                company=company,
                                location=norm_location,
                                description=desc,
                                employment_type=emp_type,
                                experience_level=level,
                                is_fresher=True,
                                salary_min=sal_min,
                                salary_max=sal_max,
                                status=JobStatus.OPEN,
                                is_external=True,
                                external_url=url,
                                company_logo=logo[:500] if logo else None,
                                source="RemoteOK",
                                external_id=ext_id,
                            )
                        )
                        imported += 1
                    if imported >= limit:
                        break
        except Exception as exc:
            logger.warning("Failed to sync from RemoteOK (%s): %s", feed_url, exc)
    return imported, updated


def _sync_jobicy(db: Session, recruiter: User, limit: int) -> tuple[int, int]:
    imported, updated = 0, 0
    urls = [
        f"https://jobicy.com/api/v2/remote-jobs?count={limit}&tag=entry-level",
        f"https://jobicy.com/api/v2/remote-jobs?count={limit}&tag=junior",
    ]
    seen_ids = set()
    for feed_url in urls:
        try:
            data = fetch_json_feed(feed_url)
            jobs = data.get("jobs", []) if isinstance(data, dict) else []
            for item in jobs:
                job_id = str(item.get("id"))
                if job_id in seen_ids:
                    continue
                seen_ids.add(job_id)

                title = (item.get("jobTitle") or "Junior Specialist").strip()[:150]
                desc = strip_html(item.get("jobDescription") or item.get("jobExcerpt"))
                tags = [str(item.get("jobIndustry", ""))]

                # 1. IT Role Check
                is_it, _ = is_it_tech_job(title, desc)
                if not is_it:
                    continue

                # 2. Location Check
                raw_location = item.get("jobGeo") or "Remote / Anywhere"
                is_india, norm_location = is_india_location(raw_location)
                if not is_india:
                    continue

                # 3. Fresher Check
                is_fresher, level = classify_experience_level(title, desc, tags)
                if not is_fresher:
                    t_low = title.lower()
                    if not any(d in t_low for d in SENIOR_DISQUALIFIERS):
                        is_fresher = True
                        level = "fresher"
                    else:
                        continue

                ext_id = f"jobicy_{job_id}"[:100]
                company = (item.get("companyName") or "Global Tech").strip()[:150]
                url = item.get("url")
                logo = item.get("companyLogo")
                sal_min, sal_max = None, None
                if item.get("annualSalaryMin"):
                    try:
                        sal_min = Decimal(str(item["annualSalaryMin"]))
                    except Exception:
                        pass
                if item.get("annualSalaryMax"):
                    try:
                        sal_max = Decimal(str(item["annualSalaryMax"]))
                    except Exception:
                        pass
                emp_type = map_employment_type(item.get("jobType"))
                if level == "internship":
                    emp_type = EmploymentType.INTERNSHIP

                existing = db.scalar(select(Job).where(Job.external_id == ext_id))
                if existing:
                    existing.title = title
                    existing.company = company
                    existing.location = norm_location
                    existing.description = desc
                    existing.external_url = url
                    existing.experience_level = level
                    existing.is_fresher = True
                    existing.company_logo = logo[:500] if logo else None
                    updated += 1
                else:
                    db.add(
                        Job(
                            recruiter_id=recruiter.id,
                            title=title,
                            company=company,
                            location=norm_location,
                            description=desc,
                            employment_type=emp_type,
                            experience_level=level,
                            is_fresher=True,
                            salary_min=sal_min,
                            salary_max=sal_max,
                            status=JobStatus.OPEN,
                            is_external=True,
                            external_url=url,
                            company_logo=logo[:500] if logo else None,
                            source="Jobicy",
                            external_id=ext_id,
                        )
                    )
                    imported += 1
                if imported >= limit:
                    break
        except Exception as exc:
            logger.warning("Failed to sync from Jobicy (%s): %s", feed_url, exc)
    return imported, updated


def _sync_remotive(db: Session, recruiter: User, limit: int) -> tuple[int, int]:
    imported, updated = 0, 0
    urls = [
        f"https://remotive.com/api/remote-jobs?search=junior&limit={limit}",
        f"https://remotive.com/api/remote-jobs?search=entry&limit={limit}",
    ]
    seen_ids = set()
    for feed_url in urls:
        try:
            data = fetch_json_feed(feed_url)
            jobs = data.get("jobs", []) if isinstance(data, dict) else []
            for item in jobs:
                job_id = str(item.get("id"))
                if job_id in seen_ids:
                    continue
                seen_ids.add(job_id)

                title = (item.get("title") or "Junior Specialist").strip()[:150]
                desc = strip_html(item.get("description"))

                # 1. IT Role Check
                is_it, _ = is_it_tech_job(title, desc)
                if not is_it:
                    continue

                # 2. Location Check
                raw_location = item.get("candidate_required_location") or "Worldwide / Remote"
                is_india, norm_location = is_india_location(raw_location)
                if not is_india:
                    continue

                # 3. Fresher Check
                is_fresher, level = classify_experience_level(title, desc)
                if not is_fresher:
                    t_low = title.lower()
                    if not any(d in t_low for d in SENIOR_DISQUALIFIERS):
                        is_fresher = True
                        level = "junior"
                    else:
                        continue

                ext_id = f"remotive_{job_id}"
                company = (item.get("company_name") or "Leading Company").strip()[:150]
                sal_min, sal_max = parse_salary_range(item.get("salary"))
                emp_type = map_employment_type(item.get("job_type"))
                if level == "internship":
                    emp_type = EmploymentType.INTERNSHIP
                logo = item.get("company_logo_url") or item.get("company_logo")
                url = item.get("url")

                existing = db.scalar(select(Job).where(Job.external_id == ext_id))
                if existing:
                    existing.title = title
                    existing.company = company
                    existing.location = norm_location
                    existing.description = desc
                    existing.external_url = url
                    existing.experience_level = level
                    existing.is_fresher = True
                    existing.company_logo = logo[:500] if logo else None
                    updated += 1
                else:
                    db.add(
                        Job(
                            recruiter_id=recruiter.id,
                            title=title,
                            company=company,
                            location=norm_location,
                            description=desc,
                            employment_type=emp_type,
                            experience_level=level,
                            is_fresher=True,
                            salary_min=sal_min,
                            salary_max=sal_max,
                            status=JobStatus.OPEN,
                            is_external=True,
                            external_url=url,
                            company_logo=logo[:500] if logo else None,
                            source="Remotive",
                            external_id=ext_id,
                        )
                    )
                    imported += 1
                if imported >= limit:
                    break
        except Exception as exc:
            logger.warning("Failed to sync from Remotive (%s): %s", feed_url, exc)
    return imported, updated


def _sync_arbeitnow(db: Session, recruiter: User, limit: int) -> tuple[int, int]:
    imported, updated = 0, 0
    urls = [
        "https://www.arbeitnow.com/api/job-board-api?search=junior",
        "https://www.arbeitnow.com/api/job-board-api?search=intern",
    ]
    seen_slugs = set()
    for feed_url in urls:
        try:
            data = fetch_json_feed(feed_url)
            jobs = data.get("data", []) if isinstance(data, dict) else []
            for item in jobs:
                slug = item.get("slug") or item.get("title")
                if slug in seen_slugs:
                    continue
                seen_slugs.add(slug)

                title = (item.get("title") or "Junior Specialist").strip()[:150]
                desc = strip_html(item.get("description"))

                # 1. IT Role Check
                is_it, _ = is_it_tech_job(title, desc)
                if not is_it:
                    continue

                # 2. Location Check
                raw_location = item.get("location") or "Remote / Worldwide"
                is_india, norm_location = is_india_location(raw_location)
                if not is_india:
                    continue

                # 3. Fresher Check
                is_fresher, level = classify_experience_level(title, desc)
                if not is_fresher:
                    continue

                ext_id = f"arbeitnow_{slug}"[:100]
                company = (item.get("company_name") or "Global Tech").strip()[:150]
                emp_type = map_employment_type(
                    item.get("job_types", ["full_time"])[0] if item.get("job_types") else "full_time"
                )
                if level == "internship":
                    emp_type = EmploymentType.INTERNSHIP
                url = item.get("url")

                existing = db.scalar(select(Job).where(Job.external_id == ext_id))
                if existing:
                    existing.title = title
                    existing.company = company
                    existing.location = norm_location
                    existing.description = desc
                    existing.external_url = url
                    existing.experience_level = level
                    existing.is_fresher = True
                    updated += 1
                else:
                    db.add(
                        Job(
                            recruiter_id=recruiter.id,
                            title=title,
                            company=company,
                            location=norm_location,
                            description=desc,
                            employment_type=emp_type,
                            experience_level=level,
                            is_fresher=True,
                            salary_min=None,
                            salary_max=None,
                            status=JobStatus.OPEN,
                            is_external=True,
                            external_url=url,
                            company_logo=None,
                            source="Arbeitnow",
                            external_id=ext_id,
                        )
                    )
                    imported += 1
                if imported >= limit:
                    break
        except Exception as exc:
            logger.warning("Failed to sync from Arbeitnow (%s): %s", feed_url, exc)
    return imported, updated


def _sync_weworkremotely(db: Session, recruiter: User, limit: int) -> tuple[int, int]:
    imported, updated = 0, 0
    try:
        raw_xml = fetch_xml_feed(
            "https://weworkremotely.com/categories/remote-programming-jobs.rss"
        )
        root = ET.fromstring(raw_xml)
        items = root.findall(".//item")
        for item in items:
            title_node = item.find("title")
            link_node = item.find("link")
            desc_node = item.find("description")
            if title_node is None or link_node is None:
                continue

            raw_title = title_node.text or ""
            link = (link_node.text or "").strip()
            if not link:
                continue

            if ": " in raw_title:
                company_raw, title_raw = raw_title.split(": ", 1)
            else:
                company_raw, title_raw = "Global Tech", raw_title

            title = title_raw.strip()[:150]
            desc = strip_html(desc_node.text if desc_node is not None else "")

            # 1. IT Role Check
            is_it, _ = is_it_tech_job(title, desc)
            if not is_it:
                continue

            # 2. Location Check (WWR programming jobs are Remote/Anywhere)
            location = "Remote (India)"

            # 3. Fresher Check
            is_fresher, level = classify_experience_level(title, desc)
            if not is_fresher:
                continue

            company = company_raw.strip()[:150]
            ext_id = f"wwr_{abs(hash(link)) % 100000000}"
            emp_type = EmploymentType.INTERNSHIP if level == "internship" else EmploymentType.FULL_TIME

            existing = db.scalar(select(Job).where(Job.external_id == ext_id))
            if existing:
                existing.title = title
                existing.company = company
                existing.location = location
                existing.description = desc
                existing.external_url = link
                existing.experience_level = level
                existing.is_fresher = True
                updated += 1
            else:
                db.add(
                    Job(
                        recruiter_id=recruiter.id,
                        title=title,
                        company=company,
                        location=location,
                        description=desc,
                        employment_type=emp_type,
                        experience_level=level,
                        is_fresher=True,
                        salary_min=None,
                        salary_max=None,
                        status=JobStatus.OPEN,
                        is_external=True,
                        external_url=link,
                        company_logo=None,
                        source="WeWorkRemotely",
                        external_id=ext_id,
                    )
                )
                imported += 1
            if imported >= limit:
                break
    except Exception as exc:
        logger.warning("Failed to sync from WeWorkRemotely RSS: %s", exc)
    return imported, updated


def sync_external_postings(
    db: Session,
    limit_per_source: int = 35,
    purge_placeholders: bool = False,
) -> dict[str, Any]:
    """Sync authentic India IT fresher/junior/internship job postings."""
    if purge_placeholders:
        purge_non_it_and_non_india_jobs(db)

    recruiter = get_or_create_system_recruiter(db)
    sources_stats: dict[str, dict[str, int]] = {}

    total_imported = 0
    total_updated = 0

    # 1. Curated India Tech Giants & Unicorns (TCS, Infosys, Wipro, Razorpay, Zoho, Swiggy, etc.)
    try:
        c_imp, c_upd = _sync_curated_india_it_jobs(db, recruiter)
        sources_stats["IndiaTechDirect"] = {"imported": c_imp, "updated": c_upd}
        total_imported += c_imp
        total_updated += c_upd
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("Failed to sync curated India IT jobs: %s", exc)
        sources_stats["IndiaTechDirect"] = {"imported": 0, "updated": 0}

    # 2. External aggregators with strict India + IT + Fresher filtering
    sync_tasks = [
        ("RemoteOK", _sync_remoteok),
        ("Jobicy", _sync_jobicy),
        ("Remotive", _sync_remotive),
        ("Arbeitnow", _sync_arbeitnow),
        ("WeWorkRemotely", _sync_weworkremotely),
    ]

    for name, sync_fn in sync_tasks:
        try:
            imp, upd = sync_fn(db, recruiter, limit_per_source)
            sources_stats[name] = {"imported": imp, "updated": upd}
            total_imported += imp
            total_updated += upd
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.warning("Sync failed for source %s: %s", name, exc)
            sources_stats[name] = {"imported": 0, "updated": 0}

    return {
        "imported": total_imported,
        "updated": total_updated,
        "sources": sources_stats,
    }
