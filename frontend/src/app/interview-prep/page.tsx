"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Loader2,
  PlayCircle,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import {
  getInterviewQuestions,
  getMockInterviewSessions,
  startMockInterviewSession,
  submitMockInterviewAnswer,
} from "@/lib/api";
import type { AnswerEvaluation, MockInterviewSession } from "@/lib/types";

const CATEGORIES = ["Python", "SQL", "Java", "AWS", "AI/ML", "React", "HR"];

export default function InterviewPrepPage() {
  const { user, token, ready } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string>("Python");
  const [activeTab, setActiveTab] = useState<"mock" | "bank" | "history">("mock");

  // Mock Session State
  const [sessionLoading, setSessionLoading] = useState<boolean>(false);
  const [activeSession, setActiveSession] = useState<MockInterviewSession | null>(null);
  const [currentExchangeIdx, setCurrentExchangeIdx] = useState<number>(0);
  const [userAnswer, setUserAnswer] = useState<string>("");
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [latestEval, setLatestEval] = useState<AnswerEvaluation | null>(null);

  // Question Bank State
  const [bankQuestions, setBankQuestions] = useState<Array<any>>([]);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  // Past Sessions
  const [pastSessions, setPastSessions] = useState<MockInterviewSession[]>([]);

  // Load question bank on category change
  useEffect(() => {
    getInterviewQuestions(selectedCategory)
      .then((data) => setBankQuestions(data))
      .catch(() => {});
  }, [selectedCategory]);

  // Load past sessions
  useEffect(() => {
    if (ready && token && activeTab === "history") {
      getMockInterviewSessions(token)
        .then((data) => setPastSessions(data))
        .catch(() => {});
    }
  }, [ready, token, activeTab]);

  async function handleStartSession() {
    if (!token) return;
    setSessionLoading(true);
    setLatestEval(null);
    setUserAnswer("");
    setCurrentExchangeIdx(0);
    try {
      const res = await startMockInterviewSession(selectedCategory, token);
      setActiveSession(res);
    } catch (err) {
      console.error(err);
    } finally {
      setSessionLoading(false);
    }
  }

  async function handleSubmitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !activeSession || !userAnswer.trim()) return;

    const exchange = activeSession.exchanges[currentExchangeIdx];
    if (!exchange) return;

    setEvaluating(true);
    try {
      const evalRes = await submitMockInterviewAnswer(
        activeSession.id,
        exchange.id,
        userAnswer.trim(),
        token,
      );
      setLatestEval(evalRes);
      // Update local exchange state
      exchange.user_answer = userAnswer;
      exchange.score = evalRes.score;
      exchange.ai_feedback = evalRes.ai_feedback;
      exchange.ideal_answer = evalRes.ideal_answer;
    } catch (err) {
      console.error(err);
    } finally {
      setEvaluating(false);
    }
  }

  function handleNextQuestion() {
    if (!activeSession) return;
    setLatestEval(null);
    setUserAnswer("");
    if (currentExchangeIdx < activeSession.exchanges.length - 1) {
      setCurrentExchangeIdx((idx) => idx + 1);
    }
  }

  const currentExchange = activeSession?.exchanges[currentExchangeIdx];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Banner */}
      <div className="mb-8 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 p-8 text-white shadow-xl">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-md">
          <Sparkles size={14} /> AI Interview Coach & Evaluator
        </div>
        <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">Technical & HR Mock Interview Simulator</h1>
        <p className="mt-2 max-w-2xl text-emerald-100">
          Practice high-frequency interview questions across Python, SQL, Java, AWS, React, and behavioral rounds. Get instant scoring out of 10, strengths, and model answers.
        </p>
      </div>

      {/* Category Pills & Tab Bar */}
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setSelectedCategory(cat);
                setActiveSession(null);
              }}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                selectedCategory === cat
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
          <button
            onClick={() => setActiveTab("mock")}
            className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
              activeTab === "mock"
                ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
            }`}
          >
            Mock Simulator
          </button>
          <button
            onClick={() => setActiveTab("bank")}
            className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
              activeTab === "bank"
                ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
            }`}
          >
            Question Bank
          </button>
          {token && (
            <button
              onClick={() => setActiveTab("history")}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                activeTab === "history"
                  ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              Past Sessions
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Mock Interview Session */}
      {activeTab === "mock" && (
        <div>
          {!activeSession ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <PlayCircle size={32} />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
                Ready for your {selectedCategory} Mock Interview?
              </h3>
              <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                You will be presented with 4 carefully calibrated technical or behavioral interview questions. Answer in your own words to receive instant AI scoring and coaching.
              </p>

              <button
                onClick={handleStartSession}
                disabled={sessionLoading || !token}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-emerald-700 disabled:opacity-50"
              >
                {sessionLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Preparing Session…
                  </>
                ) : (
                  <>
                    <Zap size={16} /> Start Mock Session Now
                  </>
                )}
              </button>
              {!token && (
                <p className="mt-2 text-[11px] text-amber-600">Please sign in to take mock interviews.</p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Question Progress Header */}
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Question {currentExchangeIdx + 1} of {activeSession.exchanges.length}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    Category: {activeSession.category} ({currentExchange?.difficulty})
                  </span>
                </div>

                <button
                  onClick={() => setActiveSession(null)}
                  className="text-xs font-medium text-slate-400 hover:text-slate-600"
                >
                  Exit Session
                </button>
              </div>

              {/* Question Card */}
              {currentExchange && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Interviewer Question
                  </span>
                  <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white sm:text-lg">
                    {currentExchange.question}
                  </h3>

                  {/* Answer Input */}
                  {!latestEval && (
                    <form onSubmit={handleSubmitAnswer} className="mt-5 space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Your Technical Answer (Explain reasoning, examples & trade-offs):
                        </label>
                        <textarea
                          rows={6}
                          value={userAnswer}
                          onChange={(e) => setUserAnswer(e.target.value)}
                          placeholder="Type your explanation here. Example: 'In Python, mutability refers to whether an object's state can be modified... For instance, lists are mutable while tuples are immutable...'"
                          className="mt-1.5 w-full rounded-xl border border-slate-300 bg-transparent p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:text-white"
                          required
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">
                          Tip: Use the Definition ➔ Working Mechanism ➔ Real-world Example framework.
                        </span>
                        <button
                          type="submit"
                          disabled={evaluating || !userAnswer.trim()}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {evaluating ? (
                            <>
                              <Loader2 size={15} className="animate-spin" /> Evaluating…
                            </>
                          ) : (
                            <>
                              <Send size={15} /> Submit for AI Evaluation
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* AI Feedback Display */}
                  {latestEval && (
                    <div className="mt-6 space-y-6 border-t border-slate-100 pt-6 dark:border-slate-800">
                      {/* Score Badge */}
                      <div className="flex items-center justify-between rounded-xl bg-emerald-50/50 p-4 dark:bg-emerald-950/20">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                              {latestEval.score} / 10
                            </span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              Technical Evaluation Score
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                            {latestEval.ai_feedback}
                          </p>
                        </div>

                        {currentExchangeIdx < activeSession.exchanges.length - 1 ? (
                          <button
                            onClick={handleNextQuestion}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
                          >
                            Next Question <ChevronRight size={15} />
                          </button>
                        ) : (
                          <div className="rounded-lg bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                            Session Complete! 🎉
                          </div>
                        )}
                      </div>

                      {/* Strengths & Improvements */}
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/20 p-4 dark:border-emerald-900/30">
                          <h4 className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 size={14} /> Answer Strengths
                          </h4>
                          <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                            {latestEval.strengths.map((str, idx) => (
                              <li key={idx}>• {str}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="rounded-xl border border-amber-100 bg-amber-50/20 p-4 dark:border-amber-900/30">
                          <h4 className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                            <Lightbulb size={14} /> Key Improvement Points
                          </h4>
                          <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                            {latestEval.improvements.map((imp, idx) => (
                              <li key={idx}>• {imp}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* Model / Ideal Answer */}
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Model / Benchmark Answer
                        </span>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                          {latestEval.ideal_answer}
                        </p>
                        <p className="mt-2 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          Communication Coaching: {latestEval.communication_tips}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Question Bank Explorer */}
      {activeTab === "bank" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Curated {selectedCategory} Interview Questions for Freshers
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Review commonly asked questions, key concepts interviewers look for, and model answers.
            </p>

            <div className="mt-6 space-y-3">
              {bankQuestions.map((q) => {
                const isExpanded = expandedQuestion === q.id;
                return (
                  <div
                    key={q.id}
                    className="rounded-xl border border-slate-200 p-4 transition-all hover:border-emerald-300 dark:border-slate-800"
                  >
                    <div
                      className="flex cursor-pointer items-start justify-between gap-3"
                      onClick={() => setExpandedQuestion(isExpanded ? null : q.id)}
                    >
                      <div>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {q.difficulty}
                        </span>
                        <h4 className="mt-1 text-xs font-bold text-slate-900 dark:text-white sm:text-sm">
                          {q.question}
                        </h4>
                      </div>
                      <ChevronDown
                        size={16}
                        className={`text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </div>

                    {isExpanded && (
                      <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-400">Core Concepts:</span>
                          {q.key_concepts.map((kc: string, idx: number) => (
                            <span
                              key={idx}
                              className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                            >
                              {kc}
                            </span>
                          ))}
                        </div>
                        <p className="mt-2 leading-relaxed">
                          <strong>Ideal Answer:</strong> {q.ideal_answer}
                        </p>
                        <p className="mt-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          Interview Tip: {q.communication_tips}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Past Sessions */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Your Past Mock Interview Sessions
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Track your scores and review previous question attempts.
            </p>

            <div className="mt-4 space-y-3">
              {pastSessions.length > 0 ? (
                pastSessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center dark:border-slate-800"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {s.category}
                        </span>
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          {s.role_target}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {s.completed_questions} of {s.total_questions} questions answered • {new Date(s.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                          {s.overall_score || "N/A"}/10
                        </span>
                        <p className="text-[10px] text-slate-400">Average Score</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-xs text-slate-400">
                  No mock sessions recorded yet. Start your first session above!
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
