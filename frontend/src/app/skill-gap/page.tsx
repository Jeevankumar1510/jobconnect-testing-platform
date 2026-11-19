"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Code2,
  Compass,
  ExternalLink,
  Lightbulb,
  Loader2,
  Target,
  Zap,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { generateSkillGapRoadmap, getUserRoadmaps, updateRoadmapProgress } from "@/lib/api";
import type { SkillRoadmap } from "@/lib/types";

const TARGET_ROLES = [
  { id: "Python Backend Developer", label: "Python Backend Developer", desc: "FastAPI, Django, PostgreSQL, Docker, Redis" },
  { id: "Frontend React Developer", label: "Frontend React / Next.js Developer", desc: "React 19, Next.js, TypeScript, Tailwind CSS" },
  { id: "AI ML Engineer", label: "AI / Machine Learning Engineer", desc: "PyTorch, LangChain, RAG, Pandas, LLMs" },
  { id: "Full Stack Developer", label: "Full Stack Software Engineer", desc: "Next.js, FastAPI, PostgreSQL, REST APIs" },
];

export default function SkillGapPage() {
  const { user, token, ready } = useAuth();
  const [selectedRole, setSelectedRole] = useState<string>("Python Backend Developer");
  const [jobId, setJobId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [roadmap, setRoadmap] = useState<SkillRoadmap | null>(null);
  const [completedMilestones, setCompletedMilestones] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load existing user roadmap if available
  useEffect(() => {
    if (ready && token) {
      getUserRoadmaps(token)
        .then((list) => {
          if (list && list.length > 0) {
            setRoadmap(list[0]);
            const completed = list[0].roadmap_steps
              .filter((s) => s.is_completed)
              .map((s) => s.milestone);
            setCompletedMilestones(completed);
          }
        })
        .catch(() => {});
    }
  }, [ready, token]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setError("Please sign in to generate your customized learning roadmap.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await generateSkillGapRoadmap(
        selectedRole,
        token,
        jobId.trim() ? Number(jobId.trim()) : undefined,
      );
      setRoadmap(res);
      const completed = res.roadmap_steps
        .filter((s) => s.is_completed)
        .map((s) => s.milestone);
      setCompletedMilestones(completed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate roadmap.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function toggleMilestone(milestone: string) {
    if (!roadmap || !token) return;
    const isCompleted = completedMilestones.includes(milestone);
    const updated = isCompleted
      ? completedMilestones.filter((m) => m !== milestone)
      : [...completedMilestones, milestone];

    setCompletedMilestones(updated);
    const newProgress = Math.round((updated.length / roadmap.roadmap_steps.length) * 100);

    try {
      const saved = await updateRoadmapProgress(roadmap.id, newProgress, token, updated);
      setRoadmap(saved);
    } catch {
      // Revert if API fails
      setCompletedMilestones(completedMilestones);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header Banner */}
      <div className="mb-8 rounded-2xl bg-gradient-to-r from-indigo-700 via-purple-700 to-pink-700 p-8 text-white shadow-xl">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-md">
          <Compass size={14} /> Career Acceleration Engine
        </div>
        <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">Skill Gap Analysis & 30-Day Roadmaps</h1>
        <p className="mt-2 max-w-2xl text-purple-100">
          Discover exactly what skills you are missing for top IT roles in India. Get a week-by-week learning plan and portfolio projects that make recruiters take notice.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left Column: Role Selector & Controls */}
        <div className="space-y-6 lg:col-span-1">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Select Your Target Role</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Benchmark your current skills against industry fresher requirements.
            </p>

            <form onSubmit={handleGenerate} className="mt-4 space-y-4">
              <div className="space-y-2">
                {TARGET_ROLES.map((role) => (
                  <label
                    key={role.id}
                    className={`block cursor-pointer rounded-xl border p-3 text-xs transition-all ${
                      selectedRole === role.id
                        ? "border-purple-600 bg-purple-50/50 shadow-xs dark:border-purple-500 dark:bg-purple-950/30"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="target_role"
                        value={role.id}
                        checked={selectedRole === role.id}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        className="text-purple-600 focus:ring-purple-500"
                      />
                      <span className="font-bold text-slate-900 dark:text-white">{role.label}</span>
                    </div>
                    <p className="mt-1 pl-5 text-[11px] text-slate-500 dark:text-slate-400">{role.desc}</p>
                  </label>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Target Specific Job ID (Optional)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 102"
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none dark:border-slate-700 dark:text-white"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-xs font-semibold text-white shadow-md transition-all hover:bg-purple-700 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Analyzing Gaps…
                  </>
                ) : (
                  <>
                    <Zap size={16} /> Generate Learning Roadmap
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Employability Tip */}
          <div className="rounded-2xl border border-purple-100 bg-purple-50/50 p-5 dark:border-purple-900/30 dark:bg-purple-950/20">
            <h3 className="flex items-center gap-2 text-xs font-bold text-purple-900 dark:text-purple-300">
              <Lightbulb size={14} className="text-purple-600 dark:text-purple-400" /> Fresher Advantage
            </h3>
            <p className="mt-2 text-xs text-purple-800/80 dark:text-purple-300/80">
              Recruiters value demonstrable proof of skill over generic certificates. Building one production-ready project with tests and Docker beats 10 tutorial clones.
            </p>
          </div>
        </div>

        {/* Right Column: Skill Gap & Roadmap Steps */}
        <div className="space-y-6 lg:col-span-2">
          {roadmap ? (
            <div className="space-y-6">
              {/* Progress Summary Card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                      Personalized Skill Gap Diagnostic
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {roadmap.target_role}
                    </h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-500">
                      Roadmap Completion:
                    </span>
                    <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                      {roadmap.progress_percentage}% Complete
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 transition-all duration-500"
                    style={{ width: `${roadmap.progress_percentage}%` }}
                  />
                </div>

                {/* Skills Comparison Tags */}
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 dark:border-emerald-900/30 dark:bg-emerald-950/20">
                    <h4 className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 size={14} className="text-emerald-600" /> Matched Skills ({roadmap.current_skills.length})
                    </h4>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {roadmap.current_skills.length > 0 ? (
                        roadmap.current_skills.map((s, idx) => (
                          <span
                            key={idx}
                            className="rounded-md border border-emerald-200 bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300"
                          >
                            {s}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400">None detected yet.</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-4 dark:border-rose-900/30 dark:bg-rose-950/20">
                    <h4 className="flex items-center gap-2 text-xs font-bold text-rose-800 dark:text-rose-300">
                      <Target size={14} className="text-rose-600" /> Skills to Acquire ({roadmap.missing_skills.length})
                    </h4>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {roadmap.missing_skills.map((s, idx) => (
                        <span
                          key={idx}
                          className="rounded-md border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-300"
                        >
                          + {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 4-Week Milestone Steps */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <BookOpen size={16} className="text-purple-600" />
                  30-Day Milestone Execution Plan
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Tick each milestone as you master the concepts to track your readiness.
                </p>

                <div className="mt-6 space-y-4">
                  {roadmap.roadmap_steps.map((step) => {
                    const isChecked = completedMilestones.includes(step.milestone);
                    return (
                      <div
                        key={step.milestone}
                        className={`rounded-xl border p-4 transition-all ${
                          isChecked
                            ? "border-emerald-200 bg-emerald-50/20 dark:border-emerald-900/40 dark:bg-emerald-950/10"
                            : "border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleMilestone(step.milestone)}
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                            />
                            <div>
                              <span className="rounded bg-purple-100 px-2 py-0.5 text-[10px] font-bold uppercase text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                {step.milestone} • {step.estimated_days} Days
                              </span>
                              <h4 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                                {step.title}
                              </h4>
                              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                                {step.description}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {step.topics.map((t, idx) => (
                                  <span
                                    key={idx}
                                    className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Learning Resources */}
                        {step.resources && step.resources.length > 0 && (
                          <div className="mt-3.5 flex flex-wrap items-center gap-3 border-t border-slate-200/60 pt-2.5 pl-7 dark:border-slate-800">
                            <span className="text-[11px] font-semibold text-slate-400">Curated Guides:</span>
                            {step.resources.map((res, idx) => (
                              <a
                                key={idx}
                                href={res.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 hover:underline dark:text-purple-400"
                              >
                                {res.title} <ExternalLink size={11} />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recommended Portfolio Projects */}
              {roadmap.recommended_projects && roadmap.recommended_projects.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                    <Code2 size={16} className="text-purple-600" />
                    Recommended Resume Projects
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Build these high-impact projects to substantiate your skills and impress hiring managers.
                  </p>

                  <div className="mt-4 space-y-4">
                    {roadmap.recommended_projects.map((proj, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-200 p-4 transition-all hover:border-purple-300 dark:border-slate-800 dark:hover:border-purple-800"
                      >
                        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                            {proj.title}
                          </h4>
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {proj.tagline}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
                          {proj.description}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {proj.tech_stack.map((ts, sIdx) => (
                            <span
                              key={sIdx}
                              className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                              {ts}
                            </span>
                          ))}
                        </div>

                        {/* Resume Bullet */}
                        <div className="mt-3 rounded-lg border border-purple-100 bg-purple-50/60 p-2.5 text-xs text-purple-900 dark:border-purple-950 dark:bg-purple-950/20 dark:text-purple-300">
                          <span className="font-bold">Resume Bullet to use:</span> &ldquo;{proj.resume_bullet}&rdquo;
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center dark:border-slate-800 dark:bg-slate-900">
              <Compass size={48} className="text-slate-300 dark:text-slate-600" />
              <h3 className="mt-4 text-base font-bold text-slate-800 dark:text-slate-200">No Learning Roadmap Active</h3>
              <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                Select your target career role on the left and click Generate to see your personalized 30-day learning curriculum.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
