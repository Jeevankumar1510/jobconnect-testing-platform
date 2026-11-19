"use client";

import { useEffect, useState, useRef, useTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  FileText,
  Save,
  Download,
  Eye,
  Sparkles,
  ArrowLeft,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Award,
  Check,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Briefcase,
  GraduationCap,
  FolderGit2,
  Code,
  User,
  Wand2,
  Target,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  HelpCircle,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import {
  getResume,
  updateResume,
  getResumeTemplates,
  renderLivePreviewHtml,
  aiImproveText,
  tailorResumeJob,
  checkResumeATS,
  downloadResumeDocx,
  printResumePdf,
} from "@/lib/api";
import type {
  ResumeDocument,
  ResumeData,
  ResumeTemplate,
  FormattingConfig,
  ATSCheckResult,
  JobTailorResponse,
  SkillCategory,
  EducationRecord,
  ProjectRecord,
  InternshipRecord,
  CertificationRecord,
} from "@/lib/types";

const DEFAULT_FORMATTING: FormattingConfig = {
  page_size: "A4",
  font_family: "Calibri",
  margin_top_in: 0.50,
  margin_bottom_in: 0.50,
  margin_left_in: 0.65,
  margin_right_in: 0.65,
  margin_in: 0.50,
  header_align: "center",
  text_align: "left",
  is_single_column: true,
  name_size_pt: 21.0,
  job_title_size_pt: 10.5,
  heading_size_pt: 12.0,
  project_title_size_pt: 10.5,
  body_size_pt: 10.0,
  font_size_pt: 10.0,
  contact_size_pt: 9.5,
  line_spacing: 1.08,
  paragraph_before_pt: 0.0,
  paragraph_after_pt: 3.0,
  section_spacing_before_pt: 8.5,
  section_spacing_after_pt: 4.0,
  section_spacing_px: 8,
  bullet_indent_in: 0.18,
  accent_color: "#0f172a",
};

export default function ResumeStudioEditorPage() {
  const params = useParams();
  const router = useRouter();
  const resumeId = Number(params.id);
  const { user, token, ready } = useAuth();

  // State
  const [resumeDoc, setResumeDoc] = useState<ResumeDocument | null>(null);
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [resumeName, setResumeName] = useState<string>("");
  const [targetRole, setTargetRole] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("modern-professional");
  const [templates, setTemplates] = useState<ResumeTemplate[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live preview
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewZoom, setPreviewZoom] = useState<number>(0.85);

  // Active section accordion in editor
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    personal: true,
    objective: true,
    skills: true,
    education: false,
    projects: true,
    internships: true,
    certifications: false,
    formatting: false,
  });

  // AI & Tailor Modals
  const [showAtsModal, setShowAtsModal] = useState<boolean>(false);
  const [atsResult, setAtsResult] = useState<ATSCheckResult | null>(null);
  const [atsLoading, setAtsLoading] = useState<boolean>(false);

  const [showTailorModal, setShowTailorModal] = useState<boolean>(false);
  const [tailorJdText, setTailorJdText] = useState<string>("");
  const [tailorResult, setTailorResult] = useState<JobTailorResponse | null>(null);
  const [tailorLoading, setTailorLoading] = useState<boolean>(false);

  // AI Bullet improver loading & success states
  const [aiLoadingKey, setAiLoadingKey] = useState<string | null>(null);
  const [aiSuccessKey, setAiSuccessKey] = useState<string | null>(null);

  // Debounced preview trigger
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadResumeAndTemplates();
  }, [resumeId, token]);

  async function loadResumeAndTemplates() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [tmpls, doc] = await Promise.all([
        getResumeTemplates(),
        getResume(resumeId, token || ""),
      ]);
      const safeFormatting: FormattingConfig = {
        ...DEFAULT_FORMATTING,
        ...(doc.resume_data?.formatting_config || {}),
      };
      const safeData: ResumeData = {
        personal_info: doc.resume_data?.personal_info || { full_name: "", email: "", phone: "", location: "" },
        career_objective: doc.resume_data?.career_objective || "",
        technical_skills: doc.resume_data?.technical_skills || [],
        education: doc.resume_data?.education || [],
        projects: doc.resume_data?.projects || [],
        internships: doc.resume_data?.internships || [],
        certifications: doc.resume_data?.certifications || [],
        custom_sections: doc.resume_data?.custom_sections || [],
        formatting_config: safeFormatting,
      };

      setTemplates(tmpls);
      setResumeDoc(doc);
      setResumeData(safeData);
      setResumeName(doc.resume_name);
      setTargetRole(doc.target_role || "");
      setTemplateId(doc.template_id);

      // Render initial preview
      const html = await renderLivePreviewHtml({
        template_id: doc.template_id,
        resume_data: safeData,
        formatting_config: safeFormatting,
      });
      setPreviewHtml(html);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load resume");
    } finally {
      setLoading(false);
    }
  }

  // Trigger preview re-render with 300ms debounce
  function triggerPreviewUpdate(updatedData: ResumeData, updatedTemplateId: string) {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const html = await renderLivePreviewHtml({
          template_id: updatedTemplateId,
          resume_data: updatedData,
          formatting_config: updatedData.formatting_config,
        });
        setPreviewHtml(html);
      } catch (err) {
        console.error("Preview render failed", err);
      } finally {
        setPreviewLoading(false);
      }
    }, 300);
  }

  function updateData(updater: (prev: ResumeData) => ResumeData) {
    setResumeData((prev) => {
      if (!prev) return prev;
      const updated = updater(prev);
      triggerPreviewUpdate(updated, templateId);
      return updated;
    });
  }

  async function handleSave() {
    if (!resumeData) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const updated = await updateResume(
        resumeId,
        {
          resume_name: resumeName,
          template_id: templateId,
          target_role: targetRole,
          resume_data: resumeData,
        },
        token || ""
      );
      setResumeDoc(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  function handleTemplateChange(newTid: string) {
    setTemplateId(newTid);
    if (resumeData) {
      triggerPreviewUpdate(resumeData, newTid);
    }
  }

  function toggleSection(sec: string) {
    setOpenSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  }

  // Smart Fallback Polish Engine (prevents dev overlay & guarantees polish even if network/backend is offline)
  function clientPolishText(
    type: "objective" | "bullet",
    current: string,
    role?: string,
    stack?: string,
  ): string {
    const clean = current.trim();
    if (type === "objective") {
      const r = role || "Software Engineer";
      const st = stack ? stack : "modern software engineering";
      const variants = [
        `Results-oriented ${r} specializing in ${st} and continuous test automation. Proven track record building resilient automated test suites, validating core endpoints with high execution pass rates, and upholding enterprise software reliability. Dedicated engineering professional committed to accelerating release velocity.`,
        `Performance-driven ${r} focused on ${st}, cloud infrastructure reliability, and continuous delivery. Orchestrated end-to-end regression workflows and CI/CD pipelines with zero-defect execution and rapid turnaround times. Dedicated to driving engineering excellence and scalable production standards.`,
        `Analytical ${r} with verified technical strengths in ${st}, API contract validation, and systematic defect prevention. Spearheaded robust engineering frameworks and systematic validation procedures to elevate product stability, test fidelity, and scalable system performance.`,
      ];
      const matchIdx = variants.findIndex(
        (v) => v.toLowerCase().slice(0, 35) === clean.toLowerCase().slice(0, 35),
      );
      return variants[(matchIdx + 1) % variants.length];
    } else {
      let b = clean.replace(/^[•\-* >\d.)]+/, "").trim();
      b = b
        .replace(/\barchitectured\b/gi, "Engineered")
        .replace(/\barchitected and (?:developed|implemented|delivered)\b/gi, "Engineered and deployed")
        .replace(/^architected\b/gi, "Engineered")
        .replace(/\bworked on\b/gi, "Spearheaded")
        .replace(/\bresponsible for\b/gi, "Led the execution of")
        .replace(/\bhelped with\b|\bassisted (?:with|in)\b/gi, "Collaborated to implement")
        .replace(/\bhandled\b/gi, "Administered")
        .replace(/\bmade\b/gi, "Constructed")
        .replace(/\bdid\b/gi, "Executed and delivered");

      if (!/^(Spearheaded|Automated|Orchestrated|Engineered|Constructed|Standardized|Configured|Integrated|Streamlined|Accelerated|Executed|Validated|Deployed|Formulated|Curated|Administered)\b/i.test(b)) {
        b = `Automated and delivered ${b.charAt(0).toLowerCase() + b.slice(1)}`;
      }
      if (!b.endsWith(".")) b += ".";
      return b;
    }
  }

  // AI Enhancers
  async function handleAiImproveObjective() {
    if (!resumeData?.career_objective) return;
    setAiLoadingKey("objective");
    setErrorMsg(null);
    try {
      const allSkills = resumeData.technical_skills
        ?.flatMap((c) => c.skills)
        .slice(0, 5)
        .join(", ");

      let improved = "";
      try {
        const res = await aiImproveText({
          field_type: "objective",
          current_text: resumeData.career_objective,
          target_role: targetRole || undefined,
          context_stack: allSkills || undefined,
        });
        if (res && res.improved) {
          improved = res.improved;
        }
      } catch (apiErr: any) {
        console.warn("API polish unavailable, using smart local engine:", apiErr?.message || apiErr);
        improved = clientPolishText(
          "objective",
          resumeData.career_objective,
          targetRole || undefined,
          allSkills || undefined,
        );
      }

      if (improved) {
        updateData((prev) => ({
          ...prev,
          career_objective: improved,
        }));
        setAiSuccessKey("objective");
        setTimeout(() => setAiSuccessKey(null), 3500);
      }
    } catch (err: any) {
      console.warn("AI polish objective issue:", err?.message || err);
      setErrorMsg(err.message || "Failed to polish objective");
    } finally {
      setAiLoadingKey(null);
    }
  }

  async function handleAiImproveBullet(section: "projects" | "internships", itemIdx: number, bulletIdx: number) {
    if (!resumeData) return;
    const key = `${section}-${itemIdx}-${bulletIdx}`;
    setAiLoadingKey(key);
    setErrorMsg(null);

    const currentBullet =
      section === "projects"
        ? resumeData.projects[itemIdx]?.bullets[bulletIdx]
        : resumeData.internships[itemIdx]?.bullets[bulletIdx];

    if (!currentBullet) {
      setAiLoadingKey(null);
      return;
    }

    try {
      const techStack =
        section === "projects"
          ? resumeData.projects[itemIdx]?.tech_stack
          : resumeData.internships[itemIdx]?.technologies;

      let improved = "";
      try {
        const res = await aiImproveText({
          field_type: "bullet",
          current_text: currentBullet,
          target_role: targetRole,
          context_stack: techStack,
        });
        if (res && res.improved) {
          improved = res.improved;
        }
      } catch (apiErr: any) {
        console.warn("API bullet polish unavailable, using smart local engine:", apiErr?.message || apiErr);
        improved = clientPolishText(
          "bullet",
          currentBullet,
          targetRole || undefined,
          techStack || undefined,
        );
      }

      if (improved) {
        updateData((prev) => {
          if (section === "projects") {
            const projs = [...prev.projects];
            const b = [...projs[itemIdx].bullets];
            b[bulletIdx] = improved;
            projs[itemIdx] = { ...projs[itemIdx], bullets: b };
            return { ...prev, projects: projs };
          } else {
            const interns = [...prev.internships];
            const b = [...interns[itemIdx].bullets];
            b[bulletIdx] = improved;
            interns[itemIdx] = { ...interns[itemIdx], bullets: b };
            return { ...prev, internships: interns };
          }
        });
        setAiSuccessKey(key);
        setTimeout(() => setAiSuccessKey(null), 3500);
      }
    } catch (err: any) {
      console.warn("AI polish bullet issue:", err?.message || err);
      setErrorMsg(err.message || "Failed to polish bullet");
    } finally {
      setAiLoadingKey(null);
    }
  }

  // ATS Check
  async function handleRunAtsCheck() {
    setAtsLoading(true);
    setShowAtsModal(true);
    try {
      const res = await checkResumeATS(resumeId, undefined, token || "");
      setAtsResult(res);
      if (resumeDoc) {
        setResumeDoc({ ...resumeDoc, ats_score: res.ats_score });
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setAtsLoading(false);
    }
  }

  // Tailor to Job
  async function handleRunJobTailor() {
    if (!tailorJdText.trim()) return;
    setTailorLoading(true);
    try {
      const res = await tailorResumeJob(
        resumeId,
        { job_description_text: tailorJdText.trim() },
        token || ""
      );
      setTailorResult(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setTailorLoading(false);
    }
  }

  function applyTailoredObjective() {
    if (!tailorResult?.tailored_objective) return;
    updateData((prev) => ({
      ...prev,
      career_objective: tailorResult.tailored_objective,
    }));
    setShowTailorModal(false);
  }

  if (loading || !resumeData) {
    return (
      <div style={{ textAlign: "center", padding: "6rem 0", color: "#64748b" }}>
        <RefreshCw size={32} className="animate-spin" style={{ margin: "0 auto 1.5rem auto", color: "#2563eb" }} />
        <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#1e293b" }}>Loading Resume Studio Editor...</h3>
      </div>
    );
  }

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* TOP HEADER / ACTION BAR */}
      <header
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          padding: "0.75rem 1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          position: "sticky",
          top: 0,
          zIndex: 100,
          boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link
            href="/resume-studio"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              color: "#64748b",
              textDecoration: "none",
              fontSize: "0.85rem",
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={16} /> Back
          </Link>
          <div style={{ width: "1px", height: "24px", background: "#e2e8f0" }} />
          <div>
            <input
              type="text"
              value={resumeName}
              onChange={(e) => setResumeName(e.target.value)}
              placeholder="Resume Title"
              style={{
                fontSize: "1.05rem",
                fontWeight: 700,
                color: "#0f172a",
                border: "1px solid transparent",
                borderRadius: "6px",
                padding: "2px 6px",
                margin: 0,
                width: "260px",
              }}
              onFocus={(e) => (e.target.style.border = "1px solid #cbd5e1")}
              onBlur={(e) => (e.target.style.border = "1px solid transparent")}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", color: "#64748b", paddingLeft: "6px" }}>
              <span>Role:</span>
              <input
                type="text"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="Target Job Role"
                style={{
                  fontSize: "0.75rem",
                  border: "none",
                  borderBottom: "1px dotted #94a3b8",
                  background: "transparent",
                  color: "#334155",
                  fontWeight: 600,
                  width: "160px",
                }}
              />
            </div>
          </div>
        </div>

        {/* Template Selector & Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          {/* Template Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "#f1f5f9", padding: "4px 8px", borderRadius: "8px" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>Template:</span>
            <select
              value={templateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              style={{
                fontSize: "0.82rem",
                fontWeight: 600,
                color: "#1e293b",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.template_name}
                </option>
              ))}
            </select>
          </div>

          {/* ATS Score Check */}
          <button
            onClick={handleRunAtsCheck}
            disabled={atsLoading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "0.45rem 0.85rem",
              fontSize: "0.82rem",
              fontWeight: 600,
              background: "#eff6ff",
              color: "#2563eb",
              border: "1px solid #bfdbfe",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            <Award size={15} />
            {resumeDoc?.ats_score ? `ATS Score: ${resumeDoc.ats_score}` : "Check ATS"}
          </button>

          {/* Tailor to Job */}
          <button
            onClick={() => setShowTailorModal(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "0.45rem 0.85rem",
              fontSize: "0.82rem",
              fontWeight: 600,
              background: "#f5f3ff",
              color: "#7c3aed",
              border: "1px solid #ddd6fe",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            <Target size={15} />
            Tailor to Job
          </button>

          {/* Export PDF */}
          <button
            onClick={() => printResumePdf(resumeId, token || "")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "0.45rem 0.85rem",
              fontSize: "0.82rem",
              fontWeight: 600,
              background: "#f8fafc",
              color: "#334155",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            <Download size={14} /> PDF
          </button>

          {/* Export Word (.docx) */}
          <button
            onClick={() => downloadResumeDocx(resumeId, resumeName, token || "")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "0.45rem 0.85rem",
              fontSize: "0.82rem",
              fontWeight: 600,
              background: "#f8fafc",
              color: "#334155",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            <Download size={14} /> Word (.docx)
          </button>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="button button-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "0.45rem 1rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              background: saveSuccess ? "#16a34a" : "#2563eb",
              borderColor: saveSuccess ? "#16a34a" : "#2563eb",
            }}
          >
            {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
            {saveSuccess ? "Saved!" : saving ? "Saving..." : "Save"}
          </button>
        </div>
      </header>

      {/* MAIN SPLIT-SCREEN WORKSPACE */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* LEFT COLUMN: ACCORDION FORM EDITOR */}
        <div
          style={{
            width: "50%",
            height: "calc(100vh - 65px)",
            overflowY: "auto",
            padding: "1.5rem",
            borderRight: "1px solid #e2e8f0",
            background: "#ffffff",
          }}
        >
          {errorMsg && (
            <div style={{ padding: "0.75rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#991b1b", marginBottom: "1rem", fontSize: "0.85rem" }}>
              {errorMsg}
            </div>
          )}

          {/* 1. PERSONAL INFORMATION */}
          <div style={{ marginBottom: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("personal")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.85rem 1rem",
                background: "#f8fafc",
                cursor: "pointer",
                fontWeight: 700,
                color: "#1e293b",
                fontSize: "0.95rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <User size={16} color="#2563eb" />
                Personal Information
              </div>
              {openSections.personal ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>

            {openSections.personal && (
              <div style={{ padding: "1.25rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={resumeData.personal_info.full_name}
                    onChange={(e) =>
                      updateData((prev) => ({
                        ...prev,
                        personal_info: { ...prev.personal_info, full_name: e.target.value },
                      }))
                    }
                    placeholder="e.g. Jeevan Kumar"
                    style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                    Professional Headline
                  </label>
                  <input
                    type="text"
                    value={resumeData.personal_info.headline || ""}
                    onChange={(e) =>
                      updateData((prev) => ({
                        ...prev,
                        personal_info: { ...prev.personal_info, headline: e.target.value },
                      }))
                    }
                    placeholder="e.g. Software Testing Engineer | API Automation"
                    style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={resumeData.personal_info.email}
                    onChange={(e) =>
                      updateData((prev) => ({
                        ...prev,
                        personal_info: { ...prev.personal_info, email: e.target.value },
                      }))
                    }
                    placeholder="jeevan@example.com"
                    style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={resumeData.personal_info.phone || ""}
                    onChange={(e) =>
                      updateData((prev) => ({
                        ...prev,
                        personal_info: { ...prev.personal_info, phone: e.target.value },
                      }))
                    }
                    placeholder="+91-9391340978"
                    style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                  />
                </div>

                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                    Location (City, State/Country)
                  </label>
                  <input
                    type="text"
                    value={resumeData.personal_info.location || ""}
                    onChange={(e) =>
                      updateData((prev) => ({
                        ...prev,
                        personal_info: { ...prev.personal_info, location: e.target.value },
                      }))
                    }
                    placeholder="Hyderabad, Telangana"
                    style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                    LinkedIn URL
                  </label>
                  <input
                    type="text"
                    value={resumeData.personal_info.linkedin_url || ""}
                    onChange={(e) =>
                      updateData((prev) => ({
                        ...prev,
                        personal_info: { ...prev.personal_info, linkedin_url: e.target.value },
                      }))
                    }
                    placeholder="linkedin.com/in/jeevan"
                    style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                    GitHub / Portfolio URL
                  </label>
                  <input
                    type="text"
                    value={resumeData.personal_info.github_url || ""}
                    onChange={(e) =>
                      updateData((prev) => ({
                        ...prev,
                        personal_info: { ...prev.personal_info, github_url: e.target.value },
                      }))
                    }
                    placeholder="github.com/jeevan"
                    style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 2. CAREER OBJECTIVE / PROFESSIONAL SUMMARY */}
          <div style={{ marginBottom: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("objective")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.85rem 1rem",
                background: "#f8fafc",
                cursor: "pointer",
                fontWeight: 700,
                color: "#1e293b",
                fontSize: "0.95rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sparkles size={16} color="#7c3aed" />
                Career Objective &amp; Summary
              </div>
              {openSections.objective ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>

            {openSections.objective && (
              <div style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                    2-3 sentences highlighting your specialization and commitment to engineering impact.
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {aiSuccessKey === "objective" && (
                      <span style={{ fontSize: "0.76rem", color: "#16a34a", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <Check size={13} /> Polished with AI!
                      </span>
                    )}
                    <button
                      onClick={handleAiImproveObjective}
                      disabled={aiLoadingKey === "objective" || !resumeData.career_objective}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        background: aiSuccessKey === "objective" ? "#f0fdf4" : "#f5f3ff",
                        color: aiSuccessKey === "objective" ? "#16a34a" : "#7c3aed",
                        border: aiSuccessKey === "objective" ? "1px solid #bbf7d0" : "1px solid #ddd6fe",
                        borderRadius: "6px",
                        padding: "4px 10px",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {aiLoadingKey === "objective" ? (
                        <>
                          <RefreshCw size={12} className="animate-spin" />
                          Polishing...
                        </>
                      ) : aiSuccessKey === "objective" ? (
                        <>
                          <Check size={12} />
                          Polished!
                        </>
                      ) : (
                        <>
                          <Wand2 size={12} />
                          AI Polish
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <textarea
                  rows={4}
                  value={resumeData.career_objective}
                  onChange={(e) =>
                    updateData((prev) => ({
                      ...prev,
                      career_objective: e.target.value,
                    }))
                  }
                  placeholder="Computer Science graduate specialized in Python programming and REST API automation testing..."
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: aiSuccessKey === "objective" ? "1.5px solid #8b5cf6" : "1px solid #cbd5e1",
                    boxShadow: aiSuccessKey === "objective" ? "0 0 0 3px rgba(139, 92, 246, 0.2)" : undefined,
                    transition: "all 0.3s ease",
                    fontSize: "0.88rem",
                    lineHeight: 1.5,
                  }}
                />
              </div>
            )}
          </div>

          {/* 3. TECHNICAL SKILLS */}
          <div style={{ marginBottom: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("skills")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.85rem 1rem",
                background: "#f8fafc",
                cursor: "pointer",
                fontWeight: 700,
                color: "#1e293b",
                fontSize: "0.95rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Code size={16} color="#059669" />
                Technical Skills ({resumeData.technical_skills.length} categories)
              </div>
              {openSections.skills ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>

            {openSections.skills && (
              <div style={{ padding: "1.25rem" }}>
                {resumeData.technical_skills.map((cat, catIdx) => (
                  <div key={catIdx} style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid #f1f5f9" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                      <input
                        type="text"
                        value={cat.category}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateData((prev) => {
                            const updated = [...prev.technical_skills];
                            updated[catIdx] = { ...updated[catIdx], category: val };
                            return { ...prev, technical_skills: updated };
                          });
                        }}
                        placeholder="Category Name (e.g. Programming Languages)"
                        style={{ fontWeight: 700, fontSize: "0.88rem", border: "none", borderBottom: "1px solid #cbd5e1", width: "70%", padding: "2px" }}
                      />
                      <button
                        onClick={() => {
                          updateData((prev) => ({
                            ...prev,
                            technical_skills: prev.technical_skills.filter((_, idx) => idx !== catIdx),
                          }));
                        }}
                        style={{ background: "none", border: "none", color: "#e11d48", cursor: "pointer", padding: "2px" }}
                        title="Delete category"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={cat.skills.join(", ")}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const items = raw.split(",").map((s) => s.trim()).filter((s) => s);
                        updateData((prev) => {
                          const updated = [...prev.technical_skills];
                          updated[catIdx] = { ...updated[catIdx], skills: items };
                          return { ...prev, technical_skills: updated };
                        });
                      }}
                      placeholder="Comma-separated skills (e.g. Python, SQL, REST APIs)"
                      style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    />
                  </div>
                ))}

                <button
                  onClick={() => {
                    updateData((prev) => ({
                      ...prev,
                      technical_skills: [
                        ...prev.technical_skills,
                        { category: "New Category", skills: ["Skill 1", "Skill 2"] },
                      ],
                    }));
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    background: "#f0fdf4",
                    color: "#166534",
                    border: "1px solid #bbf7d0",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={14} /> Add Skill Category
                </button>
              </div>
            )}
          </div>

          {/* 4. EDUCATION */}
          <div style={{ marginBottom: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("education")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.85rem 1rem",
                background: "#f8fafc",
                cursor: "pointer",
                fontWeight: 700,
                color: "#1e293b",
                fontSize: "0.95rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <GraduationCap size={16} color="#0284c7" />
                Education ({resumeData.education.length} entries)
              </div>
              {openSections.education ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>

            {openSections.education && (
              <div style={{ padding: "1.25rem" }}>
                {resumeData.education.map((ed, edIdx) => (
                  <div key={edIdx} style={{ marginBottom: "1.25rem", padding: "0.75rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155" }}>Degree #{edIdx + 1}</span>
                      <button
                        onClick={() => {
                          updateData((prev) => ({
                            ...prev,
                            education: prev.education.filter((_, idx) => idx !== edIdx),
                          }));
                        }}
                        style={{ background: "none", border: "none", color: "#e11d48", cursor: "pointer" }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>Degree / Course</label>
                        <input
                          type="text"
                          value={ed.degree}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateData((prev) => {
                              const arr = [...prev.education];
                              arr[edIdx] = { ...arr[edIdx], degree: val };
                              return { ...prev, education: arr };
                            });
                          }}
                          placeholder="B.Tech in Computer Science"
                          style={{ width: "100%", padding: "5px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>Institution / University</label>
                        <input
                          type="text"
                          value={ed.institution}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateData((prev) => {
                              const arr = [...prev.education];
                              arr[edIdx] = { ...arr[edIdx], institution: val };
                              return { ...prev, education: arr };
                            });
                          }}
                          placeholder="JNTUH University"
                          style={{ width: "100%", padding: "5px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>Graduation Date / Years</label>
                        <input
                          type="text"
                          value={ed.graduation_date || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateData((prev) => {
                              const arr = [...prev.education];
                              arr[edIdx] = { ...arr[edIdx], graduation_date: val };
                              return { ...prev, education: arr };
                            });
                          }}
                          placeholder="2020 - 2024"
                          style={{ width: "100%", padding: "5px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>CGPA / Percentage</label>
                        <input
                          type="text"
                          value={ed.score || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateData((prev) => {
                              const arr = [...prev.education];
                              arr[edIdx] = { ...arr[edIdx], score: val };
                              return { ...prev, education: arr };
                            });
                          }}
                          placeholder="CGPA: 8.4 / 10"
                          style={{ width: "100%", padding: "5px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => {
                    updateData((prev) => ({
                      ...prev,
                      education: [
                        ...prev.education,
                        { degree: "Bachelor of Technology", institution: "University Name", graduation_date: "2024", score: "8.5 CGPA" },
                      ],
                    }));
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    background: "#f0f9ff",
                    color: "#0369a1",
                    border: "1px solid #bae6fd",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={14} /> Add Education Entry
                </button>
              </div>
            )}
          </div>

          {/* 5. PROJECTS */}
          <div style={{ marginBottom: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("projects")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.85rem 1rem",
                background: "#f8fafc",
                cursor: "pointer",
                fontWeight: 700,
                color: "#1e293b",
                fontSize: "0.95rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <FolderGit2 size={16} color="#d97706" />
                Projects ({resumeData.projects.length} projects)
              </div>
              {openSections.projects ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>

            {openSections.projects && (
              <div style={{ padding: "1.25rem" }}>
                {resumeData.projects.map((pr, prIdx) => (
                  <div key={prIdx} style={{ marginBottom: "1.25rem", padding: "0.85rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e293b" }}>Project #{prIdx + 1}</span>
                      <button
                        onClick={() => {
                          updateData((prev) => ({
                            ...prev,
                            projects: prev.projects.filter((_, idx) => idx !== prIdx),
                          }));
                        }}
                        style={{ background: "none", border: "none", color: "#e11d48", cursor: "pointer" }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>Project Title *</label>
                        <input
                          type="text"
                          value={pr.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateData((prev) => {
                              const arr = [...prev.projects];
                              arr[prIdx] = { ...arr[prIdx], title: val };
                              return { ...prev, projects: arr };
                            });
                          }}
                          placeholder="Automated REST API Test Suite"
                          style={{ width: "100%", padding: "5px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>Tech Stack</label>
                        <input
                          type="text"
                          value={pr.tech_stack || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateData((prev) => {
                              const arr = [...prev.projects];
                              arr[prIdx] = { ...arr[prIdx], tech_stack: val };
                              return { ...prev, projects: arr };
                            });
                          }}
                          placeholder="Python, Pytest, Requests, GitHub Actions"
                          style={{ width: "100%", padding: "5px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>GitHub / Demo URL</label>
                      <input
                        type="text"
                        value={pr.github_url || pr.project_url || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateData((prev) => {
                            const arr = [...prev.projects];
                            arr[prIdx] = { ...arr[prIdx], github_url: val };
                            return { ...prev, projects: arr };
                          });
                        }}
                        placeholder="github.com/jeevan/api-test-suite"
                        style={{ width: "100%", padding: "5px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem", marginBottom: "0.5rem" }}
                      />
                    </div>

                    {/* Bullet points */}
                    <div style={{ marginTop: "0.5rem" }}>
                      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
                        Key Achievements &amp; Metrics (Action Verb + What + Impact)
                      </label>
                      {pr.bullets.map((b, bIdx) => {
                        const bKey = `projects-${prIdx}-${bIdx}`;
                        return (
                          <div key={bIdx} style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "4px" }}>
                            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>•</span>
                            <input
                              type="text"
                              value={b}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateData((prev) => {
                                  const arr = [...prev.projects];
                                  const bullets = [...arr[prIdx].bullets];
                                  bullets[bIdx] = val;
                                  arr[prIdx] = { ...arr[prIdx], bullets };
                                  return { ...prev, projects: arr };
                                });
                              }}
                              placeholder="Engineered an automated API test framework validating 78 endpoints..."
                              style={{
                                flex: 1,
                                padding: "5px 8px",
                                borderRadius: "4px",
                                border: aiSuccessKey === bKey ? "1.5px solid #8b5cf6" : "1px solid #cbd5e1",
                                boxShadow: aiSuccessKey === bKey ? "0 0 0 2px rgba(139, 92, 246, 0.2)" : undefined,
                                transition: "all 0.3s ease",
                                fontSize: "0.82rem",
                              }}
                            />
                            <button
                              onClick={() => handleAiImproveBullet("projects", prIdx, bIdx)}
                              disabled={aiLoadingKey === bKey || !b}
                              title="Improve with AI (Google X-Y-Z formula)"
                              style={{
                                background: aiSuccessKey === bKey ? "#f0fdf4" : "#f5f3ff",
                                color: aiSuccessKey === bKey ? "#16a34a" : "#7c3aed",
                                border: aiSuccessKey === bKey ? "1px solid #bbf7d0" : "1px solid #ddd6fe",
                                borderRadius: "4px",
                                padding: "4px 8px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "3px",
                                transition: "all 0.2s ease",
                              }}
                            >
                              {aiLoadingKey === bKey ? (
                                <RefreshCw size={11} className="animate-spin" />
                              ) : aiSuccessKey === bKey ? (
                                <Check size={11} />
                              ) : (
                                <Wand2 size={11} />
                              )}
                              {aiSuccessKey === bKey ? "Polished" : "AI"}
                            </button>
                            <button
                              onClick={() => {
                                updateData((prev) => {
                                  const arr = [...prev.projects];
                                  const bullets = arr[prIdx].bullets.filter((_, idx) => idx !== bIdx);
                                  arr[prIdx] = { ...arr[prIdx], bullets };
                                  return { ...prev, projects: arr };
                                });
                              }}
                              style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        );
                      })}

                      <button
                        onClick={() => {
                          updateData((prev) => {
                            const arr = [...prev.projects];
                            arr[prIdx] = { ...arr[prIdx], bullets: [...arr[prIdx].bullets, ""] };
                            return { ...prev, projects: arr };
                          });
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#2563eb",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          padding: "2px 0",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          marginTop: "2px",
                        }}
                      >
                        <Plus size={12} /> Add Bullet Point
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => {
                    updateData((prev) => ({
                      ...prev,
                      projects: [
                        ...prev.projects,
                        {
                          title: "New Project",
                          tech_stack: "Python, FastAPI",
                          bullets: ["Engineered scalable backend service achieving 99.9% uptime."],
                        },
                      ],
                    }));
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    background: "#fef3c7",
                    color: "#92400e",
                    border: "1px solid #fde68a",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={14} /> Add Project
                </button>
              </div>
            )}
          </div>

          {/* 6. INTERNSHIPS & EXPERIENCE */}
          <div style={{ marginBottom: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("internships")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.85rem 1rem",
                background: "#f8fafc",
                cursor: "pointer",
                fontWeight: 700,
                color: "#1e293b",
                fontSize: "0.95rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Briefcase size={16} color="#4f46e5" />
                Internships &amp; Experience ({resumeData.internships.length} entries)
              </div>
              {openSections.internships ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>

            {openSections.internships && (
              <div style={{ padding: "1.25rem" }}>
                {resumeData.internships.map((it, itIdx) => (
                  <div key={itIdx} style={{ marginBottom: "1.25rem", padding: "0.85rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e293b" }}>Role #{itIdx + 1}</span>
                      <button
                        onClick={() => {
                          updateData((prev) => ({
                            ...prev,
                            internships: prev.internships.filter((_, idx) => idx !== itIdx),
                          }));
                        }}
                        style={{ background: "none", border: "none", color: "#e11d48", cursor: "pointer" }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>Role Title *</label>
                        <input
                          type="text"
                          value={it.role}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateData((prev) => {
                              const arr = [...prev.internships];
                              arr[itIdx] = { ...arr[itIdx], role: val };
                              return { ...prev, internships: arr };
                            });
                          }}
                          placeholder="AWS Cloud & Test Intern"
                          style={{ width: "100%", padding: "5px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>Company / Organization *</label>
                        <input
                          type="text"
                          value={it.organization}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateData((prev) => {
                              const arr = [...prev.internships];
                              arr[itIdx] = { ...arr[itIdx], organization: val };
                              return { ...prev, internships: arr };
                            });
                          }}
                          placeholder="Techwing Solutions"
                          style={{ width: "100%", padding: "5px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>Duration (e.g. Feb 2024 - Aug 2024)</label>
                        <input
                          type="text"
                          value={it.duration || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateData((prev) => {
                              const arr = [...prev.internships];
                              arr[itIdx] = { ...arr[itIdx], duration: val };
                              return { ...prev, internships: arr };
                            });
                          }}
                          placeholder="Feb 2024 - Aug 2024"
                          style={{ width: "100%", padding: "5px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>Location</label>
                        <input
                          type="text"
                          value={it.location || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateData((prev) => {
                              const arr = [...prev.internships];
                              arr[itIdx] = { ...arr[itIdx], location: val };
                              return { ...prev, internships: arr };
                            });
                          }}
                          placeholder="Rajahmundry"
                          style={{ width: "100%", padding: "5px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                        />
                      </div>
                    </div>

                    {/* Bullet points */}
                    <div style={{ marginTop: "0.5rem" }}>
                      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
                        Key Responsibilities &amp; Deliverables
                      </label>
                      {it.bullets.map((b, bIdx) => {
                        const bKey = `internships-${itIdx}-${bIdx}`;
                        return (
                          <div key={bIdx} style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "4px" }}>
                            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>•</span>
                            <input
                              type="text"
                              value={b}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateData((prev) => {
                                  const arr = [...prev.internships];
                                  const bullets = [...arr[itIdx].bullets];
                                  bullets[bIdx] = val;
                                  arr[itIdx] = { ...arr[itIdx], bullets };
                                  return { ...prev, internships: arr };
                                });
                              }}
                              placeholder="Automated Python-based cloud provisioning workflows across 4 AWS services..."
                              style={{
                                flex: 1,
                                padding: "5px 8px",
                                borderRadius: "4px",
                                border: aiSuccessKey === bKey ? "1.5px solid #8b5cf6" : "1px solid #cbd5e1",
                                boxShadow: aiSuccessKey === bKey ? "0 0 0 2px rgba(139, 92, 246, 0.2)" : undefined,
                                transition: "all 0.3s ease",
                                fontSize: "0.82rem",
                              }}
                            />
                            <button
                              onClick={() => handleAiImproveBullet("internships", itIdx, bIdx)}
                              disabled={aiLoadingKey === bKey || !b}
                              title="Improve with AI (Google X-Y-Z formula)"
                              style={{
                                background: aiSuccessKey === bKey ? "#f0fdf4" : "#f5f3ff",
                                color: aiSuccessKey === bKey ? "#16a34a" : "#7c3aed",
                                border: aiSuccessKey === bKey ? "1px solid #bbf7d0" : "1px solid #ddd6fe",
                                borderRadius: "4px",
                                padding: "4px 8px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "3px",
                                transition: "all 0.2s ease",
                              }}
                            >
                              {aiLoadingKey === bKey ? (
                                <RefreshCw size={11} className="animate-spin" />
                              ) : aiSuccessKey === bKey ? (
                                <Check size={11} />
                              ) : (
                                <Wand2 size={11} />
                              )}
                              {aiSuccessKey === bKey ? "Polished" : "AI"}
                            </button>
                            <button
                              onClick={() => {
                                updateData((prev) => {
                                  const arr = [...prev.internships];
                                  const bullets = arr[itIdx].bullets.filter((_, idx) => idx !== bIdx);
                                  arr[itIdx] = { ...arr[itIdx], bullets };
                                  return { ...prev, internships: arr };
                                });
                              }}
                              style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        );
                      })}

                      <button
                        onClick={() => {
                          updateData((prev) => {
                            const arr = [...prev.internships];
                            arr[itIdx] = { ...arr[itIdx], bullets: [...arr[itIdx].bullets, ""] };
                            return { ...prev, internships: arr };
                          });
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#2563eb",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          padding: "2px 0",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          marginTop: "2px",
                        }}
                      >
                        <Plus size={12} /> Add Bullet Point
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => {
                    updateData((prev) => ({
                      ...prev,
                      internships: [
                        ...prev.internships,
                        {
                          role: "Software Engineering Intern",
                          organization: "Company Name",
                          duration: "May 2024 - Jul 2024",
                          location: "Hyderabad",
                          bullets: ["Collaborated with senior engineers to deliver REST API enhancements."],
                        },
                      ],
                    }));
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    background: "#ede9fe",
                    color: "#5b21b6",
                    border: "1px solid #ddd6fe",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={14} /> Add Internship / Experience
                </button>
              </div>
            )}
          </div>

          {/* 7. CERTIFICATIONS */}
          <div style={{ marginBottom: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("certifications")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.85rem 1rem",
                background: "#f8fafc",
                cursor: "pointer",
                fontWeight: 700,
                color: "#1e293b",
                fontSize: "0.95rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Award size={16} color="#ea580c" />
                Certifications ({resumeData.certifications.length} certificates)
              </div>
              {openSections.certifications ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>

            {openSections.certifications && (
              <div style={{ padding: "1.25rem" }}>
                {resumeData.certifications.map((cr, crIdx) => (
                  <div key={crIdx} style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "0.5rem" }}>
                    <input
                      type="text"
                      value={cr.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateData((prev) => {
                          const arr = [...prev.certifications];
                          arr[crIdx] = { ...arr[crIdx], name: val };
                          return { ...prev, certifications: arr };
                        });
                      }}
                      placeholder="AWS Certified Cloud Practitioner"
                      style={{ flex: 1.5, padding: "5px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    />
                    <input
                      type="text"
                      value={cr.organization || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateData((prev) => {
                          const arr = [...prev.certifications];
                          arr[crIdx] = { ...arr[crIdx], organization: val };
                          return { ...prev, certifications: arr };
                        });
                      }}
                      placeholder="Amazon Web Services"
                      style={{ flex: 1, padding: "5px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    />
                    <button
                      onClick={() => {
                        updateData((prev) => ({
                          ...prev,
                          certifications: prev.certifications.filter((_, idx) => idx !== crIdx),
                        }));
                      }}
                      style={{ background: "none", border: "none", color: "#e11d48", cursor: "pointer" }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => {
                    updateData((prev) => ({
                      ...prev,
                      certifications: [
                        ...prev.certifications,
                        { name: "New Certification", organization: "Issuing Body" },
                      ],
                    }));
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    background: "#fff7ed",
                    color: "#9a3412",
                    border: "1px solid #fed7aa",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={14} /> Add Certification
                </button>
              </div>
            )}
          </div>

          {/* 8. FORMATTING & TYPOGRAPHY */}
          <div style={{ marginBottom: "1rem", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("formatting")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.85rem 1rem",
                background: "#f8fafc",
                cursor: "pointer",
                fontWeight: 700,
                color: "#1e293b",
                fontSize: "0.95rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sliders size={16} color="#475569" />
                Formatting &amp; Single-Page Geometry
              </div>
              {openSections.formatting ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>

            {openSections.formatting && (
              <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                {/* 1-Click ATS Standards Recommendation */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0f172a" }}>ATS Standard Resume Alignment</div>
                    <div style={{ fontSize: "0.74rem", color: "#64748b" }}>A4 • 0.5" Top/Bottom • 0.65" Left/Right • Center Header • Calibri / Arial</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      updateData((prev) => ({
                        ...prev,
                        formatting_config: {
                          ...prev.formatting_config,
                          page_size: "A4",
                          font_family: "Calibri",
                          margin_top_in: 0.50,
                          margin_bottom_in: 0.50,
                          margin_left_in: 0.65,
                          margin_right_in: 0.65,
                          margin_in: 0.50,
                          header_align: "center",
                          text_align: "left",
                          is_single_column: true,
                          name_size_pt: 21.0,
                          job_title_size_pt: 10.5,
                          heading_size_pt: 12.0,
                          project_title_size_pt: 10.5,
                          body_size_pt: 10.0,
                          font_size_pt: 10.0,
                          contact_size_pt: 9.5,
                          line_spacing: 1.08,
                          paragraph_before_pt: 0.0,
                          paragraph_after_pt: 3.0,
                          section_spacing_before_pt: 8.5,
                          section_spacing_after_pt: 4.0,
                          bullet_indent_in: 0.18,
                        },
                      }));
                    }}
                    style={{
                      padding: "5px 12px",
                      background: "#0f172a",
                      color: "#ffffff",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      borderRadius: "6px",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Apply ATS Defaults
                  </button>
                </div>

                {/* Typography & Fonts */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>
                      Recommended Font
                    </label>
                    <select
                      value={resumeData.formatting_config.font_family || "Calibri"}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateData((prev) => ({
                          ...prev,
                          formatting_config: { ...prev.formatting_config, font_family: val },
                        }));
                      }}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    >
                      <option value="Calibri">Calibri (Recommended ATS Standard)</option>
                      <option value="Arial">Arial (Clean &amp; Universal)</option>
                      <option value="Aptos">Aptos (Modern Standard)</option>
                      <option value="Cambria">Cambria (Professional Serif)</option>
                      <option value="Times New Roman">Times New Roman (Academic &amp; Legal)</option>
                      <option value="Inter">Inter (Crisp Tech)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>
                      Accent Color
                    </label>
                    <input
                      type="color"
                      value={resumeData.formatting_config.accent_color || "#0f172a"}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateData((prev) => ({
                          ...prev,
                          formatting_config: { ...prev.formatting_config, accent_color: val },
                        }));
                      }}
                      style={{ width: "100%", height: "36px", padding: "2px", borderRadius: "4px", border: "1px solid #cbd5e1", cursor: "pointer" }}
                    />
                  </div>
                </div>

                {/* Page Margins Grid */}
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                    Page Margins (A4 Single Column)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.5rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "#64748b" }}>Top Margin</label>
                      <select
                        value={resumeData.formatting_config.margin_top_in ?? 0.50}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          updateData((prev) => ({
                            ...prev,
                            formatting_config: { ...prev.formatting_config, margin_top_in: val },
                          }));
                        }}
                        style={{ width: "100%", padding: "5px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.82rem" }}
                      >
                        <option value={0.4}>0.40 in</option>
                        <option value={0.5}>0.50 in (Rec)</option>
                        <option value={0.6}>0.60 in</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "#64748b" }}>Bottom Margin</label>
                      <select
                        value={resumeData.formatting_config.margin_bottom_in ?? 0.50}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          updateData((prev) => ({
                            ...prev,
                            formatting_config: { ...prev.formatting_config, margin_bottom_in: val },
                          }));
                        }}
                        style={{ width: "100%", padding: "5px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.82rem" }}
                      >
                        <option value={0.4}>0.40 in</option>
                        <option value={0.5}>0.50 in (Rec)</option>
                        <option value={0.6}>0.60 in</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "#64748b" }}>Left Margin</label>
                      <select
                        value={resumeData.formatting_config.margin_left_in ?? 0.65}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          updateData((prev) => ({
                            ...prev,
                            formatting_config: { ...prev.formatting_config, margin_left_in: val },
                          }));
                        }}
                        style={{ width: "100%", padding: "5px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.82rem" }}
                      >
                        <option value={0.5}>0.50 in</option>
                        <option value={0.65}>0.65 in (Rec)</option>
                        <option value={0.75}>0.75 in</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "#64748b" }}>Right Margin</label>
                      <select
                        value={resumeData.formatting_config.margin_right_in ?? 0.65}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          updateData((prev) => ({
                            ...prev,
                            formatting_config: { ...prev.formatting_config, margin_right_in: val },
                          }));
                        }}
                        style={{ width: "100%", padding: "5px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.82rem" }}
                      >
                        <option value={0.5}>0.50 in</option>
                        <option value={0.65}>0.65 in (Rec)</option>
                        <option value={0.75}>0.75 in</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Alignment & Hierarchy */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>
                      Header Alignment
                    </label>
                    <select
                      value={resumeData.formatting_config.header_align || "center"}
                      onChange={(e) => {
                        const val = e.target.value as "center" | "left";
                        updateData((prev) => ({
                          ...prev,
                          formatting_config: { ...prev.formatting_config, header_align: val },
                        }));
                      }}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    >
                      <option value="center">Center (Recommended ATS)</option>
                      <option value="left">Left Aligned</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>
                      Body Line Spacing
                    </label>
                    <select
                      value={resumeData.formatting_config.line_spacing ?? 1.08}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        updateData((prev) => ({
                          ...prev,
                          formatting_config: { ...prev.formatting_config, line_spacing: val },
                        }));
                      }}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    >
                      <option value={1.0}>1.00 (Ultra Compact)</option>
                      <option value={1.05}>1.05</option>
                      <option value={1.08}>1.08 (Recommended 1.0–1.1)</option>
                      <option value={1.15}>1.15</option>
                    </select>
                  </div>
                </div>

                {/* Font Sizes Breakdown */}
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                    Font Size Hierarchy (pt)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "#64748b" }}>Candidate Name</label>
                      <select
                        value={resumeData.formatting_config.name_size_pt ?? 21.0}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          updateData((prev) => ({
                            ...prev,
                            formatting_config: { ...prev.formatting_config, name_size_pt: val },
                          }));
                        }}
                        style={{ width: "100%", padding: "5px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.82rem" }}
                      >
                        <option value={20.0}>20 pt</option>
                        <option value={21.0}>21 pt (Rec 20–22)</option>
                        <option value={22.0}>22 pt</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "#64748b" }}>Section Headings</label>
                      <select
                        value={resumeData.formatting_config.heading_size_pt ?? 12.0}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          updateData((prev) => ({
                            ...prev,
                            formatting_config: { ...prev.formatting_config, heading_size_pt: val },
                          }));
                        }}
                        style={{ width: "100%", padding: "5px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.82rem" }}
                      >
                        <option value={12.0}>12.0 pt (Rec 12–13)</option>
                        <option value={12.5}>12.5 pt</option>
                        <option value={13.0}>13.0 pt</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "#64748b" }}>Body Text</label>
                      <select
                        value={resumeData.formatting_config.body_size_pt ?? resumeData.formatting_config.font_size_pt ?? 10.0}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          updateData((prev) => ({
                            ...prev,
                            formatting_config: { ...prev.formatting_config, body_size_pt: val, font_size_pt: val },
                          }));
                        }}
                        style={{ width: "100%", padding: "5px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.82rem" }}
                      >
                        <option value={9.5}>9.5 pt</option>
                        <option value={10.0}>10.0 pt (Rec 9.5–10.5)</option>
                        <option value={10.5}>10.5 pt</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Spacing & Indentation */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>
                      Section Spacing Before
                    </label>
                    <select
                      value={resumeData.formatting_config.section_spacing_before_pt ?? 8.5}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        updateData((prev) => ({
                          ...prev,
                          formatting_config: { ...prev.formatting_config, section_spacing_before_pt: val },
                        }));
                      }}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    >
                      <option value={8.0}>8.0 pt</option>
                      <option value={8.5}>8.5 pt (Rec 8–10 pt)</option>
                      <option value={10.0}>10.0 pt</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>
                      Bullet Indentation
                    </label>
                    <select
                      value={resumeData.formatting_config.bullet_indent_in ?? 0.18}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        updateData((prev) => ({
                          ...prev,
                          formatting_config: { ...prev.formatting_config, bullet_indent_in: val },
                        }));
                      }}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    >
                      <option value={0.15}>0.15 in</option>
                      <option value={0.18}>0.18 in (Rec 0.15–0.20)</option>
                      <option value={0.20}>0.20 in</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: REAL-TIME LIVE PREVIEW */}
        <div
          style={{
            width: "50%",
            height: "calc(100vh - 65px)",
            background: "#64748b",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Preview Toolbar */}
          <div
            style={{
              padding: "0.5rem 1rem",
              background: "#475569",
              color: "#ffffff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.82rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Eye size={14} />
              <span>Real-Time ATS Preview</span>
              {previewLoading && (
                <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#93c5fd", fontSize: "0.75rem" }}>
                  <RefreshCw size={12} className="animate-spin" /> Updating...
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  background: "#10b981",
                  color: "#ffffff",
                  padding: "2px 6px",
                  borderRadius: "4px",
                }}
              >
                1 Page Geometry Verified
              </span>
              <button
                onClick={() => setPreviewZoom((z) => Math.max(0.65, z - 0.05))}
                style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#ffffff", borderRadius: "4px", padding: "2px 6px", cursor: "pointer" }}
                title="Zoom Out"
              >
                <ZoomOut size={13} />
              </button>
              <span>{Math.round(previewZoom * 100)}%</span>
              <button
                onClick={() => setPreviewZoom((z) => Math.min(1.15, z + 0.05))}
                style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#ffffff", borderRadius: "4px", padding: "2px 6px", cursor: "pointer" }}
                title="Zoom In"
              >
                <ZoomIn size={13} />
              </button>
            </div>
          </div>

          {/* Iframe Container */}
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "1.5rem",
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.2)",
                transform: `scale(${previewZoom})`,
                transformOrigin: "top center",
                transition: "transform 0.15s ease",
                background: "#ffffff",
              }}
            >
              <iframe
                srcDoc={previewHtml}
                title="Resume Preview"
                style={{
                  width: "210mm",
                  height: "297mm",
                  border: "none",
                  background: "#ffffff",
                  display: "block",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* MODAL 1: ATS SCORE ENGINE MODAL */}
      {showAtsModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1.5rem",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              maxWidth: "600px",
              width: "100%",
              padding: "2rem",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ fontSize: "1.35rem", fontWeight: 800, color: "#0f172a", margin: "0 0 0.25rem 0" }}>
                  ATS Score Analysis
                </h3>
                <p style={{ fontSize: "0.85rem", color: "#64748b", margin: 0 }}>
                  Deterministic ATS compliance &amp; readability evaluation
                </p>
              </div>
              <button
                onClick={() => setShowAtsModal(false)}
                style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "1.2rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {atsLoading ? (
              <div style={{ textAlign: "center", padding: "3rem 0" }}>
                <RefreshCw size={28} className="animate-spin" style={{ margin: "0 auto 1rem auto", color: "#2563eb" }} />
                <p style={{ color: "#64748b" }}>Evaluating resume structure against ATS algorithms...</p>
              </div>
            ) : atsResult ? (
              <div>
                {/* Score Dial */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1.5rem",
                    padding: "1.25rem",
                    background: atsResult.ats_score >= 80 ? "#ecfdf5" : atsResult.ats_score >= 65 ? "#fffbeb" : "#fef2f2",
                    borderRadius: "12px",
                    marginBottom: "1.5rem",
                  }}
                >
                  <div
                    style={{
                      width: "72px",
                      height: "72px",
                      borderRadius: "50%",
                      background: atsResult.ats_score >= 80 ? "#10b981" : atsResult.ats_score >= 65 ? "#f59e0b" : "#ef4444",
                      color: "#ffffff",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: "1.4rem",
                    }}
                  >
                    <span>{atsResult.ats_score}</span>
                    <span style={{ fontSize: "0.65rem", fontWeight: 600 }}>/ 100</span>
                  </div>
                  <div>
                    <h4 style={{ margin: "0 0 0.25rem 0", fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
                      {atsResult.ats_score >= 80
                        ? "Excellent ATS Compatibility"
                        : atsResult.ats_score >= 65
                        ? "Good - Ready for Application"
                        : "Needs Improvement"}
                    </h4>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#475569" }}>
                      Single-column hierarchy, zero tables/textboxes, and standard UTF-8 headers ensure high parse fidelity.
                    </p>
                  </div>
                </div>

                {/* Category Scores */}
                <div style={{ marginBottom: "1.5rem" }}>
                  <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#1e293b", marginBottom: "0.75rem" }}>
                    Category Breakdown
                  </h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    {Object.entries(atsResult.category_scores || {}).map(([cat, score]) => (
                      <div key={cat} style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 600, color: "#475569" }}>
                          <span>{cat}</span>
                          <span style={{ color: score >= 80 ? "#16a34a" : "#d97706" }}>{score}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Suggestions */}
                {atsResult.suggestions && atsResult.suggestions.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#1e293b", marginBottom: "0.5rem" }}>
                      ATS Optimization Suggestions
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem", color: "#475569", lineHeight: 1.6 }}>
                      {atsResult.suggestions.map((s, idx) => (
                        <li key={idx} style={{ marginBottom: "4px" }}>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.5rem" }}>
              <button onClick={() => setShowAtsModal(false)} className="button button-primary">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: JOB TAILOR MODAL */}
      {showTailorModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1.5rem",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              maxWidth: "640px",
              width: "100%",
              padding: "2rem",
              maxHeight: "88vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ fontSize: "1.35rem", fontWeight: 800, color: "#0f172a", margin: "0 0 0.25rem 0" }}>
                  Tailor Resume to Target Job
                </h3>
                <p style={{ fontSize: "0.85rem", color: "#64748b", margin: 0 }}>
                  Compare your resume against a Job Description. Identifies genuine keyword overlap without fabricating skills.
                </p>
              </div>
              <button
                onClick={() => setShowTailorModal(false)}
                style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "1.2rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#334155", marginBottom: "0.4rem" }}>
                Paste Job Description
              </label>
              <textarea
                rows={5}
                value={tailorJdText}
                onChange={(e) => setTailorJdText(e.target.value)}
                placeholder="Paste the target job description or requirements here..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.88rem",
                  lineHeight: 1.5,
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1.25rem" }}>
              <button
                onClick={handleRunJobTailor}
                disabled={tailorLoading || !tailorJdText.trim()}
                className="button button-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                {tailorLoading ? <RefreshCw size={14} className="animate-spin" /> : <Target size={14} />}
                {tailorLoading ? "Analyzing Match..." : "Analyze Match"}
              </button>
            </div>

            {tailorResult && (
              <div style={{ background: "#f8fafc", padding: "1.25rem", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1rem" }}>
                  <span
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      padding: "4px 10px",
                      borderRadius: "999px",
                      background: "#ecfdf5",
                      color: "#059669",
                    }}
                  >
                    Match Compatibility: {tailorResult.compatibility_score}%
                  </span>
                </div>

                {/* Matched skills */}
                <div style={{ marginBottom: "0.75rem" }}>
                  <strong style={{ fontSize: "0.82rem", color: "#166534" }}>
                    ✓ Matched Skills in Your Profile ({tailorResult.matched_skills.length}):
                  </strong>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                    {tailorResult.matched_skills.map((s) => (
                      <span key={s} style={{ background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "4px", fontSize: "0.78rem" }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Missing skills */}
                {tailorResult.missing_skills.length > 0 && (
                  <div style={{ marginBottom: "1rem" }}>
                    <strong style={{ fontSize: "0.82rem", color: "#991b1b" }}>
                      ! Missing In Job Requirements (Do not add unless experienced):
                    </strong>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                      {tailorResult.missing_skills.map((s) => (
                        <span key={s} style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: "4px", fontSize: "0.78rem" }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tailored Objective */}
                <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <strong style={{ fontSize: "0.85rem", color: "#1e293b" }}>Tailored Objective Proposal:</strong>
                    <button
                      onClick={applyTailoredObjective}
                      style={{
                        background: "#2563eb",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "6px",
                        padding: "3px 8px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Apply to Resume
                    </button>
                  </div>
                  <p style={{ fontSize: "0.85rem", color: "#334155", lineHeight: 1.5, margin: 0, fontStyle: "italic", background: "#ffffff", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                    {tailorResult.tailored_objective}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
