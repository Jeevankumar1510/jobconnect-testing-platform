import json
from typing import Any

from ai.services.ats_analyzer import extract_skills_from_text

ROLE_REQUIREMENTS = {
    "python backend developer": {
        "display_name": "Python Backend Developer",
        "core_skills": ["Python", "FastAPI", "Django", "PostgreSQL", "RESTful APIs", "Docker", "Git", "PyTest", "Redis", "Data Structures"],
        "soft_skills": ["Problem Solving", "System Architecture Thinking", "Code Quality"],
        "roadmap": [
            {
                "milestone": "Week 1",
                "title": "Advanced Python & Asynchronous Programming",
                "description": "Master type hinting, decorators, generators, context managers, and async/await event loops.",
                "topics": ["Type Hints (Pydantic)", "asyncio & Concurrent Programming", "Memory Management & Profiling", "PyTest Unit Testing"],
                "estimated_days": 7,
                "resources": [
                    {"title": "FastAPI Official Tutorial", "url": "https://fastapi.tiangolo.com/tutorial/"},
                    {"title": "RealPython Async IO in Python", "url": "https://realpython.com/async-io-python/"}
                ]
            },
            {
                "milestone": "Week 2",
                "title": "Relational Databases, ORMs & Indexing",
                "description": "Deep dive into PostgreSQL, query optimization, EXPLAIN ANALYZE, SQLAlchemy 2.0, and transactions.",
                "topics": ["PostgreSQL Indexing & Foreign Keys", "SQLAlchemy 2.0 Mapped Syntax", "Database Migrations (Alembic)", "Connection Pooling"],
                "estimated_days": 7,
                "resources": [
                    {"title": "SQLAlchemy 2.0 Unified Tutorial", "url": "https://docs.sqlalchemy.org/en/20/tutorial/"},
                    {"title": "Use The Index, Luke (SQL Guide)", "url": "https://use-the-index-luke.com/"}
                ]
            },
            {
                "milestone": "Week 3",
                "title": "API Architecture, Caching & Auth",
                "description": "Build production-grade REST APIs with JWT authentication, rate limiting, and Redis caching.",
                "topics": ["JWT & Argon2 Security", "Redis Key-Value Caching", "Background Workers & Async Tasks", "API Rate Limiting"],
                "estimated_days": 7,
                "resources": [
                    {"title": "Redis Python Crash Course", "url": "https://redis.io/docs/latest/develop/connect/clients/python/"},
                    {"title": "OWASP API Security Top 10", "url": "https://owasp.org/www-project-api-security/"}
                ]
            },
            {
                "milestone": "Week 4",
                "title": "Dockerization, CI/CD & Cloud Deployment",
                "description": "Containerize backend services with multi-stage Dockerfiles and set up GitHub Actions CI/CD pipelines.",
                "topics": ["Multi-stage Docker Builds", "Docker Compose Orchestration", "GitHub Actions Automation", "Deployment on Render / AWS"],
                "estimated_days": 7,
                "resources": [
                    {"title": "Docker for Python Developers", "url": "https://docs.docker.com/language/python/"},
                    {"title": "GitHub Actions for CI/CD", "url": "https://docs.github.com/en/actions"}
                ]
            }
        ],
        "projects": [
            {
                "title": "Distributed Task Queue & Background Job Engine",
                "tagline": "Asynchronous job scheduler with Redis & FastAPI",
                "tech_stack": ["FastAPI", "Redis", "SQLAlchemy", "PostgreSQL", "Docker"],
                "description": "A high-throughput API gateway that accepts long-running tasks, schedules them via Redis queues, tracks execution progress, and notifies clients via WebSockets.",
                "key_features": ["Worker thread pools", "Exponential backoff retries", "JWT-based client isolation", "Metrics dashboard"],
                "resume_bullet": "Engineered an asynchronous task worker API processing 2,000+ jobs/min with Redis and FastAPI, reducing client wait times by 85%."
            },
            {
                "title": "E-Commerce Microservice with Payment Idempotency",
                "tagline": "Transactional order processing system",
                "tech_stack": ["Python", "Django", "PostgreSQL", "Docker", "PyTest"],
                "description": "A payment and order management API guaranteeing zero double-charges through idempotency keys, ACID transactions, and comprehensive PyTest coverage (90%+).",
                "key_features": ["Idempotency key middleware", "Pessimistic row locking", "Event-driven architecture", "Swagger OpenAPI documentation"],
                "resume_bullet": "Implemented idempotent order API handling concurrent transactions with PostgreSQL row-level locks, eliminating duplicate charges during network drops."
            }
        ]
    },
    "frontend react developer": {
        "display_name": "Frontend React / Next.js Developer",
        "core_skills": ["React", "Next.js", "TypeScript", "JavaScript", "Tailwind CSS", "HTML5", "CSS3", "RESTful APIs", "Git"],
        "soft_skills": ["Attention to Visual Detail", "User Empathy", "Component Modularity"],
        "roadmap": [
            {
                "milestone": "Week 1",
                "title": "Modern TypeScript & Advanced React 19 Patterns",
                "description": "Master generic types, custom hooks, Server Components, and React 19 Actions.",
                "topics": ["TypeScript Generics & Discriminated Unions", "Custom Hooks & State Machines", "React 19 useActionState & useOptimistic", "Tailwind CSS Layout Mastery"],
                "estimated_days": 7,
                "resources": [
                    {"title": "React.dev Modern Docs", "url": "https://react.dev/"},
                    {"title": "Total TypeScript Essentials", "url": "https://www.totaltypescript.com/"}
                ]
            },
            {
                "milestone": "Week 2",
                "title": "Next.js App Router & Server Architecture",
                "description": "Harness Server Components, Route Handlers, Streaming SSR, and Parallel Routes.",
                "topics": ["Server vs Client Components", "Route Handlers & API Proxies", "Suspense & Streaming UI", "Next.js Image & Font Optimization"],
                "estimated_days": 7,
                "resources": [
                    {"title": "Next.js App Router Documentation", "url": "https://nextjs.org/docs"},
                    {"title": "Web.dev Core Web Vitals", "url": "https://web.dev/vitals/"}
                ]
            },
            {
                "milestone": "Week 3",
                "title": "Global State, Caching & Form Handling",
                "description": "Manage complex client state, TanStack Query or SWR caching, and accessible forms with Zod validation.",
                "topics": ["TanStack Query / SWR", "Zod Form Validation", "Accessibility (a11y) & ARIA", "Dark/Light Theming"],
                "estimated_days": 7,
                "resources": [
                    {"title": "TanStack Query Guides", "url": "https://tanstack.com/query/latest"},
                    {"title": "Zod TypeScript Schema Validation", "url": "https://zod.dev/"}
                ]
            },
            {
                "milestone": "Week 4",
                "title": "Testing, Performance Profiling & Vercel Deploy",
                "description": "Write automated UI tests using Jest & React Testing Library, optimize Core Web Vitals, and deploy.",
                "topics": ["React Testing Library & Jest", "Lighthouse Performance Auditing", "Bundle Size Analysis", "Continuous Deployment via GitHub"],
                "estimated_days": 7,
                "resources": [
                    {"title": "Testing Library for React", "url": "https://testing-library.com/docs/react-testing-library/intro/"},
                    {"title": "Vercel Deployment Best Practices", "url": "https://vercel.com/docs"}
                ]
            }
        ],
        "projects": [
            {
                "title": "Interactive Analytics Dashboard with Real-Time Data",
                "tagline": "Next.js 16 + TypeScript high-performance visual dashboard",
                "tech_stack": ["Next.js", "TypeScript", "Tailwind CSS", "Recharts", "WebSockets"],
                "description": "A responsive operational dashboard rendering interactive charts, customizable widgets, dark mode, and sub-100ms client filtering.",
                "key_features": ["Optimistic updates", "Accessible keyboard navigation", "Debounced multi-filter search", "Lighthouse score 98+"],
                "resume_bullet": "Developed responsive analytics web application in Next.js 16 & TypeScript, achieving 98+ Lighthouse performance score and sub-100ms filter responsiveness."
            }
        ]
    },
    "ai ml engineer": {
        "display_name": "AI / Machine Learning Engineer",
        "core_skills": ["Python", "PyTorch", "TensorFlow", "Pandas", "NumPy", "Scikit-Learn", "LLMs", "LangChain", "RESTful APIs", "Docker"],
        "soft_skills": ["Analytical Rigor", "Experimental Mindset", "Data Storytelling"],
        "roadmap": [
            {
                "milestone": "Week 1",
                "title": "Data Engineering & Exploratory Data Analysis",
                "description": "Clean, vectorize, and explore structured and unstructured datasets using Pandas and NumPy.",
                "topics": ["Vectorized Operations with NumPy", "Pandas Aggregations & Missing Data", "Data Visualization (Seaborn/Plotly)", "Feature Scaling & Encoding"],
                "estimated_days": 7,
                "resources": [
                    {"title": "Kaggle Data Cleaning Tutorials", "url": "https://www.kaggle.com/learn/data-cleaning"},
                    {"title": "NumPy Illustrated Guide", "url": "https://betterprogramming.pub/numpy-illustrated-the-visually-cheatsheet-98331e9e13b0"}
                ]
            },
            {
                "milestone": "Week 2",
                "title": "Classical Machine Learning & Evaluation Metrics",
                "description": "Train and validate regression, classification, and clustering models with Scikit-Learn.",
                "topics": ["Precision, Recall, ROC-AUC, F1", "Cross-Validation & Hyperparameter Tuning", "Random Forests & Gradient Boosting (XGBoost)", "Pipelines & Data Leakage Prevention"],
                "estimated_days": 7,
                "resources": [
                    {"title": "Scikit-Learn Official User Guide", "url": "https://scikit-learn.org/stable/user_guide.html"},
                    {"title": "StatQuest ML Foundations", "url": "https://statquest.org/"}
                ]
            },
            {
                "milestone": "Week 3",
                "title": "Deep Learning & Neural Networks",
                "description": "Construct neural networks, understand backpropagation, and build NLP/Vision pipelines with PyTorch.",
                "topics": ["PyTorch Tensors & Autograd", "Convolutional & Recurrent Networks", "Transfer Learning with HuggingFace Transformers", "Fine-Tuning Tokenizers"],
                "estimated_days": 7,
                "resources": [
                    {"title": "PyTorch Deep Learning with PyTorch: A 60 Minute Blitz", "url": "https://pytorch.org/tutorials/beginner/deep_learning_60min_blitz.html"},
                    {"title": "Hugging Face NLP Course", "url": "https://huggingface.co/learn/nlp-course"}
                ]
            },
            {
                "milestone": "Week 4",
                "title": "RAG Systems, Vector DBs & LLM Application Deployment",
                "description": "Implement Retrieval-Augmented Generation (RAG) using LangChain / LlamaIndex and deploy via FastAPI.",
                "topics": ["Embedding Generation & Cosine Similarity", "Vector Databases (Chroma / Pgvector)", "Prompt Engineering & Few-Shot RAG", "FastAPI Serving & Streaming Responses"],
                "estimated_days": 7,
                "resources": [
                    {"title": "LangChain Documentation", "url": "https://python.langchain.com/"},
                    {"title": "Pinecone RAG Architecture Guide", "url": "https://www.pinecone.io/learn/retrieval-augmented-generation/"}
                ]
            }
        ],
        "projects": [
            {
                "title": "Intelligent Resume-to-Job RAG Matching Assistant",
                "tagline": "Semantic embedding search & GenAI career copilot",
                "tech_stack": ["Python", "FastAPI", "PyTorch", "LangChain", "Pgvector", "Docker"],
                "description": "An end-to-end RAG system embedding resume snippets and job postings into vector space, calculating cosine match, and providing actionable interview guidance via LLM.",
                "key_features": ["Semantic vector similarity", "Context retrieval windowing", "Streaming LLM responses", "Docker containerization"],
                "resume_bullet": "Architected a RAG matching pipeline with FastAPI, LangChain, and vector embeddings, delivering sub-second semantic job recommendations with 92% retrieval relevance."
            }
        ]
    },
    "full stack developer": {
        "display_name": "Full Stack Software Engineer",
        "core_skills": ["Python", "JavaScript", "TypeScript", "React", "FastAPI", "PostgreSQL", "HTML5", "CSS3", "Git", "Docker", "RESTful APIs"],
        "soft_skills": ["Full-Lifecycle Ownership", "Effective Communication", "Problem Solving"],
        "roadmap": [
            {
                "milestone": "Week 1",
                "title": "End-to-End Architecture & Database Modeling",
                "description": "Architect clean relational schemas, PostgreSQL constraints, and FastAPI endpoints.",
                "topics": ["Normalized PostgreSQL Schemas", "FastAPI Dependency Injection", "Pydantic Schemas & Data Contracts", "Git Feature-Branch Workflows"],
                "estimated_days": 7,
                "resources": [
                    {"title": "Full Stack Open Course", "url": "https://fullstackopen.com/en/"}
                ]
            },
            {
                "milestone": "Week 2",
                "title": "Interactive Client Integration & State Management",
                "description": "Connect Next.js / React client with authenticated backend endpoints.",
                "topics": ["JWT Token Storage & Refresh", "TypeScript Interface Synchronization", "Optimistic UI Updates", "Responsive Tailwind CSS"],
                "estimated_days": 7,
                "resources": [
                    {"title": "Next.js App Router with FastAPI", "url": "https://nextjs.org/docs"}
                ]
            },
            {
                "milestone": "Week 3",
                "title": "Security, File Uploads & Performance",
                "description": "Handle secure multipart file uploads, rate limiting, and SQL query optimizations.",
                "topics": ["Multipart File Stream Validation", "CORS & SSRF Security", "Database Connection Pooling", "Error Handling & Logging"],
                "estimated_days": 7,
                "resources": [
                    {"title": "OWASP Secure Coding Practices", "url": "https://owasp.org/"}
                ]
            },
            {
                "milestone": "Week 4",
                "title": "Testing, Containerization & Production Launch",
                "description": "Integrate PyTest backend suites, multi-container Docker Compose, and automated cloud deployment.",
                "topics": ["PyTest End-to-End Integration", "Docker Compose Multi-Service Networking", "Nginx Reverse Proxy", "CI/CD Pipeline Automation"],
                "estimated_days": 7,
                "resources": [
                    {"title": "Docker Compose Multi-Container Guide", "url": "https://docs.docker.com/compose/"}
                ]
            }
        ],
        "projects": [
            {
                "title": "Full-Stack Collaborative Workspace & Workflow Platform",
                "tagline": "Next.js + FastAPI production application",
                "tech_stack": ["Next.js", "TypeScript", "FastAPI", "PostgreSQL", "Docker", "Tailwind CSS"],
                "description": "A complete SaaS portal supporting role-based access control, file attachments, real-time activity logs, and automated email/in-app notifications.",
                "key_features": ["JWT authentication", "Role-based authorization", "Multi-stage Docker builds", "Comprehensive test suite"],
                "resume_bullet": "Developed full-stack collaborative platform serving candidates and recruiters with FastAPI, PostgreSQL, and Next.js, featuring 95%+ test coverage."
            }
        ]
    }
}


def analyze_skill_gap(
    candidate_skills: list[str],
    target_role: str,
    job_description: str | None = None,
) -> dict[str, Any]:
    """
    Compares candidate skills against the target role requirements or job description,
    producing missing skills, learning roadmaps, and portfolio project suggestions.
    """
    clean_role = target_role.strip().lower()
    role_key = "python backend developer"
    for k in ROLE_REQUIREMENTS:
        if k in clean_role or any(part in clean_role for part in k.split()):
            role_key = k
            break

    profile_data = ROLE_REQUIREMENTS[role_key]
    required_skills = list(profile_data["core_skills"])

    if job_description:
        job_tech, _ = extract_skills_from_text(job_description)
        for s in job_tech:
            if s not in required_skills:
                required_skills.append(s)

    cand_set = {s.lower() for s in candidate_skills}
    missing: list[str] = []
    matched: list[str] = []

    for req in required_skills:
        if req.lower() in cand_set or any(req.lower() in c or c in req.lower() for c in cand_set):
            matched.append(req)
        else:
            missing.append(req)

    total_req = len(required_skills)
    progress_score = int((len(matched) / total_req) * 100) if total_req else 0

    return {
        "target_role": profile_data["display_name"],
        "current_skills": sorted(candidate_skills),
        "missing_skills": sorted(missing),
        "matched_skills": sorted(matched),
        "progress_percentage": progress_score,
        "roadmap_steps": profile_data["roadmap"],
        "recommended_projects": profile_data["projects"],
    }
