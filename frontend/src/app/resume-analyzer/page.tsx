"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCheck,
  FileCode,
  FileText,
  Gauge,
  Hash,
  HelpCircle,
  Info,
  Layers,
  Lightbulb,
  ListFilter,
  Loader2,
  Printer,
  Quote,
  RefreshCw,
  Scale,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  UploadCloud,
  Wand2,
  X,
  Zap,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import {
  analyzeResume,
  autoBoostResume,
  getJobDetails,
  getLatestResumeAnalysis,
  improveResumeContent,
  getResumeTemplates,
  createResume,
  downloadResumeDocx,
} from "@/lib/api";
import type {
  BulletEvaluation,
  BulletImprovement,
  DetectedIssue,
  PrioritySuggestion,
  RelatedSkill,
  ResumeAnalysis,
  ResumeAutoBoostResponse,
  ResumeImprovementResponse,
  ScoreBreakdownItem,
  WordAnnotation,
  WordMetrics,
  ResumeTemplate,
} from "@/lib/types";

type AnalysisMode = "general" | "job_description" | "job_id";
type InputMethod = "file" | "text";
type ResultTab = "inspector" | "bullets" | "vocabulary" | "breakdown" | "keywords" | "assistant" | "preview";

export default function ResumeAnalyzerPage() {
  const { user, token, ready } = useAuth();

  // Mode & Input Selection
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("general");
  const [inputMethod, setInputMethod] = useState<InputMethod>("file");

  // Inputs
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState<string>("");
  const [useSaved, setUseSaved] = useState<boolean>(false);
  const [targetRole, setTargetRole] = useState<string>("");
  const [jobDescriptionText, setJobDescriptionText] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");

  // States
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobDetailsTitle, setJobDetailsTitle] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedBulletId, setCopiedBulletId] = useState<number | null>(null);
  const [showRawText, setShowRawText] = useState<boolean>(false);

  // Tab State
  const [activeTab, setActiveTab] = useState<ResultTab>("inspector");
  const [activeBreakdownTab, setActiveBreakdownTab] = useState<"general" | "job">("general");
  const [previewViewMode, setPreviewViewMode] = useState<"visual" | "text">("visual");

  // Word-by-Word Document Inspector State
  const [annotationFilter, setAnnotationFilter] = useState<string>("all");
  const [selectedAnnotation, setSelectedAnnotation] = useState<WordAnnotation | null>(null);
  const [copiedReplacement, setCopiedReplacement] = useState<string | null>(null);

  // Bullet Line-by-Line State
  const [bulletFilter, setBulletFilter] = useState<string>("all");

  // AI Assistant In-Page State
  const [assistantMode, setAssistantMode] = useState<"summary" | "project" | "bullet" | "skills">("bullet");
  const [assistantInput, setAssistantInput] = useState<string>("");
  const [assistantLoading, setAssistantLoading] = useState<boolean>(false);
  const [assistantResult, setAssistantResult] = useState<ResumeImprovementResponse | null>(null);
  const [assistantCopied, setAssistantCopied] = useState<boolean>(false);

  // 1-Click AI Auto-Enhance & ATS Booster State
  const router = useRouter();
  const [boosting, setBoosting] = useState<boolean>(false);
  const [boostResult, setBoostResult] = useState<ResumeAutoBoostResponse | null>(null);
  const [copiedBoostedText, setCopiedBoostedText] = useState<boolean>(false);
  const [showEnhancedView, setShowEnhancedView] = useState<boolean>(false);
  const [boostTemplateId, setBoostTemplateId] = useState<string>("ats-technical-pro");
  const [templatesList, setTemplatesList] = useState<ResumeTemplate[]>([]);
  const [openingStudio, setOpeningStudio] = useState<boolean>(false);
  const [downloadingDocx, setDownloadingDocx] = useState<boolean>(false);

  // User Inspection & Correction of Extracted Information
  const [showInspectModal, setShowInspectModal] = useState<boolean>(false);
  const [inspectSummary, setInspectSummary] = useState<string>("");
  const [inspectSkills, setInspectSkills] = useState<string>("");
  const [inspectProjects, setInspectProjects] = useState<string>("");
  const [inspectExperience, setInspectExperience] = useState<string>("");
  const [inspectEducation, setInspectEducation] = useState<string>("");
  const [inspectName, setInspectName] = useState<string>("");
  const [inspectContact, setInspectContact] = useState<string>("");

  // Side-by-side comparison view
  const [showSideBySide, setShowSideBySide] = useState<boolean>(false);

  // Load available templates for resume generation
  useEffect(() => {
    getResumeTemplates()
      .then((data) => {
        if (data && data.length > 0) setTemplatesList(data);
      })
      .catch(() => {});
  }, []);

  // Sync useSaved when auth loads
  useEffect(() => {
    if (user?.has_saved_resume) {
      setUseSaved(true);
    } else {
      setUseSaved(false);
    }
  }, [user?.has_saved_resume]);

  // Load existing analysis if user is authenticated
  useEffect(() => {
    if (ready && token) {
      getLatestResumeAnalysis(token)
        .then((data) => {
          if (data && data.ats_score > 0) {
            setAnalysis(data);
            if (data.job_match_score) {
              setActiveBreakdownTab("job");
            }
          }
        })
        .catch(() => {});
    }
  }, [ready, token]);

  async function handleAnalyze(e?: React.FormEvent | React.MouseEvent) {
    if (e) e.preventDefault();
    setError(null);

    const formData = new FormData();

    // Resume input selection (file vs pasted text vs saved resume)
    if (inputMethod === "text") {
      if (!pastedText.trim() || pastedText.trim().split(/\s+/).length < 20) {
        setError("Please enter or paste at least 20 words of resume text for accurate analysis.");
        return;
      }
      formData.append("resume_text", pastedText.trim());
    } else {
      if (file) {
        formData.append("resume", file);
        formData.append("use_saved_resume", "false");
      } else if (useSaved && user?.has_saved_resume) {
        formData.append("use_saved_resume", "true");
      } else if (user?.has_saved_resume && !file) {
        formData.append("use_saved_resume", "true");
      } else {
        setError("Please select a PDF or DOCX resume file, or switch to 'Paste Resume Text'.");
        return;
      }
    }

    // Mode handling
    if (analysisMode === "job_description") {
      if (!jobDescriptionText.trim()) {
        setError("Please paste the job description text to benchmark against.");
        return;
      }
      formData.append("job_description_text", jobDescriptionText.trim());
      if (targetRole.trim()) {
        formData.append("role_target", targetRole.trim());
      }
    } else if (analysisMode === "job_id") {
      if (!jobId.trim()) {
        setError("Please enter a valid Job ID from the job catalog.");
        return;
      }
      formData.append("job_id", jobId.trim());
    } else {
      // General Mode
      if (targetRole.trim()) {
        formData.append("role_target", targetRole.trim());
      }
    }

    setAnalyzing(true);
    setSelectedAnnotation(null);
    try {
      const result = await analyzeResume(formData, token || null);
      setAnalysis(result);

      if (analysisMode === "job_id" && jobId.trim()) {
        getJobDetails(Number(jobId.trim()))
          .then((j) => setJobDetailsTitle(`${j.title} at ${j.company}`))
          .catch(() => setJobDetailsTitle(`Job #${jobId.trim()}`));
        setActiveBreakdownTab("job");
      } else if (analysisMode === "job_description") {
        setJobDetailsTitle(targetRole.trim() || "Target Job Description");
        setActiveBreakdownTab("job");
      } else {
        setJobDetailsTitle(null);
        setActiveBreakdownTab("general");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to analyze resume. Please try again.";
      setError(msg);
    } finally {
      setAnalyzing(false);
    }
  }

  function handleFileSelect(selectedFile: File | undefined) {
    if (!selectedFile) return;
    const ext = selectedFile.name.toLowerCase();
    if (!ext.endsWith(".pdf") && !ext.endsWith(".docx")) {
      setError("Invalid file type. Please upload a PDF or DOCX file.");
      return;
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      setError("File exceeds 5MB size limit. Please upload a smaller file.");
      return;
    }

    setError(null);
    setFile(selectedFile);
    setUseSaved(false);
  }

  async function handleRunAssistant() {
    if (!assistantInput.trim()) return;
    setAssistantLoading(true);
    setAssistantResult(null);
    try {
      const res = await improveResumeContent({
        mode: assistantMode,
        content: assistantInput.trim(),
        target_role: analysis?.role_target || targetRole || "Software Developer",
      }, token || null);
      setAssistantResult(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setAssistantLoading(false);
    }
  }

  function copyText(txt: string, callback: () => void) {
    navigator.clipboard.writeText(txt);
    callback();
  }

  async function handleAutoBoost(customTemplateId?: string) {
    if (!analysis?.raw_text) return;
    const tid = typeof customTemplateId === "string" ? customTemplateId : boostTemplateId;
    setBoosting(true);
    setError(null);
    try {
      const res = await autoBoostResume({
        resume_text: analysis.raw_text,
        target_role: analysis.role_target || targetRole || "Software Engineer",
        job_id: analysis.job_id || (jobId ? Number(jobId) : undefined),
        template_id: tid,
      }, token || null);
      setBoostResult(res);
      setShowEnhancedView(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to auto-enhance resume.";
      setError(msg);
    } finally {
      setBoosting(false);
    }
  }

  async function handleSwitchBoostTemplate(newTemplateId: string) {
    setBoostTemplateId(newTemplateId);
    await handleAutoBoost(newTemplateId);
  }

  function buildStudioPayload(sd: any) {
    if (!sd) return undefined;
    const ci = analysis?.extracted_sections?.contact_info || {};
    return {
      personal_info: {
        full_name: sd.candidate_name || ci.candidate_name || "Candidate",
        headline: sd.target_role || analysis?.role_target || targetRole || "Software Engineer",
        email: ci.email || "",
        phone: ci.phone || "",
        location: ci.location || "",
        linkedin_url: ci.linkedin || "",
        github_url: ci.github || "",
      },
      career_objective: sd.summary || "",
      technical_skills: (sd.skills || []).map(([cat, vals]: [string, string]) => ({
        category: cat,
        skills: vals.split(",").map((s: string) => s.trim()).filter(Boolean),
      })),
      projects: (sd.projects || []).map((p: any) => ({
        title: p.title || "",
        tech_stack: p.tech_stack || "",
        github_url: p.link || "",
        bullets: p.bullets || [],
      })),
      internships: (sd.experience || []).map((e: any) => ({
        role: e.role || e.title || "",
        organization: e.company || "",
        duration: e.duration || e.dates || "",
        location: e.location || "",
        bullets: e.bullets || [],
      })),
      education: (sd.education || []).map((ed: any) => ({
        degree: ed.degree || "",
        institution: ed.institution || "",
        graduation_date: ed.duration || ed.dates || "",
        score: ed.score || "",
      })),
    };
  }

  function handleSaveCorrections() {
    if (!analysis) return;
    const reconstructedText = [
      inspectName.trim(),
      inspectContact.trim(),
      "",
      "CAREER OBJECTIVE",
      inspectSummary.trim(),
      "",
      "TECHNICAL SKILLS",
      inspectSkills.trim(),
      "",
      "PROJECTS",
      inspectProjects.trim(),
      "",
      "EXPERIENCE",
      inspectExperience.trim(),
      "",
      "EDUCATION",
      inspectEducation.trim(),
    ].filter((p, i) => i === 2 || p.length > 0).join("\n");

    setPastedText(reconstructedText);
    setInputMethod("text");
    setShowInspectModal(false);

    const formData = new FormData();
    formData.append("resume_text", reconstructedText);
    if (targetRole.trim()) formData.append("role_target", targetRole.trim());
    if (analysisMode === "job_description" && jobDescriptionText.trim()) {
      formData.append("job_description_text", jobDescriptionText.trim());
    } else if (analysisMode === "job_id" && jobId.trim()) {
      formData.append("job_id", jobId.trim());
    }

    setAnalyzing(true);
    analyzeResume(formData, token || null)
      .then((res) => setAnalysis(res))
      .catch((err: any) => setError(err.message || "Failed to analyze corrected text"))
      .finally(() => setAnalyzing(false));
  }

  async function handleOpenInResumeStudio() {
    if (!boostResult) return;
    setOpeningStudio(true);
    try {
      const doc = await createResume(
        {
          resume_name: `${analysis?.role_target || "Boosted"} Resume (${boostTemplateId})`,
          template_id: boostTemplateId,
          target_role: analysis?.role_target || targetRole || "Software Engineer",
          resume_data: buildStudioPayload(boostResult.structured_data),
        },
        token || ""
      );
      router.push(`/resume-studio/${doc.id}/edit`);
    } catch (err) {
      console.error("Failed to create studio resume document", err);
      router.push("/resume-studio");
    } finally {
      setOpeningStudio(false);
    }
  }

  async function handleDownloadBoostedDocx() {
    if (!boostResult) return;
    setDownloadingDocx(true);
    try {
      const doc = await createResume(
        {
          resume_name: `${analysis?.role_target || "Boosted"}_Resume`,
          template_id: boostTemplateId,
          target_role: analysis?.role_target || targetRole || "Software Engineer",
          resume_data: buildStudioPayload(boostResult.structured_data),
        },
        token || ""
      );
      await downloadResumeDocx(doc.id, `${doc.resume_name}.docx`, token || "");
    } catch (err) {
      console.error("Failed to download DOCX", err);
    } finally {
      setDownloadingDocx(false);
    }
  }

  function handleApplyBoostedAnalysis() {
    if (boostResult?.new_analysis) {
      setAnalysis(boostResult.new_analysis);
      setBoostResult(null);
      setShowEnhancedView(false);
    }
  }

  function downloadTextFile(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function openPrintableHtml(content: string) {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(content);
      printWindow.document.close();
    }
  }

  // Count annotations by type
  const annotationCounts = {
    all: analysis?.word_annotations?.length || 0,
    weak_verb: analysis?.word_annotations?.filter((a) => a.type === "weak_verb").length || 0,
    strong_verb: analysis?.word_annotations?.filter((a) => a.type === "strong_verb").length || 0,
    metric: analysis?.word_annotations?.filter((a) => a.type === "metric").length || 0,
    tech_skill: analysis?.word_annotations?.filter((a) => a.type === "tech_skill").length || 0,
    buzzword: analysis?.word_annotations?.filter((a) => a.type === "buzzword").length || 0,
    pronoun: analysis?.word_annotations?.filter((a) => a.type === "pronoun").length || 0,
  };

  // Helper to render annotated text
  function renderDocumentText(text: string, annotations: WordAnnotation[], filter: string) {
    if (!text) return null;
    const activeAnnotations = filter === "all" ? annotations : annotations.filter((a) => a.type === filter);

    const segments: Array<{ text: string; annotation?: WordAnnotation }> = [];
    let lastIdx = 0;

    for (const ann of activeAnnotations) {
      if (ann.start > lastIdx) {
        segments.push({ text: text.slice(lastIdx, ann.start) });
      }
      segments.push({ text: text.slice(ann.start, ann.end), annotation: ann });
      lastIdx = ann.end;
    }
    if (lastIdx < text.length) {
      segments.push({ text: text.slice(lastIdx) });
    }

    return segments.map((seg, idx) => {
      if (!seg.annotation) {
        return <span key={idx}>{seg.text}</span>;
      }
      const ann = seg.annotation;
      let styleClass = "bg-blue-500/20 text-blue-300 border-blue-500/30";
      if (ann.type === "weak_verb") {
        styleClass = "bg-rose-500/20 text-rose-300 border-rose-500/50 hover:bg-rose-500/30 cursor-pointer";
      } else if (ann.type === "strong_verb") {
        styleClass = "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30 cursor-pointer";
      } else if (ann.type === "metric") {
        styleClass = "bg-teal-500/20 text-teal-300 border-teal-500/50 hover:bg-teal-500/30 font-semibold cursor-pointer";
      } else if (ann.type === "buzzword") {
        styleClass = "bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30 cursor-pointer";
      } else if (ann.type === "pronoun") {
        styleClass = "bg-purple-500/20 text-purple-300 border-purple-500/50 hover:bg-purple-500/30 cursor-pointer";
      } else if (ann.type === "tech_skill") {
        styleClass = "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 hover:bg-cyan-500/30 cursor-pointer";
      }

      const isSelected = selectedAnnotation?.start === ann.start && selectedAnnotation?.end === ann.end;

      return (
        <mark
          key={idx}
          onClick={() => setSelectedAnnotation(ann)}
          className={`inline-block px-1.5 py-0.5 mx-0.5 rounded border text-xs font-mono transition-all duration-150 ${styleClass} ${
            isSelected ? "ring-2 ring-white shadow-lg scale-105" : ""
          }`}
          title={`${ann.label}: ${ann.text}`}
        >
          {seg.text}
        </mark>
      );
    });
  }

  // Filter bullets for line-by-line tab
  const filteredBullets = (analysis?.bullet_evaluations || []).filter((b) => {
    if (bulletFilter === "all") return true;
    return b.impact_rating === bulletFilter;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Top Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl text-white shadow-lg shadow-blue-500/20">
                <Gauge className="w-7 h-7" />
              </span>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  AI ATS Resume Checker & Word-by-Word Inspector
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  Comprehensive ATS parseability, word-level vocabulary diagnostics, bullet scoring, and recruiter feedback.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {analysis && (
              <a
                href="/api/v1/ai/resume/report/html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-200 bg-slate-900 border border-slate-700 hover:border-slate-500 rounded-lg shadow hover:bg-slate-800 transition-colors"
              >
                <Printer className="w-4 h-4 text-blue-400" />
                Print / PDF Report
              </a>
            )}
            {analysis && (
              <button
                onClick={() => {
                  setAnalysis(null);
                  setFile(null);
                  setPastedText("");
                  setSelectedAnnotation(null);
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 bg-slate-900/50 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                New Scan
              </button>
            )}
          </div>
        </div>

        {/* 1. Input Controls Card */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-6">
          {/* Analysis Mode Selector Tabs */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              Select Analysis Mode
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setAnalysisMode("general")}
                className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                  analysisMode === "general"
                    ? "bg-blue-600/15 border-blue-500 text-white ring-1 ring-blue-500 shadow-lg shadow-blue-500/10"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <FileCheck className={`w-5 h-5 mt-0.5 ${analysisMode === "general" ? "text-blue-400" : "text-slate-500"}`} />
                <div>
                  <span className="font-semibold text-sm block">Mode 1: General ATS Analysis</span>
                  <span className="text-xs text-slate-400">Score against 9 ATS pillars without a job description</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAnalysisMode("job_description")}
                className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                  analysisMode === "job_description"
                    ? "bg-blue-600/15 border-blue-500 text-white ring-1 ring-blue-500 shadow-lg shadow-blue-500/10"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <Target className={`w-5 h-5 mt-0.5 ${analysisMode === "job_description" ? "text-blue-400" : "text-slate-500"}`} />
                <div>
                  <span className="font-semibold text-sm block">Mode 2: Job Description Match</span>
                  <span className="text-xs text-slate-400">Paste job requirements for role-specific compatibility</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAnalysisMode("job_id")}
                className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                  analysisMode === "job_id"
                    ? "bg-blue-600/15 border-blue-500 text-white ring-1 ring-blue-500 shadow-lg shadow-blue-500/10"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <Briefcase className={`w-5 h-5 mt-0.5 ${analysisMode === "job_id" ? "text-blue-400" : "text-slate-500"}`} />
                <div>
                  <span className="font-semibold text-sm block">Mode 3: Platform Job ID Match</span>
                  <span className="text-xs text-slate-400">Evaluate against verified jobs from the database</span>
                </div>
              </button>
            </div>
          </div>

          {/* Input Method Toggle (ToolAdda Parity: File vs Paste Text) */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Resume Input Method
              </label>
              <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setInputMethod("file")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    inputMethod === "file" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  Upload PDF / DOCX
                </button>
                <button
                  type="button"
                  onClick={() => setInputMethod("text")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    inputMethod === "text" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Paste Resume Text (Instant)
                </button>
              </div>
            </div>

            {/* Input Method A: File Upload */}
            {inputMethod === "file" && (
              <div className="space-y-3">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileSelect(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    isDragging
                      ? "border-blue-500 bg-blue-500/10"
                      : file
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : "border-slate-800 hover:border-slate-700 bg-slate-950/40"
                  }`}
                >
                  <input
                    type="file"
                    id="resume-file-input"
                    className="hidden"
                    accept=".pdf,.docx"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelect(e.target.files[0]);
                      }
                    }}
                  />
                  <label htmlFor="resume-file-input" className="cursor-pointer block">
                    <UploadCloud className={`w-10 h-10 mx-auto mb-2.5 ${file ? "text-emerald-400" : "text-slate-500"}`} />
                    {file ? (
                      <div>
                        <span className="text-emerald-400 font-semibold text-sm">{file.name}</span>
                        <p className="text-xs text-slate-500 mt-1">
                          {(file.size / 1024).toFixed(1)} KB — Click or drag to replace
                        </p>
                      </div>
                    ) : (
                      <div>
                        <span className="text-slate-300 font-medium text-sm">
                          Click to browse or drag & drop your resume
                        </span>
                        <p className="text-xs text-slate-500 mt-1">Supports PDF and DOCX files (Up to 5MB)</p>
                      </div>
                    )}
                  </label>
                </div>

                {user?.has_saved_resume && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
                    <input
                      type="checkbox"
                      id="use-saved-checkbox"
                      checked={useSaved}
                      onChange={(e) => {
                        setUseSaved(e.target.checked);
                        if (e.target.checked) setFile(null);
                      }}
                      className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="use-saved-checkbox" className="cursor-pointer">
                      Use my profile resume (<span className="text-slate-300">{user.resume_filename || "saved_resume.pdf"}</span>)
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Input Method B: Pasted Resume Text (ToolAdda Parity) */}
            {inputMethod === "text" && (
              <div className="space-y-2">
                <div className="relative">
                  <textarea
                    rows={8}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste your complete resume text here (Summary, Skills, Experience, Education, Projects)..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono leading-relaxed"
                  />
                  {pastedText && (
                    <button
                      type="button"
                      onClick={() => setPastedText("")}
                      className="absolute top-3 right-3 text-xs text-slate-500 hover:text-slate-300 bg-slate-900 px-2 py-1 rounded border border-slate-800"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                  <span>
                    Word Count:{" "}
                    <strong className="text-slate-300">
                      {pastedText.trim() ? pastedText.trim().split(/\s+/).length : 0}
                    </strong>{" "}
                    words | Characters:{" "}
                    <strong className="text-slate-300">{pastedText.length}</strong>
                  </span>
                  <span>Ideal 1-page length: 450 - 750 words</span>
                </div>
              </div>
            )}
          </div>

          {/* Mode 2: Paste Job Description */}
          {analysisMode === "job_description" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800">
              <div className="md:col-span-1 space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  Target Role Title
                </label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="e.g. Python Backend Developer"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="md:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  Job Description Text <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={4}
                  value={jobDescriptionText}
                  onChange={(e) => setJobDescriptionText(e.target.value)}
                  placeholder="Paste the target job description requirements, responsibilities, and qualifications..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* Mode 3: Job ID from Catalog */}
          {analysisMode === "job_id" && (
            <div className="space-y-1.5 pt-4 border-t border-slate-800">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                Catalog Job ID <span className="text-rose-400">*</span>
              </label>
              <div className="flex gap-3 max-w-md">
                <input
                  type="text"
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  placeholder="Enter Job ID (e.g. 102)"
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 flex-1"
                />
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="flex items-center gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Analyze CTA Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing}
              className="w-full md:w-auto px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Running Comprehensive ATS & Word-by-Word Analysis...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Analyze My Resume Now
                </>
              )}
            </button>
          </div>
        </div>

        {/* 2. Analysis Results Section */}
        {analysis && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Top Gauges: ATS Score & Resume Worded Core Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Main Overall ATS Readiness Dial */}
              <div className="md:col-span-2 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs uppercase font-semibold text-blue-400 tracking-wider">
                      General ATS Readiness Score
                    </span>
                    <h3 className="text-xl font-bold text-white mt-1">Overall Resume Score</h3>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      analysis.ats_score >= 80
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : analysis.ats_score >= 65
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    }`}
                  >
                    {analysis.ats_score >= 80
                      ? "High ATS Readiness"
                      : analysis.ats_score >= 65
                      ? "Moderate ATS Readiness"
                      : "Needs Improvements"}
                  </span>
                </div>

                <div className="flex items-baseline gap-3 my-4">
                  <span className="text-6xl font-black text-white tracking-tight">{analysis.ats_score}</span>
                  <span className="text-xl font-semibold text-slate-500">/ 100</span>
                </div>

                <div className="space-y-2">
                  <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        analysis.ats_score >= 80 ? "bg-emerald-500" : analysis.ats_score >= 65 ? "bg-amber-500" : "bg-rose-500"
                      }`}
                      style={{ width: `${analysis.ats_score}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400">
                    Evaluated across 9 ATS pillars (Parsing, Structure, Formatting, Skills, Projects, Experience, Contact, Grammar, Metrics).
                  </p>
                </div>
              </div>

              {/* Job Match Compatibility Dial (or Mode 2/3 info) */}
              {analysis.job_match_score !== null && analysis.job_match_score !== undefined ? (
                <div className="md:col-span-2 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs uppercase font-semibold text-indigo-400 tracking-wider">
                        Job-Specific Match Score
                      </span>
                      <h3 className="text-xl font-bold text-white mt-1">
                        {analysis.role_target || jobDetailsTitle || "Role Compatibility"}
                      </h3>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        analysis.job_match_score >= 75
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : analysis.job_match_score >= 60
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      {analysis.job_match_score >= 75 ? "Strong Candidate Match" : "Partial Skill Fit"}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-3 my-4">
                    <span className="text-6xl font-black text-indigo-400 tracking-tight">{analysis.job_match_score}%</span>
                    <span className="text-sm text-slate-400">
                      ({analysis.matched_job_skills?.length || 0} skills matched)
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                        style={{ width: `${analysis.job_match_score}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-400">
                      Benchmarked against required skills (25%), keywords (20%), projects (15%), and experience (15%).
                    </p>
                  </div>
                </div>
              ) : (
                <div className="md:col-span-2 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                  <div>
                    <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                      Detected Profile Domain
                    </span>
                    <h3 className="text-xl font-bold text-white mt-1">{analysis.detected_domain || "Software Engineering"}</h3>
                    <p className="text-xs text-slate-400 mt-2">
                      {analysis.extracted_skills?.length || 0} technical skills extracted across {Object.keys(analysis.extracted_sections || {}).length} sections.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                    <span>Reading Time: ~{analysis.reading_time_minutes || 1.2} min</span>
                    <span>Total Words: {analysis.word_count || 0}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Resume Worded 4-Pillar Score Cards */}
            {analysis.resume_worded_scores && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* 1. Impact Score */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Impact</span>
                    <Zap className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-white">{analysis.resume_worded_scores.impact_score}</span>
                    <span className="text-xs text-slate-500">/ 100</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${analysis.resume_worded_scores.impact_score}%` }} />
                  </div>
                  <span className="text-[11px] text-slate-400 block">Metrics & strong verbs</span>
                </div>

                {/* 2. Brevity Score */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Brevity</span>
                    <Clock className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-white">{analysis.resume_worded_scores.brevity_score}</span>
                    <span className="text-xs text-slate-500">/ 100</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-blue-500 h-full rounded-full" style={{ width: `${analysis.resume_worded_scores.brevity_score}%` }} />
                  </div>
                  <span className="text-[11px] text-slate-400 block">Optimal length & conciseness</span>
                </div>

                {/* 3. Style & Language Score */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Style & Language</span>
                    <Quote className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-white">{analysis.resume_worded_scores.style_score}</span>
                    <span className="text-xs text-slate-500">/ 100</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-purple-500 h-full rounded-full" style={{ width: `${analysis.resume_worded_scores.style_score}%` }} />
                  </div>
                  <span className="text-[11px] text-slate-400 block">Active voice, zero buzzwords</span>
                </div>

                {/* 4. ATS Skills Score */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">ATS Skills</span>
                    <Code2 className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-white">{analysis.resume_worded_scores.ats_skills_score}</span>
                    <span className="text-xs text-slate-500">/ 100</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-cyan-500 h-full rounded-full" style={{ width: `${analysis.resume_worded_scores.ats_skills_score}%` }} />
                  </div>
                  <span className="text-[11px] text-slate-400 block">Technical breadth & density</span>
                </div>
              </div>
            )}

            {/* 1-Click AI Auto-Enhance & ATS Score Booster Banner */}
            <div className="bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-purple-900/40 border border-blue-500/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/40 text-xs font-bold uppercase rounded-md tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                      1-Click AI Optimization &amp; Resume Generation
                    </span>
                    <span className="text-xs text-slate-400">Trained on ATS &amp; Recruiter Standards</span>
                  </div>
                  <h3 className="text-xl font-bold text-white">
                    Auto-Boost ATS Score &amp; Generate 1-Page Resume
                  </h3>
                  <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                    Eliminates PDF character kerning spacing fragmentation, upgrades weak verbs to active power verbs (Engineered, Implemented), enriches bullets with Google X-Y-Z metrics, and generates clean downloadable TXT, Word (.docx), and printable PDF formats in your choice of 110 company templates.
                  </p>
                </div>

                <div className="flex-shrink-0 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (analysis) {
                        const sec = analysis.extracted_sections || {};
                        const ci = sec.contact_info || {};
                        setInspectName(ci.candidate_name || "");
                        setInspectContact([ci.email, ci.phone, ci.location, ci.linkedin, ci.github].filter(Boolean).join(" | "));
                        setInspectSummary(sec.summary || "");
                        setInspectSkills(sec.skills || (analysis.extracted_skills || []).join(", "));
                        setInspectProjects(sec.projects || "");
                        setInspectExperience(sec.experience || sec.internships || "");
                        setInspectEducation(sec.education || "");
                        setShowInspectModal(true);
                      }
                    }}
                    className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl border border-slate-700 flex items-center gap-2 transition-all text-xs shadow"
                  >
                    <FileText className="w-4 h-4 text-blue-400" />
                    Inspect Extracted Info
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAutoBoost()}
                    disabled={boosting}
                    className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2.5 transition-all disabled:opacity-50"
                  >
                    {boosting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Enhancing &amp; Generating Resume...
                      </>
                    ) : (
                      <>
                        <Zap className="w-5 h-5 text-yellow-300" />
                        Boost ATS Score Now (1-Click)
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Template Selection Bar */}
              <div className="pt-3 border-t border-blue-500/30 flex flex-wrap items-center justify-between gap-3 bg-blue-950/40 p-3 rounded-xl border border-blue-500/20">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-blue-200 uppercase tracking-wide flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-400" />
                    Target Template:
                  </span>
                  <select
                    value={boostTemplateId}
                    onChange={(e) => handleSwitchBoostTemplate(e.target.value)}
                    className="px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg border border-blue-400/50 outline-none cursor-pointer max-w-[280px]"
                  >
                    <optgroup label="Official ATS Templates">
                      <option value="ats-technical-pro">ATS Professional (Recruiter Calibrated)</option>
                      <option value="modern-minimal">Modern Minimal (100% Safe)</option>
                      <option value="software-engineer">Software Engineer (FAANG Standard)</option>
                      <option value="aiml-engineer">AI/ML Engineer (AI &amp; Deep Learning)</option>
                      <option value="data-analyst">Data Analyst (BI &amp; Analytics)</option>
                      <option value="cloud-devops-engineer">Cloud &amp; DevOps Engineer</option>
                      <option value="fresher-starter">Fresher (Campus &amp; Entry-Level)</option>
                      <option value="experienced-professional">Experienced Professional (Senior)</option>
                      <option value="one-page-resume">One-Page Resume (High Density)</option>
                    </optgroup>
                    <optgroup label="FAANG &amp; Top Tech Templates">
                      <option value="01-google-swe">Google SWE (Clean Standard)</option>
                      <option value="02-amazon-sde">Amazon SDE (Metrics &amp; Leadership)</option>
                      <option value="03-meta-swe">Meta SWE (Architecture Centric)</option>
                      <option value="04-apple-swe">Apple SWE (Design &amp; Code)</option>
                      <option value="05-microsoft-sde">Microsoft SDE (Enterprise Scale)</option>
                      <option value="09-netflix-seniorswe">Netflix Senior SWE</option>
                    </optgroup>
                    <optgroup label="Top Unicorns &amp; Fast Growth">
                      <option value="11-flipkart-sde">Flipkart SDE</option>
                      <option value="12-razorpay-backend">Razorpay Backend</option>
                      <option value="13-swiggy-zomato-sde">Swiggy / Zomato SDE</option>
                      <option value="15-cred-fullstack">CRED Full-Stack</option>
                      <option value="20-zerodha-engineer">Zerodha Engineer</option>
                      <option value="16-atlassian-sde">Atlassian SDE</option>
                      <option value="17-uber-ola-sde">Uber / Ola SDE</option>
                      <option value="18-freshworks-sde">Freshworks SDE</option>
                    </optgroup>
                    <optgroup label="Freshers &amp; Campus Services">
                      <option value="21-tcs-digital-fresher">TCS Digital Fresher</option>
                      <option value="22-infosys-specialist-programmer">Infosys Specialist Programmer</option>
                      <option value="24-cognizant-genc-elevate">Cognizant GenC Elevate</option>
                      <option value="28-generic-fresher">Generic Engineering Fresher</option>
                    </optgroup>
                  </select>
                </div>

                <div className="flex items-center gap-2 text-xs text-blue-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>110 Company Templates Available</span>
                </div>
              </div>

              {/* Celebration / Boosted Score Results Card */}
              {boostResult && (
                <div className="bg-slate-950/95 border border-emerald-500/40 rounded-2xl p-6 space-y-6 animate-in fade-in duration-300 mt-4 shadow-2xl">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-extrabold text-2xl shadow-lg">
                        {boostResult.boosted_ats_score}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                            Final ATS Validation &bull; Optimization Verified
                          </span>
                          <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 text-xs font-mono font-bold rounded border border-emerald-800/40">
                            +{boostResult.score_increase} Points Increase
                          </span>
                        </div>
                        <h4 className="text-xl font-bold text-white mt-0.5">
                          Original Score: <span className="text-slate-400 line-through">{boostResult.original_ats_score}</span> &rarr;{" "}
                          Optimized Score: <span className="text-emerald-400">{boostResult.boosted_ats_score}/100</span>
                        </h4>
                      </div>
                    </div>

                    {/* Download & Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAutoBoost()}
                        disabled={boosting}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
                        title="Re-run ATS scoring validation on the optimized resume"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${boosting ? "animate-spin" : ""}`} />
                        Recheck ATS Score
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowSideBySide(!showSideBySide)}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5 text-indigo-400" />
                        {showSideBySide ? "Hide Comparison" : "Review Original vs Improved"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("preview");
                          setPreviewViewMode("visual");
                        }}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View 1-Page Layout
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openPrintableHtml(
                            boostResult.downloadable_html || boostResult.enhanced_resume_text
                          )
                        }
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5 text-blue-400" />
                        Print / PDF (.HTML)
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadBoostedDocx}
                        disabled={downloadingDocx}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
                      >
                        {downloadingDocx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-emerald-400" />}
                        Word (.docx)
                      </button>

                      <button
                        type="button"
                        onClick={handleOpenInResumeStudio}
                        disabled={openingStudio}
                        className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow transition-all"
                      >
                        {openingStudio ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-yellow-300" />}
                        Open in Resume Studio
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          downloadTextFile(
                            boostResult.enhanced_resume_text,
                            `${analysis.role_target || "ATS"}_1Page_Resume.txt`
                          )
                        }
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download ATS (.TXT)
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          copyText(boostResult.enhanced_resume_text, () => {
                            setCopiedBoostedText(true);
                            setTimeout(() => setCopiedBoostedText(false), 2000);
                          })
                        }
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
                      >
                        {copiedBoostedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedBoostedText ? "Copied" : "Copy"}
                      </button>

                      <button
                        type="button"
                        onClick={handleApplyBoostedAnalysis}
                        className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold rounded-xl border border-emerald-500/40 flex items-center gap-1.5 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Apply to Dashboard
                      </button>
                    </div>
                  </div>

                  {/* Side-by-Side Original vs Improved Content Review */}
                  {showSideBySide && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-900/80 rounded-xl border border-slate-800 animate-in fade-in">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Original Content</span>
                          <span className="text-xs text-slate-400">Score: {boostResult.original_ats_score}/100</span>
                        </div>
                        <pre className="p-3 bg-slate-950 rounded-lg text-xs font-mono text-slate-300 whitespace-pre-wrap max-h-80 overflow-y-auto border border-red-900/30">
                          {analysis.raw_text}
                        </pre>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Optimized Content</span>
                          <span className="text-xs text-emerald-400 font-bold">Score: {boostResult.boosted_ats_score}/100</span>
                        </div>
                        <pre className="p-3 bg-slate-950 rounded-lg text-xs font-mono text-slate-200 whitespace-pre-wrap max-h-80 overflow-y-auto border border-emerald-900/30">
                          {boostResult.enhanced_resume_text}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Validation Metrics Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                      <span className="text-xs font-semibold text-slate-400 block mb-1">Technical Skill Matching</span>
                      <div className="text-lg font-bold text-white flex items-center gap-1.5">
                        <Code2 className="w-4 h-4 text-blue-400" />
                        {boostResult.new_analysis?.extracted_skills?.length || 0} Skills Active
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {boostResult.new_analysis?.matched_job_skills?.length
                          ? `Matched ${boostResult.new_analysis.matched_job_skills.length} role requirements`
                          : "Taxonomy normalized & categorized"}
                      </p>
                    </div>

                    <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                      <span className="text-xs font-semibold text-slate-400 block mb-1">Keyword Coverage</span>
                      <div className="text-lg font-bold text-white flex items-center gap-1.5">
                        <Target className="w-4 h-4 text-emerald-400" />
                        {boostResult.new_analysis?.category_scores?.keyword_optimization?.score || 8}/10 Pts
                      </div>
                      <p className="text-xs text-slate-400 mt-1">Contextual placement without stuffing</p>
                    </div>

                    <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                      <span className="text-xs font-semibold text-slate-400 block mb-1">Formatting Quality</span>
                      <div className="text-lg font-bold text-white flex items-center gap-1.5">
                        <FileCheck className="w-4 h-4 text-teal-400" />
                        Single-Column 100% Pass
                      </div>
                      <p className="text-xs text-slate-400 mt-1">0.5&quot;/0.65&quot; margins, Calibri/Inter hierarchy</p>
                    </div>

                    <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                      <span className="text-xs font-semibold text-slate-400 block mb-1">Missing Requirements</span>
                      <div className="text-lg font-bold text-white flex items-center gap-1.5">
                        <Lightbulb className="w-4 h-4 text-amber-400" />
                        {boostResult.new_analysis?.missing_skills?.length || 0} Skills Left
                      </div>
                      <p className="text-xs text-slate-400 mt-1">Optional secondary skills to learn</p>
                    </div>
                  </div>

                  {/* Improvements list */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                      Improvements Applied to Your Resume:
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {boostResult.improvements_applied.map((imp, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                          <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span>{imp}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Toggle view enhanced resume */}
                  <div className="pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowEnhancedView(!showEnhancedView)}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
                    >
                      {showEnhancedView ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {showEnhancedView ? "Hide Enhanced Resume Text" : "View Enhanced ATS-Optimized Resume Text"}
                    </button>

                    {showEnhancedView && (
                      <pre className="mt-3 p-4 bg-slate-900 rounded-lg text-xs font-mono text-slate-200 whitespace-pre-wrap max-h-72 overflow-y-auto border border-slate-800">
                        {boostResult.enhanced_resume_text}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Error / Warning Notice for Mode 3 Unavailable JDs */}
            {analysis.error_message && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-sm flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <strong className="block font-semibold">Job Description Unavailable Notice</strong>
                  <span>{analysis.error_message}</span>
                </div>
              </div>
            )}

            {/* Main Tabs Navigation Bar */}
            <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
              <button
                type="button"
                onClick={() => setActiveTab("inspector")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === "inspector"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                    : "bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <Eye className="w-4 h-4" />
                Word-by-Word Inspector
                <span className="ml-1 px-2 py-0.5 bg-blue-950/60 text-blue-200 text-xs rounded-full">
                  {analysis.word_annotations?.length || 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("bullets")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === "bullets"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                    : "bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <ListFilter className="w-4 h-4" />
                Line-by-Line Bullet Review
                <span className="ml-1 px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded-full">
                  {analysis.bullet_evaluations?.length || 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("vocabulary")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === "vocabulary"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                    : "bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                Vocabulary & Word Metrics
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("breakdown")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === "breakdown"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                    : "bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <Layers className="w-4 h-4" />
                9-Pillar Scoring Breakdown
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("keywords")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === "keywords"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                    : "bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <Target className="w-4 h-4" />
                Keywords & Related Tech
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("assistant")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === "assistant"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                    : "bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <Wand2 className="w-4 h-4" />
                AI Assistant & Wording Fixes
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === "preview"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                    : "bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <FileText className="w-4 h-4" />
                One-Page Resume (Print-Ready)
                {boostResult && (
                  <span className="ml-1 px-2 py-0.5 bg-emerald-950/60 text-emerald-300 text-xs rounded-full font-bold">
                    {boostResult.boosted_ats_score}/100
                  </span>
                )}
              </button>
            </div>

            {/* TAB 1: Word-by-Word Document Inspector */}
            {activeTab === "inspector" && (
              <div className="space-y-6">
                {/* Filter Pills */}
                <div className="flex flex-wrap items-center gap-2 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                  <span className="text-xs font-semibold uppercase text-slate-400 mr-1">Filter Word Types:</span>
                  <button
                    onClick={() => setAnnotationFilter("all")}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      annotationFilter === "all" ? "bg-slate-700 text-white font-semibold" : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    All Words ({annotationCounts.all})
                  </button>
                  <button
                    onClick={() => setAnnotationFilter("weak_verb")}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      annotationFilter === "weak_verb" ? "bg-rose-600 text-white font-semibold" : "bg-rose-950/40 text-rose-300 hover:bg-rose-900/60"
                    }`}
                  >
                    Weak Verbs ({annotationCounts.weak_verb})
                  </button>
                  <button
                    onClick={() => setAnnotationFilter("strong_verb")}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      annotationFilter === "strong_verb" ? "bg-emerald-600 text-white font-semibold" : "bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60"
                    }`}
                  >
                    Strong Verbs ({annotationCounts.strong_verb})
                  </button>
                  <button
                    onClick={() => setAnnotationFilter("metric")}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      annotationFilter === "metric" ? "bg-teal-600 text-white font-semibold" : "bg-teal-950/40 text-teal-300 hover:bg-teal-900/60"
                    }`}
                  >
                    Metrics ({annotationCounts.metric})
                  </button>
                  <button
                    onClick={() => setAnnotationFilter("tech_skill")}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      annotationFilter === "tech_skill" ? "bg-cyan-600 text-white font-semibold" : "bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/60"
                    }`}
                  >
                    Technical Skills ({annotationCounts.tech_skill})
                  </button>
                  <button
                    onClick={() => setAnnotationFilter("buzzword")}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      annotationFilter === "buzzword" ? "bg-amber-600 text-white font-semibold" : "bg-amber-950/40 text-amber-300 hover:bg-amber-900/60"
                    }`}
                  >
                    Buzzwords ({annotationCounts.buzzword})
                  </button>
                  <button
                    onClick={() => setAnnotationFilter("pronoun")}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      annotationFilter === "pronoun" ? "bg-purple-600 text-white font-semibold" : "bg-purple-950/40 text-purple-300 hover:bg-purple-900/60"
                    }`}
                  >
                    Pronouns ({annotationCounts.pronoun})
                  </button>
                </div>

                {/* Document Container + Token Inspector Drawer */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left: Annotated Document Viewer (2 Columns) */}
                  <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-400" />
                        <span className="font-semibold text-sm text-slate-200">Interactive Document Viewer</span>
                      </div>
                      <span className="text-xs text-slate-500">Click any highlighted word to inspect</span>
                    </div>

                    <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap text-slate-300 max-h-[600px] overflow-y-auto pr-2">
                      {renderDocumentText(
                        analysis.raw_text || "",
                        analysis.word_annotations || [],
                        annotationFilter
                      )}
                    </div>
                  </div>

                  {/* Right: Selected Token Inspector Drawer (1 Column) */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                    {selectedAnnotation ? (
                      <div className="space-y-5">
                        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                          <div>
                            <span
                              className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase ${
                                selectedAnnotation.type === "weak_verb"
                                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                  : selectedAnnotation.type === "strong_verb"
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                  : selectedAnnotation.type === "metric"
                                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                                  : selectedAnnotation.type === "buzzword"
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                  : selectedAnnotation.type === "pronoun"
                                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                  : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                              }`}
                            >
                              {selectedAnnotation.label}
                            </span>
                            <h4 className="text-xl font-mono font-bold text-white mt-2">
                              &ldquo;{selectedAnnotation.text}&rdquo;
                            </h4>
                          </div>
                          <button
                            onClick={() => setSelectedAnnotation(null)}
                            className="text-slate-500 hover:text-slate-300 p-1"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>

                        {/* Issue description if flagged */}
                        {selectedAnnotation.issue && (
                          <div className="space-y-1">
                            <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider block">
                              Issue Flagged
                            </span>
                            <p className="text-sm text-rose-200">{selectedAnnotation.issue}</p>
                          </div>
                        )}

                        {/* Recruiter impact explanation */}
                        {selectedAnnotation.explanation && (
                          <div className="space-y-1">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                              Recruiter & ATS Impact
                            </span>
                            <p className="text-sm text-slate-300">{selectedAnnotation.explanation}</p>
                          </div>
                        )}

                        {/* Replacement options */}
                        {selectedAnnotation.replacement_options && selectedAnnotation.replacement_options.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-slate-800">
                            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block">
                              Recommended Replacements
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {selectedAnnotation.replacement_options.map((opt, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() =>
                                    copyText(opt, () => {
                                      setCopiedReplacement(opt);
                                      setTimeout(() => setCopiedReplacement(null), 2000);
                                    })
                                  }
                                  className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-950/20 rounded-lg text-xs font-mono text-emerald-300 flex items-center gap-1.5 transition-colors"
                                >
                                  {opt}
                                  {copiedReplacement === opt ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3 text-slate-500" />
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-3">
                        <Quote className="w-10 h-10 text-slate-700" />
                        <div>
                          <p className="text-sm font-medium text-slate-400">Word Inspector</p>
                          <p className="text-xs text-slate-500 mt-1 max-w-xs">
                            Click any highlighted word in the document to see its classification, issues, and suggested replacements.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Line-by-Line Bullet Review (Resume Worded Parity) */}
            {activeTab === "bullets" && (
              <div className="space-y-6">
                {/* Filter Sub-header */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                  <div>
                    <h3 className="font-bold text-white text-base">Line Feedback & Top Fixes</h3>
                    <p className="text-xs text-slate-400">
                      Evaluates every bullet line against Google&apos;s X-Y-Z formula: Accomplished [X] as measured by [Y] by doing [Z].
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setBulletFilter("all")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        bulletFilter === "all" ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      All ({analysis.bullet_evaluations?.length || 0})
                    </button>
                    <button
                      onClick={() => setBulletFilter("high")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        bulletFilter === "high" ? "bg-emerald-600 text-white" : "bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60"
                      }`}
                    >
                      High Impact ({analysis.bullet_evaluations?.filter((b) => b.impact_rating === "high").length || 0})
                    </button>
                    <button
                      onClick={() => setBulletFilter("medium")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        bulletFilter === "medium" ? "bg-amber-600 text-white" : "bg-amber-950/40 text-amber-300 hover:bg-amber-900/60"
                      }`}
                    >
                      Moderate ({analysis.bullet_evaluations?.filter((b) => b.impact_rating === "medium").length || 0})
                    </button>
                    <button
                      onClick={() => setBulletFilter("needs_work")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        bulletFilter === "needs_work" ? "bg-rose-600 text-white" : "bg-rose-950/40 text-rose-300 hover:bg-rose-900/60"
                      }`}
                    >
                      Needs Fix ({analysis.bullet_evaluations?.filter((b) => b.impact_rating === "needs_work").length || 0})
                    </button>
                  </div>
                </div>

                {/* Bullets List */}
                <div className="space-y-4">
                  {filteredBullets.map((bullet) => (
                    <div
                      key={bullet.id}
                      className={`bg-slate-900/80 border rounded-xl p-5 shadow-sm space-y-3 transition-colors ${
                        bullet.impact_rating === "high"
                          ? "border-emerald-500/30"
                          : bullet.impact_rating === "medium"
                          ? "border-amber-500/30"
                          : "border-rose-500/40"
                      }`}
                    >
                      {/* Top Bar of Bullet */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase ${
                              bullet.impact_rating === "high"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : bullet.impact_rating === "medium"
                                ? "bg-amber-500/20 text-amber-300"
                                : "bg-rose-500/20 text-rose-300"
                            }`}
                          >
                            {bullet.impact_rating === "high"
                              ? "High Impact"
                              : bullet.impact_rating === "medium"
                              ? "Moderate Impact"
                              : "Needs Work"}
                          </span>
                          <span className="text-xs text-slate-400 font-medium">
                            Section: {bullet.section} (Line {bullet.line_number})
                          </span>
                        </div>

                        {/* Metadata tags */}
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                          {bullet.strong_verb && (
                            <span className="px-2 py-0.5 bg-emerald-950/40 text-emerald-300 rounded border border-emerald-800/40">
                              Verb: {bullet.strong_verb}
                            </span>
                          )}
                          {bullet.weak_verb && (
                            <span className="px-2 py-0.5 bg-rose-950/40 text-rose-300 rounded border border-rose-800/40">
                              Weak: {bullet.weak_verb}
                            </span>
                          )}
                          {bullet.metrics.length > 0 && (
                            <span className="px-2 py-0.5 bg-teal-950/40 text-teal-300 rounded border border-teal-800/40">
                              Metric: {bullet.metrics.join(", ")}
                            </span>
                          )}
                          <span className="text-slate-500">{bullet.word_count} words</span>
                        </div>
                      </div>

                      {/* Original Sentence */}
                      <div>
                        <span className="text-xs text-slate-500 uppercase font-semibold block mb-1">
                          Original Sentence:
                        </span>
                        <p className="text-slate-200 text-sm font-mono leading-relaxed pl-3 border-l-2 border-slate-700">
                          {bullet.original_text}
                        </p>
                      </div>

                      {/* Issues list if any */}
                      {bullet.issues.length > 0 && (
                        <div className="space-y-1">
                          {bullet.issues.map((iss, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-xs text-rose-300">
                              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-rose-400" />
                              <span>{iss}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Suggested X-Y-Z Rewrite */}
                      {bullet.suggested_rewrite && (
                        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5" />
                              Recommended X-Y-Z Rewrite
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  copyText(bullet.suggested_rewrite, () => {
                                    setCopiedBulletId(bullet.id);
                                    setTimeout(() => setCopiedBulletId(null), 2000);
                                  })
                                }
                                className="px-2 py-1 text-xs text-slate-300 hover:text-white bg-slate-900 border border-slate-700 hover:border-slate-500 rounded flex items-center gap-1 transition-colors"
                              >
                                {copiedBulletId === bullet.id ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    Copy Rewrite
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("assistant");
                                  setAssistantMode("bullet");
                                  setAssistantInput(bullet.original_text);
                                }}
                                className="px-2 py-1 text-xs text-blue-300 hover:text-white bg-blue-950/40 border border-blue-800/40 hover:border-blue-700 rounded flex items-center gap-1 transition-colors"
                              >
                                <Wand2 className="w-3 h-3" />
                                AI Assistant
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-slate-200 font-mono leading-relaxed">
                            {bullet.suggested_rewrite}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: Vocabulary & Word Metrics (ToolAdda Parity) */}
            {activeTab === "vocabulary" && analysis.word_metrics && (
              <div className="space-y-6">
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="font-bold text-white text-base">Quantitative Vocabulary & Density Report</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Compares word count, lexical diversity, bullet quantification rate, and reading time against recruiter screening benchmarks.
                  </p>
                </div>

                {/* Metrics Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Total Words & Ideal Length */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-2">
                    <span className="text-xs uppercase font-semibold text-slate-400 block">Total Word Count</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-white">{analysis.word_metrics.total_words}</span>
                      <span className="text-xs text-slate-500">words</span>
                    </div>
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold ${
                        analysis.word_metrics.total_words >= 400 && analysis.word_metrics.total_words <= 750
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {analysis.word_metrics.total_words >= 400 && analysis.word_metrics.total_words <= 750
                        ? "Optimal 1-Page Length"
                        : analysis.word_metrics.total_words < 400
                        ? "Too Brief (<400 words)"
                        : "Exceeds 1-Page (>750 words)"}
                    </span>
                    <p className="text-xs text-slate-500 pt-1">Target benchmark for freshers: 450 - 750 words.</p>
                  </div>

                  {/* Quantification Rate */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-2">
                    <span className="text-xs uppercase font-semibold text-slate-400 block">
                      Bullets with Quantified Metrics
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-teal-300">
                        {analysis.word_metrics.quantification_rate_percentage}%
                      </span>
                      <span className="text-xs text-slate-500">
                        ({analysis.word_metrics.quantified_bullets_count}/{analysis.word_metrics.total_bullets} bullets)
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-teal-500 h-full rounded-full"
                        style={{ width: `${analysis.word_metrics.quantification_rate_percentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 pt-1">Target benchmark: At least 50% of bullets include metrics.</p>
                  </div>

                  {/* Strong Action Verbs Rate */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-2">
                    <span className="text-xs uppercase font-semibold text-slate-400 block">
                      Action Verbs Leadership Rate
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-emerald-300">
                        {analysis.word_metrics.strong_verb_rate_percentage}%
                      </span>
                      <span className="text-xs text-slate-500">
                        ({analysis.word_metrics.strong_verb_bullets_count}/{analysis.word_metrics.total_bullets} bullets)
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full"
                        style={{ width: `${analysis.word_metrics.strong_verb_rate_percentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 pt-1">Target benchmark: At least 80% start with power verbs.</p>
                  </div>

                  {/* Average Words Per Bullet */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-2">
                    <span className="text-xs uppercase font-semibold text-slate-400 block">Avg Words Per Bullet</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-white">{analysis.word_metrics.average_words_per_bullet}</span>
                      <span className="text-xs text-slate-500">words/bullet</span>
                    </div>
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold ${
                        analysis.word_metrics.average_words_per_bullet >= 12 &&
                        analysis.word_metrics.average_words_per_bullet <= 28
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {analysis.word_metrics.average_words_per_bullet >= 12 &&
                      analysis.word_metrics.average_words_per_bullet <= 28
                        ? "Optimal Skimmability"
                        : "Requires Trimming"}
                    </span>
                    <p className="text-xs text-slate-500 pt-1">Target benchmark: 15 - 25 words per bullet line.</p>
                  </div>

                  {/* Buzzwords & Clichés */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-2">
                    <span className="text-xs uppercase font-semibold text-slate-400 block">Buzzwords & Clichés</span>
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`text-3xl font-black ${
                          analysis.word_metrics.buzzwords_count === 0 ? "text-emerald-300" : "text-amber-400"
                        }`}
                      >
                        {analysis.word_metrics.buzzwords_count}
                      </span>
                      <span className="text-xs text-slate-500">detected</span>
                    </div>
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold ${
                        analysis.word_metrics.buzzwords_count === 0
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {analysis.word_metrics.buzzwords_count === 0 ? "Clean (0 Clichés)" : "Remove Vague Buzzwords"}
                    </span>
                    <p className="text-xs text-slate-500 pt-1">Target: Zero clichés (e.g. &apos;team player&apos;, &apos;go-getter&apos;).</p>
                  </div>

                  {/* Personal Pronouns */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-2">
                    <span className="text-xs uppercase font-semibold text-slate-400 block">Personal Pronouns</span>
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`text-3xl font-black ${
                          analysis.word_metrics.personal_pronouns_count === 0 ? "text-emerald-300" : "text-rose-400"
                        }`}
                      >
                        {analysis.word_metrics.personal_pronouns_count}
                      </span>
                      <span className="text-xs text-slate-500">detected</span>
                    </div>
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold ${
                        analysis.word_metrics.personal_pronouns_count === 0
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-rose-500/20 text-rose-300"
                      }`}
                    >
                      {analysis.word_metrics.personal_pronouns_count === 0
                        ? "Standard Compliant"
                        : "Remove 'I' / 'Me' / 'My'"}
                    </span>
                    <p className="text-xs text-slate-500 pt-1">Target: Zero first-person pronouns in ATS bullet points.</p>
                  </div>
                </div>

                {/* Additional Text Insights */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900/40 p-4 rounded-xl border border-slate-800/80 text-xs text-slate-400">
                  <div>
                    <span className="font-semibold text-slate-300 block mb-0.5">Lexical Diversity:</span>
                    <span>
                      {analysis.word_metrics.lexical_diversity_percentage}% unique vocabulary ({analysis.word_metrics.unique_words} unique words).
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-300 block mb-0.5">Estimated Reading Time:</span>
                    <span>~{analysis.word_metrics.reading_time_minutes} minutes for human recruiter review.</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-300 block mb-0.5">Reading Grade Level:</span>
                    <span>{analysis.word_metrics.reading_grade_level}</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: 9-Pillar ATS Breakdown */}
            {activeTab === "breakdown" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                  <div>
                    <h3 className="font-bold text-white text-base">Mathematical ATS Scoring Breakdown</h3>
                    <p className="text-xs text-slate-400">
                      Deterministic calculation engine summing exactly to 100%. Click each pillar to inspect criteria.
                    </p>
                  </div>

                  {analysis.job_match_score !== null && (
                    <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                      <button
                        onClick={() => setActiveBreakdownTab("general")}
                        className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                          activeBreakdownTab === "general" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        General (9 Pillars)
                      </button>
                      <button
                        onClick={() => setActiveBreakdownTab("job")}
                        className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                          activeBreakdownTab === "job" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Role Fit (8 Pillars)
                      </button>
                    </div>
                  )}
                </div>

                {/* Pillars Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(
                    (activeBreakdownTab === "job" && analysis.job_breakdown
                      ? analysis.job_breakdown
                      : analysis.general_breakdown) || {}
                  ).map(([key, pillar]: [string, ScoreBreakdownItem]) => (
                    <div key={key} className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-sm text-white">{pillar.label}</h4>
                          <span className="text-xs text-slate-400">Weight: {pillar.weight_pct}% of total score</span>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded text-xs font-semibold ${
                            pillar.percentage >= 80
                              ? "bg-emerald-500/20 text-emerald-300"
                              : pillar.percentage >= 60
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-rose-500/20 text-rose-300"
                          }`}
                        >
                          {pillar.status}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>
                            Points: <strong className="text-slate-200">{pillar.score}</strong> / {pillar.max}
                          </span>
                          <span>{pillar.percentage}%</span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              pillar.percentage >= 80 ? "bg-emerald-500" : pillar.percentage >= 60 ? "bg-amber-500" : "bg-rose-500"
                            }`}
                            style={{ width: `${pillar.percentage}%` }}
                          />
                        </div>
                      </div>

                      <p className="text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                        {pillar.feedback}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 5: Keywords & Related Tech */}
            {activeTab === "keywords" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Matched Keywords */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center gap-2 text-emerald-400 border-b border-slate-800 pb-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <h4 className="font-bold text-sm uppercase tracking-wider">
                        Matched Keywords ({analysis.matched_job_skills?.length || analysis.extracted_skills?.length || 0})
                      </h4>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-72 overflow-y-auto">
                      {(analysis.matched_job_skills && analysis.matched_job_skills.length > 0
                        ? analysis.matched_job_skills
                        : analysis.extracted_skills || []
                      ).map((sk, i) => (
                        <span key={i} className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-md text-xs font-mono">
                          {sk}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Related Technologies (Semantic Equivalencies) */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center gap-2 text-indigo-400 border-b border-slate-800 pb-2">
                      <Code2 className="w-4 h-4" />
                      <h4 className="font-bold text-sm uppercase tracking-wider">
                        Related Technologies ({analysis.related_skills?.length || 0})
                      </h4>
                    </div>
                    {analysis.related_skills && analysis.related_skills.length > 0 ? (
                      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                        {analysis.related_skills.map((rel: RelatedSkill, idx: number) => (
                          <div key={idx} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-semibold text-indigo-300">{rel.candidate_skill}</span>
                              <span className="text-slate-500">covers</span>
                              <span className="font-mono text-slate-300">{rel.required_skill}</span>
                            </div>
                            <p className="text-[11px] text-slate-400">{rel.relation_note || rel.notes}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">
                        No semantic equivalency substitutes identified for this profile.
                      </p>
                    )}
                  </div>

                  {/* Missing Keywords */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center gap-2 text-rose-400 border-b border-slate-800 pb-2">
                      <AlertCircle className="w-4 h-4" />
                      <h4 className="font-bold text-sm uppercase tracking-wider">
                        Missing Keywords ({analysis.missing_skills?.length || 0})
                      </h4>
                    </div>
                    {analysis.missing_skills && analysis.missing_skills.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-h-72 overflow-y-auto">
                        {analysis.missing_skills.map((sk: string, i: number) => (
                          <span key={i} className="px-2.5 py-1 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-md text-xs font-mono">
                            {sk}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-emerald-400">All high-frequency role keywords present!</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: AI Resume Assistant & Wording Fixes */}
            {activeTab === "assistant" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: AI Resume Improvement Assistant */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
                    <Wand2 className="w-5 h-5 text-blue-400" />
                    <div>
                      <h3 className="font-bold text-white text-base">In-Page AI Resume Optimizer</h3>
                      <p className="text-xs text-slate-400">
                        Generate X-Y-Z formula rewrites using Google Gemini with local heuristic fallback.
                      </p>
                    </div>
                  </div>

                  {/* Mode Selector */}
                  <div className="flex gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => setAssistantMode("bullet")}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        assistantMode === "bullet" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Bullet Point
                    </button>
                    <button
                      onClick={() => setAssistantMode("project")}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        assistantMode === "project" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Project Description
                    </button>
                    <button
                      onClick={() => setAssistantMode("summary")}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        assistantMode === "summary" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Summary
                    </button>
                    <button
                      onClick={() => setAssistantMode("skills")}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        assistantMode === "skills" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Skills Grouping
                    </button>
                  </div>

                  {/* Input Textarea */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 uppercase">
                      Content to Improve
                    </label>
                    <textarea
                      rows={4}
                      value={assistantInput}
                      onChange={(e) => setAssistantInput(e.target.value)}
                      placeholder="Paste your original sentence or project description here..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleRunAssistant}
                    disabled={assistantLoading || !assistantInput.trim()}
                    className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50"
                  >
                    {assistantLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating Tailored Rewrite...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Optimize with AI
                      </>
                    )}
                  </button>

                  {/* Assistant Results Card */}
                  {assistantResult && (
                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          Improved Version
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            copyText(assistantResult.improved, () => {
                              setAssistantCopied(true);
                              setTimeout(() => setAssistantCopied(false), 2000);
                            })
                          }
                          className="px-2 py-1 text-xs text-slate-300 hover:text-white bg-slate-900 border border-slate-700 rounded flex items-center gap-1"
                        >
                          {assistantCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          {assistantCopied ? "Copied" : "Copy"}
                        </button>
                      </div>

                      <p className="text-xs text-slate-200 font-mono leading-relaxed bg-slate-900 p-3 rounded-lg border border-slate-800">
                        {assistantResult.improved}
                      </p>

                      <div className="text-xs text-slate-400 space-y-1">
                        <span className="font-semibold text-slate-300">Recruiter Feedback:</span>
                        <p>{assistantResult.explanation}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Detected Weak Phrases & Wording Improvements */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                    <Lightbulb className="w-5 h-5 text-amber-400" />
                    <div>
                      <h3 className="font-bold text-white text-base">Before & After Bullet Transformations</h3>
                      <p className="text-xs text-slate-400">
                        Action verbs replacing passive &apos;worked on&apos; or &apos;responsible for&apos; phrasing.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {(analysis.bullet_improvements || []).map((imp: BulletImprovement, idx: number) => (
                      <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2.5">
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">Original Sentence</span>
                          <p className="text-xs font-mono text-slate-400 line-through decoration-rose-500/60">
                            {imp.original_sentence}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                              Improved Version
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                copyText(imp.improved_version, () => {
                                  setCopiedIndex(idx);
                                  setTimeout(() => setCopiedIndex(null), 2000);
                                })
                              }
                              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                            >
                              {copiedIndex === idx ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              {copiedIndex === idx ? "Copied" : "Copy"}
                            </button>
                          </div>
                          <p className="text-xs font-mono text-emerald-200 bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-800/40">
                            {imp.improved_version}
                          </p>
                        </div>

                        <p className="text-xs text-slate-400">{imp.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 7: One-Page Resume Preview (Print-Ready) */}
            {activeTab === "preview" && (
              <div className="space-y-6">
                {/* Header Card */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-blue-400" />
                      <h3 className="font-bold text-white text-lg">One-Page ATS-Optimized Resume</h3>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                        ✓ Strict 1-Page Layout
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                      Recruiter-tested Harvard format with strict single-page print geometry, two-column flex alignment for titles and dates/locations, categorized technical skills, and Google X-Y-Z action bullets.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        openPrintableHtml(
                          boostResult?.downloadable_html || ""
                        )
                      }
                      disabled={!boostResult?.downloadable_html}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
                    >
                      <Printer className="w-4 h-4" />
                      Print / Save as PDF
                    </button>

                    {boostResult && (
                      <button
                        type="button"
                        onClick={() =>
                          downloadTextFile(
                            boostResult.enhanced_resume_text,
                            `${analysis.role_target || "ATS"}_1Page_Resume.txt`
                          )
                        }
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download .TXT
                      </button>
                    )}

                    {boostResult && (
                      <button
                        type="button"
                        onClick={() =>
                          copyText(boostResult.enhanced_resume_text, () => {
                            setCopiedBoostedText(true);
                            setTimeout(() => setCopiedBoostedText(false), 2000);
                          })
                        }
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
                      >
                        {copiedBoostedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedBoostedText ? "Copied" : "Copy Text"}
                      </button>
                    )}
                  </div>
                </div>

                {boostResult ? (
                  <div className="space-y-4">
                    {/* Toggle between visual paper document and plain text + Template Switcher */}
                    <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewViewMode("visual")}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                            previewViewMode === "visual"
                              ? "bg-blue-600 text-white"
                              : "bg-slate-900 text-slate-400 hover:text-white"
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          1-Page Paper Layout (Visual)
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewViewMode("text")}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                            previewViewMode === "text"
                              ? "bg-blue-600 text-white"
                              : "bg-slate-900 text-slate-400 hover:text-white"
                          }`}
                        >
                          <Code2 className="w-3.5 h-3.5" />
                          Aligned Plain Text (.TXT)
                        </button>
                      </div>

                      {/* Template Selector in Preview Toolbar */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-slate-400 font-medium">Template:</span>
                        <select
                          value={boostTemplateId}
                          onChange={(e) => handleSwitchBoostTemplate(e.target.value)}
                          className="px-2.5 py-1 bg-slate-900 text-white text-xs font-semibold rounded-lg border border-slate-700 outline-none cursor-pointer"
                        >
                          <optgroup label="Official ATS Templates">
                            <option value="ats-technical-pro">ATS Professional (Recruiter Calibrated)</option>
                            <option value="modern-minimal">Modern Minimal (100% Safe)</option>
                            <option value="software-engineer">Software Engineer (FAANG Standard)</option>
                            <option value="aiml-engineer">AI/ML Engineer (AI &amp; Deep Learning)</option>
                            <option value="data-analyst">Data Analyst (BI &amp; Analytics)</option>
                            <option value="cloud-devops-engineer">Cloud &amp; DevOps Engineer</option>
                            <option value="fresher-starter">Fresher (Campus &amp; Entry-Level)</option>
                            <option value="experienced-professional">Experienced Professional (Senior)</option>
                            <option value="one-page-resume">One-Page Resume (High Density)</option>
                          </optgroup>
                          <optgroup label="FAANG &amp; Top Tech">
                            <option value="01-google-swe">Google SWE</option>
                            <option value="02-amazon-sde">Amazon SDE</option>
                            <option value="03-meta-swe">Meta SWE</option>
                            <option value="04-apple-swe">Apple SWE</option>
                            <option value="05-microsoft-sde">Microsoft SDE</option>
                            <option value="09-netflix-seniorswe">Netflix Senior</option>
                          </optgroup>
                          <optgroup label="Top Unicorns">
                            <option value="11-flipkart-sde">Flipkart SDE</option>
                            <option value="12-razorpay-backend">Razorpay Backend</option>
                            <option value="13-swiggy-zomato-sde">Swiggy / Zomato</option>
                            <option value="20-zerodha-engineer">Zerodha Engineer</option>
                          </optgroup>
                          <optgroup label="Standard ATS">
                            <option value="modern-professional">Modern Professional</option>
                            <option value="minimal-ats">Minimal ATS</option>
                            <option value="software-developer">Software Developer</option>
                          </optgroup>
                        </select>

                        <button
                          type="button"
                          onClick={handleOpenInResumeStudio}
                          disabled={openingStudio}
                          className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors"
                        >
                          {openingStudio ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-yellow-300" />}
                          Edit in Studio
                        </button>

                        <button
                          type="button"
                          onClick={handleDownloadBoostedDocx}
                          disabled={downloadingDocx}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1 transition-colors"
                        >
                          {downloadingDocx ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3 text-emerald-400" />}
                          DOCX
                        </button>
                      </div>

                      <span className="text-xs text-slate-400">
                        Boosted Score: <strong className="text-emerald-400">{boostResult.boosted_ats_score}/100</strong>
                      </span>
                    </div>

                    {previewViewMode === "visual" ? (
                      <div className="w-full bg-slate-950 p-2 sm:p-4 rounded-2xl border border-slate-800 flex justify-center">
                        <iframe
                          srcDoc={boostResult.downloadable_html || ""}
                          title="One-Page Resume Preview"
                          className="w-full max-w-[850px] h-[920px] bg-white rounded-xl shadow-2xl border border-slate-700"
                        />
                      </div>
                    ) : (
                      <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4">
                        <pre className="p-4 bg-slate-900 rounded-xl text-xs font-mono text-slate-200 whitespace-pre-wrap max-h-[800px] overflow-y-auto border border-slate-800 leading-relaxed">
                          {boostResult.enhanced_resume_text}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
                    <Sparkles className="w-10 h-10 text-blue-400 mx-auto" />
                    <div className="max-w-md mx-auto space-y-2">
                      <h4 className="text-base font-bold text-white">Generate Your 1-Page Structured Resume</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Click Boost to automatically upgrade your weak phrasing to active power verbs, align job dates and locations into standard two-column format, and structure your skills into a 1-page Harvard layout.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAutoBoost()}
                      disabled={boosting}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl inline-flex items-center gap-2 shadow-lg shadow-blue-500/25 transition-all"
                    >
                      {boosting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Structuring &amp; Boosting Resume...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Boost &amp; Build 1-Page Layout Now
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Extracted Raw Text Viewer Toggle */}
            <div className="border border-slate-800 rounded-xl bg-slate-900/40 p-4">
              <button
                type="button"
                onClick={() => setShowRawText(!showRawText)}
                className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200"
              >
                <span>Raw Extracted Text Snippet ({analysis.word_count || 0} words)</span>
                {showRawText ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showRawText && (
                <pre className="mt-3 p-4 bg-slate-950 rounded-lg text-xs font-mono text-slate-300 whitespace-pre-wrap max-h-60 overflow-y-auto border border-slate-800">
                  {analysis.raw_text}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* Modal: Inspect & Correct Extracted Resume Information */}
        {showInspectModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full p-6 shadow-2xl flex flex-col max-h-[90vh] space-y-5 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-400" />
                    Inspect &amp; Correct Extracted Resume Information
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Review and adjust the extracted sections below. Clicking Save will update the analysis with your corrections.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInspectModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-4 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Candidate Name</label>
                    <input
                      type="text"
                      value={inspectName}
                      onChange={(e) => setInspectName(e.target.value)}
                      placeholder="e.g. Alex Johnson"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Contact Info (Email, Phone, Links, Location)</label>
                    <input
                      type="text"
                      value={inspectContact}
                      onChange={(e) => setInspectContact(e.target.value)}
                      placeholder="e.g. alex@example.com | +1 555-0199 | San Francisco, CA"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Career Objective / Professional Summary</label>
                  <textarea
                    rows={3}
                    value={inspectSummary}
                    onChange={(e) => setInspectSummary(e.target.value)}
                    placeholder="Brief career objective or professional summary..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs focus:border-blue-500 focus:outline-none leading-relaxed"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Technical Skills</label>
                  <textarea
                    rows={3}
                    value={inspectSkills}
                    onChange={(e) => setInspectSkills(e.target.value)}
                    placeholder="e.g. Python, FastApi, React, TypeScript, PostgreSQL, Docker, AWS..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs focus:border-blue-500 focus:outline-none leading-relaxed"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Experience / Internships</label>
                  <textarea
                    rows={5}
                    value={inspectExperience}
                    onChange={(e) => setInspectExperience(e.target.value)}
                    placeholder="Company, Role, Dates, and Bullet Points..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs focus:border-blue-500 focus:outline-none font-mono leading-relaxed"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Projects</label>
                  <textarea
                    rows={5}
                    value={inspectProjects}
                    onChange={(e) => setInspectProjects(e.target.value)}
                    placeholder="Project Title, Tech Stack, and Bullet Points..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs focus:border-blue-500 focus:outline-none font-mono leading-relaxed"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Education &amp; Certifications</label>
                  <textarea
                    rows={3}
                    value={inspectEducation}
                    onChange={(e) => setInspectEducation(e.target.value)}
                    placeholder="Degree, Institution, Graduation Year, CGPA, Certifications..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs focus:border-blue-500 focus:outline-none leading-relaxed"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowInspectModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCorrections}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Save Corrections &amp; Re-evaluate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
