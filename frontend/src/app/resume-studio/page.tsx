"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  Upload,
  Copy,
  Trash2,
  Edit3,
  Download,
  Eye,
  CheckCircle,
  Sparkles,
  Layers,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Award,
  RefreshCw,
  Search,
  Filter,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import {
  getResumeTemplates,
  getMyResumes,
  createResume,
  deleteResume,
  duplicateResume,
  importResumeFile,
  downloadResumeDocx,
  printResumePdf,
} from "@/lib/api";
import type { ResumeListItem, ResumeTemplate } from "@/lib/types";

export default function ResumeStudioDashboard() {
  const { user, token, ready } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"resumes" | "templates">("resumes");
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [templates, setTemplates] = useState<ResumeTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Template preview modal
  const [previewTemplate, setPreviewTemplate] = useState<ResumeTemplate | null>(null);

  // Create new resume modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newResumeName, setNewResumeName] = useState<string>("My ATS Technical Resume");
  const [newResumeRole, setNewResumeRole] = useState<string>("Software Engineer");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("ats-technical-pro");

  // Import resume modal
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResumeName, setImportResumeName] = useState<string>("");
  const [importTemplateId, setImportTemplateId] = useState<string>("ats-technical-pro");
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Template category filter
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<string>("all");

  useEffect(() => {
    loadData();
  }, [token]);

  async function loadData() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const tmpls = await getResumeTemplates();
      setTemplates(tmpls);

      if (token) {
        const myDocs = await getMyResumes(token);
        setResumes(myDocs);
        if (myDocs.length === 0) {
          setActiveTab("templates");
        }
      } else {
        setActiveTab("templates");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load resume studio data");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateNew() {
    if (!newResumeName.trim()) return;
    setActionLoading("creating");
    setErrorMsg(null);
    try {
      const created = await createResume(
        {
          resume_name: newResumeName.trim(),
          template_id: selectedTemplateId,
          target_role: newResumeRole.trim() || undefined,
        },
        token || ""
      );
      setShowCreateModal(false);
      router.push(`/resume-studio/${created.id}/edit`);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create resume");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleImport() {
    if (!importFile) return;
    setIsImporting(true);
    setErrorMsg(null);
    try {
      const doc = await importResumeFile(
        importFile,
        importResumeName.trim() || undefined,
        importTemplateId,
        token || undefined
      );
      setShowImportModal(false);
      setSuccessMsg("Resume parsed and imported successfully!");
      router.push(`/resume-studio/${doc.id}/edit`);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to import resume. Please try another file.");
    } finally {
      setIsImporting(false);
    }
  }

  async function handleDuplicate(resumeId: number) {
    if (!token) return;
    setActionLoading(`dup-${resumeId}`);
    try {
      const copy = await duplicateResume(resumeId, token);
      setSuccessMsg(`Duplicated as "${copy.resume_name}"`);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to duplicate resume");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(resumeId: number, name: string) {
    if (!token) return;
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    setActionLoading(`del-${resumeId}`);
    try {
      await deleteResume(resumeId, token);
      setSuccessMsg(`Deleted "${name}"`);
      setResumes((prev) => prev.filter((r) => r.id !== resumeId));
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to delete resume");
    } finally {
      setActionLoading(null);
    }
  }

  function handleSelectTemplateForNew(tId: string) {
    setSelectedTemplateId(tId);
    setShowCreateModal(true);
  }

  const filteredTemplates = templates.filter((t) => {
    if (templateCategoryFilter === "all") return true;
    return t.category.toLowerCase().includes(templateCategoryFilter.toLowerCase());
  });

  return (
    <div className="container" style={{ paddingTop: "2rem", paddingBottom: "4rem" }}>
      {/* Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "#ffffff",
          borderRadius: "16px",
          padding: "2.5rem 2rem",
          marginBottom: "2rem",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1.5rem" }}>
          <div style={{ maxWidth: "700px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(37, 99, 235, 0.25)", color: "#93c5fd", padding: "4px 12px", borderRadius: "999px", fontSize: "0.85rem", fontWeight: 600, marginBottom: "1rem" }}>
              <Sparkles size={15} />
              AI Resume Studio 2.0
            </div>
            <h1 style={{ fontSize: "2.25rem", fontWeight: 800, margin: "0 0 0.75rem 0", letterSpacing: "-0.02em" }}>
              Craft Clean, ATS-Optimized Resumes
            </h1>
            <p style={{ color: "#cbd5e1", fontSize: "1.05rem", lineHeight: 1.6, margin: 0 }}>
              Choose from 10 industry-tailored single-page templates or import your existing PDF/Word file. Polish bullets with AI, ensure 100% ATS readability, and export to PDF and DOCX.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              onClick={() => setShowCreateModal(true)}
              className="button button-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "0.75rem 1.25rem",
                fontSize: "0.95rem",
                fontWeight: 600,
                background: "#2563eb",
                borderColor: "#2563eb",
              }}
            >
              <Plus size={18} />
              Create Resume
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="button button-secondary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "0.75rem 1.25rem",
                fontSize: "0.95rem",
                fontWeight: 600,
                background: "rgba(255, 255, 255, 0.1)",
                color: "#ffffff",
                borderColor: "rgba(255, 255, 255, 0.2)",
              }}
            >
              <Upload size={18} />
              Import PDF / DOCX
            </button>
          </div>
        </div>

        {/* Feature badges bar */}
        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            flexWrap: "wrap",
            marginTop: "2rem",
            paddingTop: "1.5rem",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            fontSize: "0.85rem",
            color: "#94a3b8",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <ShieldCheck size={16} color="#38bdf8" />
            <span>Strict Single-Page ATS Margins</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <CheckCircle size={16} color="#4ade80" />
            <span>Native Word (.docx) &amp; Print-Ready PDF</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Sparkles size={16} color="#fbbf24" />
            <span>Non-Hallucinated AI Bullet Polishing</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Award size={16} color="#c084fc" />
            <span>Built-in Real ATS Score Engine</span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div style={{ padding: "1rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#991b1b", marginBottom: "1.5rem" }}>
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div style={{ padding: "1rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", color: "#166534", marginBottom: "1.5rem" }}>
          {successMsg}
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #e2e8f0", marginBottom: "2rem" }}>
        <div style={{ display: "flex", gap: "1rem" }}>
          <button
            onClick={() => setActiveTab("resumes")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "0.75rem 1rem",
              background: "none",
              border: "none",
              borderBottom: activeTab === "resumes" ? "3px solid #2563eb" : "3px solid transparent",
              fontWeight: activeTab === "resumes" ? 700 : 500,
              color: activeTab === "resumes" ? "#2563eb" : "#64748b",
              cursor: "pointer",
              fontSize: "1rem",
              marginBottom: "-2px",
            }}
          >
            <FileText size={18} />
            My Resumes ({resumes.length})
          </button>
          <button
            onClick={() => setActiveTab("templates")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "0.75rem 1rem",
              background: "none",
              border: "none",
              borderBottom: activeTab === "templates" ? "3px solid #2563eb" : "3px solid transparent",
              fontWeight: activeTab === "templates" ? 700 : 500,
              color: activeTab === "templates" ? "#2563eb" : "#64748b",
              cursor: "pointer",
              fontSize: "1rem",
              marginBottom: "-2px",
            }}
          >
            <Layers size={18} />
            Template Catalog ({templates.length})
          </button>
        </div>

        {activeTab === "templates" && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 500 }}>Category:</span>
            <select
              value={templateCategoryFilter}
              onChange={(e) => setTemplateCategoryFilter(e.target.value)}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "0.85rem",
                color: "#1e293b",
                background: "#ffffff",
              }}
            >
              <option value="all">All Templates (10)</option>
              <option value="ats">ATS Standard</option>
              <option value="engineering">Engineering &amp; Tech</option>
              <option value="early">Early Career &amp; Freshers</option>
              <option value="custom">Custom Templates</option>
            </select>
          </div>
        )}
      </div>

      {/* TAB 1: MY RESUMES */}
      {activeTab === "resumes" && (
        <div>
          {loading ? (
            <div style={{ textAlign: "center", padding: "4rem 0", color: "#64748b" }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: "0 auto 1rem auto" }} />
              <p>Loading your resumes...</p>
            </div>
          ) : resumes.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "4rem 2rem",
                background: "#f8fafc",
                borderRadius: "12px",
                border: "2px dashed #cbd5e1",
              }}
            >
              <div
                style={{
                  width: "60px",
                  height: "60px",
                  borderRadius: "50%",
                  background: "#e0f2fe",
                  color: "#0284c7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 1.25rem auto",
                }}
              >
                <FileText size={30} />
              </div>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "#1e293b" }}>
                No Resumes Created Yet
              </h3>
              <p style={{ color: "#64748b", maxWidth: "480px", margin: "0 auto 1.5rem auto", fontSize: "0.95rem" }}>
                Start by creating a fresh ATS-formatted resume or import your existing PDF/Word file to edit and customize.
              </p>
              <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
                <button onClick={() => setShowCreateModal(true)} className="button button-primary">
                  <Plus size={16} /> Create First Resume
                </button>
                <button onClick={() => setShowImportModal(true)} className="button button-secondary">
                  <Upload size={16} /> Import File
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.5rem" }}>
              {resumes.map((r) => (
                <div
                  key={r.id}
                  style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    padding: "1.5rem",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: "4px",
                          background: "#eff6ff",
                          color: "#2563eb",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {r.template_name}
                      </span>
                      {r.ats_score > 0 && (
                        <span
                          style={{
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: "999px",
                            background: r.ats_score >= 80 ? "#ecfdf5" : r.ats_score >= 65 ? "#fffbeb" : "#fef2f2",
                            color: r.ats_score >= 80 ? "#059669" : r.ats_score >= 65 ? "#d97706" : "#dc2626",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <Award size={12} />
                          ATS Score: {r.ats_score}/100
                        </span>
                      )}
                    </div>

                    <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#1e293b", margin: "0 0 0.25rem 0" }}>
                      {r.resume_name}
                    </h3>
                    <p style={{ fontSize: "0.88rem", color: "#64748b", margin: "0 0 1rem 0" }}>
                      Target Role: <strong>{r.target_role || "General"}</strong>
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: 0 }}>
                      Updated: {new Date(r.updated_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div style={{ borderTop: "1px solid #f1f5f9", marginTop: "1.25rem", paddingTop: "1rem" }}>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <Link
                        href={`/resume-studio/${r.id}/edit`}
                        className="button button-primary"
                        style={{
                          flex: 1,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          padding: "0.5rem",
                          fontSize: "0.88rem",
                        }}
                      >
                        <Edit3 size={15} /> Edit Resume
                      </Link>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.25rem" }}>
                      <button
                        onClick={() => printResumePdf(r.id, token || "")}
                        title="Download / Print PDF"
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #cbd5e1",
                          borderRadius: "6px",
                          padding: "6px 10px",
                          fontSize: "0.78rem",
                          color: "#334155",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Download size={13} /> PDF
                      </button>
                      <button
                        onClick={() => downloadResumeDocx(r.id, r.resume_name, token || "")}
                        title="Download Word (.docx)"
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #cbd5e1",
                          borderRadius: "6px",
                          padding: "6px 10px",
                          fontSize: "0.78rem",
                          color: "#334155",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Download size={13} /> Word
                      </button>
                      <button
                        onClick={() => handleDuplicate(r.id)}
                        disabled={actionLoading === `dup-${r.id}`}
                        title="Duplicate Resume"
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #cbd5e1",
                          borderRadius: "6px",
                          padding: "6px 10px",
                          fontSize: "0.78rem",
                          color: "#334155",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Copy size={13} /> Copy
                      </button>
                      <button
                        onClick={() => handleDelete(r.id, r.resume_name)}
                        disabled={actionLoading === `del-${r.id}`}
                        title="Delete Resume"
                        style={{
                          background: "#fff1f2",
                          border: "1px solid #fecdd3",
                          borderRadius: "6px",
                          padding: "6px 10px",
                          fontSize: "0.78rem",
                          color: "#e11d48",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TEMPLATE CATALOG */}
      {activeTab === "templates" && (
        <div>
          <div style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#1e293b", margin: "0 0 0.5rem 0" }}>
              Explore ATS-Optimized Templates
            </h2>
            <p style={{ color: "#64748b", margin: 0, fontSize: "0.95rem" }}>
              Each template is engineered with standard margins, deterministic section hierarchy, and clean typography tested against real Applicant Tracking Systems.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "2rem" }}>
            {filteredTemplates.map((t) => (
              <div
                key={t.id}
                style={{
                  background: "#ffffff",
                  borderRadius: "14px",
                  border: "1px solid #e2e8f0",
                  overflow: "hidden",
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                {/* Visual miniature preview */}
                <div
                  style={{
                    height: "230px",
                    background: "#f1f5f9",
                    position: "relative",
                    overflow: "hidden",
                    borderBottom: "1px solid #e2e8f0",
                    cursor: "pointer",
                  }}
                  onClick={() => setPreviewTemplate(t)}
                >
                  <iframe
                    srcDoc={t.preview_html}
                    title={t.template_name}
                    style={{
                      width: "800px",
                      height: "1100px",
                      transform: "scale(0.32)",
                      transformOrigin: "top left",
                      border: "none",
                      pointerEvents: "none",
                      background: "#ffffff",
                      margin: "8px auto 0 8px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: "10px",
                      right: "10px",
                      background: "rgba(15, 23, 42, 0.75)",
                      color: "#ffffff",
                      borderRadius: "6px",
                      padding: "4px 8px",
                      fontSize: "0.75rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Eye size={13} /> Click to Preview
                  </div>
                </div>

                {/* Card Content */}
                <div style={{ padding: "1.25rem", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: "999px",
                          background: "#f0fdf4",
                          color: "#166534",
                          border: "1px solid #bbf7d0",
                        }}
                      >
                        {t.badge}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 500 }}>
                        {t.font_family} • {t.is_single_column ? "Single Column" : "Two Column"}
                      </span>
                    </div>

                    <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#1e293b", margin: "0 0 0.5rem 0" }}>
                      {t.template_name}
                    </h3>
                    <p style={{ fontSize: "0.86rem", color: "#475569", lineHeight: 1.5, margin: "0 0 1.25rem 0" }}>
                      {t.description}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <button
                      onClick={() => handleSelectTemplateForNew(t.id)}
                      className="button button-primary"
                      style={{
                        flex: 1,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        padding: "0.55rem",
                        fontSize: "0.9rem",
                      }}
                    >
                      <Plus size={15} /> Use Template
                    </button>
                    <button
                      onClick={() => setPreviewTemplate(t)}
                      className="button button-secondary"
                      style={{
                        padding: "0.55rem 0.85rem",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Eye size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: CREATE NEW RESUME */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              maxWidth: "520px",
              width: "100%",
              padding: "2rem",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
            }}
          >
            <h2 style={{ fontSize: "1.35rem", fontWeight: 800, color: "#0f172a", margin: "0 0 0.5rem 0" }}>
              Create New Resume
            </h2>
            <p style={{ fontSize: "0.88rem", color: "#64748b", margin: "0 0 1.5rem 0" }}>
              Choose a title and select the target job role to customize section emphasis.
            </p>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#334155", marginBottom: "0.4rem" }}>
                Resume Title
              </label>
              <input
                type="text"
                value={newResumeName}
                onChange={(e) => setNewResumeName(e.target.value)}
                placeholder="e.g. Software Testing Engineer Resume"
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.95rem",
                }}
              />
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#334155", marginBottom: "0.4rem" }}>
                Target Job Role
              </label>
              <input
                type="text"
                value={newResumeRole}
                onChange={(e) => setNewResumeRole(e.target.value)}
                placeholder="e.g. Full-Stack Developer, API Automation Tester, Data Analyst"
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.95rem",
                }}
              />
            </div>

            <div style={{ marginBottom: "1.75rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#334155", marginBottom: "0.4rem" }}>
                Selected Template
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.95rem",
                  background: "#ffffff",
                }}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.template_name} ({t.badge})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                onClick={() => setShowCreateModal(false)}
                className="button button-secondary"
                disabled={actionLoading === "creating"}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNew}
                className="button button-primary"
                disabled={actionLoading === "creating" || !newResumeName.trim()}
              >
                {actionLoading === "creating" ? "Creating..." : "Create & Start Editing"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: IMPORT EXISTING RESUME */}
      {showImportModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              maxWidth: "540px",
              width: "100%",
              padding: "2rem",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
            }}
          >
            <h2 style={{ fontSize: "1.35rem", fontWeight: 800, color: "#0f172a", margin: "0 0 0.5rem 0" }}>
              Import Existing Resume
            </h2>
            <p style={{ fontSize: "0.88rem", color: "#64748b", margin: "0 0 1.5rem 0" }}>
              Upload your PDF or DOCX file. Our engine extracts your contact information, career objective, categorized skills, education, projects, internships, and certifications into structured fields.
            </p>

            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: "2px dashed #94a3b8",
                borderRadius: "12px",
                padding: "2rem",
                textAlign: "center",
                background: importFile ? "#f0fdf4" : "#f8fafc",
                borderColor: importFile ? "#4ade80" : "#94a3b8",
                cursor: "pointer",
                marginBottom: "1.25rem",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setImportFile(f);
                    if (!importResumeName) setImportResumeName(f.name.replace(/\.[^/.]+$/, ""));
                  }
                }}
              />
              <Upload size={32} color={importFile ? "#16a34a" : "#64748b"} style={{ margin: "0 auto 0.75rem auto" }} />
              {importFile ? (
                <div>
                  <p style={{ fontWeight: 700, color: "#166534", margin: "0 0 0.25rem 0" }}>{importFile.name}</p>
                  <p style={{ fontSize: "0.8rem", color: "#15803d", margin: 0 }}>
                    {(importFile.size / 1024).toFixed(1)} KB • Click to change file
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ fontWeight: 600, color: "#1e293b", margin: "0 0 0.25rem 0" }}>
                    Click to browse or drop your resume here
                  </p>
                  <p style={{ fontSize: "0.8rem", color: "#64748b", margin: 0 }}>Supports PDF &amp; DOCX files up to 10MB</p>
                </div>
              )}
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#334155", marginBottom: "0.4rem" }}>
                Resume Title
              </label>
              <input
                type="text"
                value={importResumeName}
                onChange={(e) => setImportResumeName(e.target.value)}
                placeholder="e.g. Imported Profile Resume"
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.95rem",
                }}
              />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#334155", marginBottom: "0.4rem" }}>
                Target Template
              </label>
              <select
                value={importTemplateId}
                onChange={(e) => setImportTemplateId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.95rem",
                  background: "#ffffff",
                }}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.template_name} ({t.badge})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button onClick={() => setShowImportModal(false)} className="button button-secondary" disabled={isImporting}>
                Cancel
              </button>
              <button onClick={handleImport} className="button button-primary" disabled={isImporting || !importFile}>
                {isImporting ? "Parsing & Importing..." : "Extract & Import"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: FULL TEMPLATE PREVIEW */}
      {previewTemplate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.75)",
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
              maxWidth: "880px",
              width: "100%",
              height: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "1rem 1.5rem",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#f8fafc",
              }}
            >
              <div>
                <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>
                  {previewTemplate.template_name}
                </h3>
                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  {previewTemplate.category} • {previewTemplate.badge}
                </span>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <button
                  onClick={() => {
                    const tid = previewTemplate.id;
                    setPreviewTemplate(null);
                    handleSelectTemplateForNew(tid);
                  }}
                  className="button button-primary"
                  style={{ padding: "0.5rem 1rem", fontSize: "0.88rem" }}
                >
                  <Plus size={15} /> Use This Template
                </button>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="button button-secondary"
                  style={{ padding: "0.5rem 0.75rem", fontSize: "0.88rem" }}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Modal Body iframe */}
            <div style={{ flex: 1, background: "#64748b", overflow: "auto", display: "flex", justifyContent: "center", padding: "1.5rem" }}>
              <iframe
                srcDoc={previewTemplate.preview_html}
                title={previewTemplate.template_name}
                style={{
                  width: "100%",
                  maxWidth: "800px",
                  height: "1050px",
                  background: "#ffffff",
                  border: "none",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
                  borderRadius: "4px",
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
