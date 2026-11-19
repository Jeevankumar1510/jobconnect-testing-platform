import json
from datetime import datetime, timezone
from typing import Any
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from accounts.models import User
from resume_studio.models import ResumeDocument, ResumeVersion
from resume_studio.schemas import (
    ResumeCreateRequest,
    ResumeUpdateRequest,
    ResumeResponse,
    ResumeListItemResponse,
    ResumeDataSchema,
)
from resume_studio.template_service import get_template_by_id


def serialize_resume(doc: ResumeDocument) -> ResumeResponse:
    try:
        p_info = json.loads(doc.personal_info_json) if doc.personal_info_json else {}
        t_skills = json.loads(doc.technical_skills_json) if doc.technical_skills_json else []
        edu = json.loads(doc.education_json) if doc.education_json else []
        proj = json.loads(doc.projects_json) if doc.projects_json else []
        intern = json.loads(doc.internships_json) if doc.internships_json else []
        certs = json.loads(doc.certifications_json) if doc.certifications_json else []
        custom = json.loads(doc.custom_sections_json) if doc.custom_sections_json else []
        fmt = json.loads(doc.formatting_config_json) if doc.formatting_config_json else {}

        resume_data = ResumeDataSchema(
            personal_info=p_info,
            career_objective=doc.career_objective or "",
            technical_skills=t_skills,
            education=edu,
            projects=proj,
            internships=intern,
            certifications=certs,
            custom_sections=custom,
            formatting_config=fmt,
        )
    except Exception:
        resume_data = ResumeDataSchema()

    return ResumeResponse(
        id=doc.id,
        user_id=doc.user_id,
        resume_name=doc.resume_name,
        template_id=doc.template_id,
        target_role=doc.target_role,
        job_id=doc.job_id,
        resume_data=resume_data,
        ats_score=doc.ats_score,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


def create_resume(db: Session, user: User | None, req: ResumeCreateRequest) -> ResumeResponse:
    data = req.resume_data
    doc = ResumeDocument(
        user_id=user.id if user else None,
        resume_name=req.resume_name,
        template_id=req.template_id,
        target_role=req.target_role,
        job_id=req.job_id,
        personal_info_json=json.dumps(data.personal_info.model_dump()),
        career_objective=data.career_objective,
        technical_skills_json=json.dumps([s.model_dump() for s in data.technical_skills]),
        education_json=json.dumps([e.model_dump() for e in data.education]),
        projects_json=json.dumps([p.model_dump() for p in data.projects]),
        internships_json=json.dumps([i.model_dump() for i in data.internships]),
        certifications_json=json.dumps([c.model_dump() for c in data.certifications]),
        custom_sections_json=json.dumps([cs.model_dump() for cs in data.custom_sections]),
        formatting_config_json=json.dumps(data.formatting_config.model_dump()),
        ats_score=0,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return serialize_resume(doc)


def get_resume(db: Session, resume_id: int, user: User | None) -> ResumeResponse:
    doc = db.get(ResumeDocument, resume_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")
    if doc.user_id and user and doc.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return serialize_resume(doc)


def list_user_resumes(db: Session, user: User | None) -> list[ResumeListItemResponse]:
    query = db.query(ResumeDocument)
    if user:
        query = query.filter((ResumeDocument.user_id == user.id) | (ResumeDocument.user_id.is_(None)))
    else:
        query = query.filter(ResumeDocument.user_id.is_(None))

    docs = query.order_by(ResumeDocument.updated_at.desc()).all()
    results = []
    for doc in docs:
        tmpl = get_template_by_id(doc.template_id)
        results.append(
            ResumeListItemResponse(
                id=doc.id,
                resume_name=doc.resume_name,
                template_id=doc.template_id,
                template_name=tmpl.template_name if tmpl else doc.template_id.title(),
                target_role=doc.target_role,
                ats_score=doc.ats_score,
                created_at=doc.created_at,
                updated_at=doc.updated_at,
            )
        )
    return results


def update_resume(db: Session, resume_id: int, user: User | None, req: ResumeUpdateRequest) -> ResumeResponse:
    doc = db.get(ResumeDocument, resume_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")
    if doc.user_id and user and doc.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if req.resume_name is not None: doc.resume_name = req.resume_name
    if req.template_id is not None: doc.template_id = req.template_id
    if req.target_role is not None: doc.target_role = req.target_role
    if req.job_id is not None: doc.job_id = req.job_id
    if req.ats_score is not None: doc.ats_score = req.ats_score

    if req.resume_data is not None:
        data = req.resume_data
        doc.personal_info_json = json.dumps(data.personal_info.model_dump())
        doc.career_objective = data.career_objective
        doc.technical_skills_json = json.dumps([s.model_dump() for s in data.technical_skills])
        doc.education_json = json.dumps([e.model_dump() for e in data.education])
        doc.projects_json = json.dumps([p.model_dump() for p in data.projects])
        doc.internships_json = json.dumps([i.model_dump() for i in data.internships])
        doc.certifications_json = json.dumps([c.model_dump() for c in data.certifications])
        doc.custom_sections_json = json.dumps([cs.model_dump() for cs in data.custom_sections])
        doc.formatting_config_json = json.dumps(data.formatting_config.model_dump())

    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doc)
    return serialize_resume(doc)


def delete_resume(db: Session, resume_id: int, user: User | None) -> dict[str, str]:
    doc = db.get(ResumeDocument, resume_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")
    if doc.user_id and user and doc.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    db.delete(doc)
    db.commit()
    return {"message": "Resume successfully deleted"}


def duplicate_resume(db: Session, resume_id: int, user: User | None) -> ResumeResponse:
    orig = db.get(ResumeDocument, resume_id)
    if not orig:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")
    if orig.user_id and user and orig.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    copy_doc = ResumeDocument(
        user_id=user.id if user else None,
        resume_name=f"{orig.resume_name} (Copy)",
        template_id=orig.template_id,
        target_role=orig.target_role,
        job_id=orig.job_id,
        personal_info_json=orig.personal_info_json,
        career_objective=orig.career_objective,
        technical_skills_json=orig.technical_skills_json,
        education_json=orig.education_json,
        projects_json=orig.projects_json,
        internships_json=orig.internships_json,
        certifications_json=orig.certifications_json,
        custom_sections_json=orig.custom_sections_json,
        formatting_config_json=orig.formatting_config_json,
        ats_score=orig.ats_score,
    )
    db.add(copy_doc)
    db.commit()
    db.refresh(copy_doc)
    return serialize_resume(copy_doc)
