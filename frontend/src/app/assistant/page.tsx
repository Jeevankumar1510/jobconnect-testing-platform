"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  Briefcase,
  Code2,
  Compass,
  FileCheck,
  FileText,
  Layers,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import {
  clearCareerAssistantHistory,
  getCareerAssistantHistory,
  sendCareerAssistantChat,
} from "@/lib/api";
import type { ChatMessage } from "@/lib/types";

const AGENT_OPTIONS = [
  { id: "general", label: "Smart Auto-Router", icon: Sparkles, desc: "Intelligently routes your question to the best agent" },
  { id: "resume", label: "Resume Agent", icon: FileText, desc: "ATS score optimization and resume rewrites" },
  { id: "job", label: "Job Matching Agent", icon: Briefcase, desc: "Finds fresher-friendly jobs matching your exact skills" },
  { id: "career", label: "Career Guidance Agent", icon: Compass, desc: "Skill gap analysis, roadmaps & project ideas" },
  { id: "interview", label: "Interview Agent", icon: Code2, desc: "Technical question prep and answer evaluation" },
  { id: "application", label: "Application Tracker Agent", icon: Layers, desc: "Tracks your active job applications and next steps" },
];

const PRESET_PROMPTS = [
  "Which jobs match my resume?",
  "What skills am I missing for a Python developer role?",
  "How can I improve my ATS score?",
  "Generate a 30-day Python interview preparation plan.",
  "What projects should I build to get an AI Engineer job?",
  "What is the status of my applications?",
];

export default function CareerAssistantPage() {
  const { user, token, ready } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [selectedAgent, setSelectedAgent] = useState<string>("general");
  const [loading, setLoading] = useState<boolean>(false);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);
  
  // File upload state in Assistant chat
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history
  useEffect(() => {
    if (ready && token) {
      setHistoryLoading(true);
      getCareerAssistantHistory(token)
        .then((hist) => setMessages(hist))
        .catch(() => {})
        .finally(() => setHistoryLoading(false));
    } else if (ready && !token) {
      setHistoryLoading(false);
    }
  }, [ready, token]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function handleFileSelect(selectedFile: File | undefined) {
    if (!selectedFile) return;
    const ext = selectedFile.name.toLowerCase();
    if (!ext.endsWith(".pdf") && !ext.endsWith(".docx") && !ext.endsWith(".txt")) {
      setFileError("Please attach a PDF, DOCX, or TXT file.");
      return;
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      setFileError("File exceeds 5MB size limit. Please upload a smaller file.");
      return;
    }

    setFileError(null);
    setAttachedFile(selectedFile);
  }

  async function handleSend(promptText?: string) {
    const rawText = promptText || input;
    const fileToSend = attachedFile;

    // Must have text or an attached file, and user must be signed in
    if ((!rawText.trim() && !fileToSend) || !token) return;

    const effectiveText = rawText.trim() || (fileToSend ? "Please analyze this attached document and provide career guidance." : "");
    const displayContent = fileToSend
      ? `📄 Attached: ${fileToSend.name}\n\n${effectiveText}`
      : effectiveText;

    const userMsg: ChatMessage = {
      id: Date.now(),
      role: "user",
      agent_type: selectedAgent,
      content: displayContent,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!promptText) setInput("");
    setAttachedFile(null);
    setFileError(null);
    setLoading(true);

    try {
      const res = await sendCareerAssistantChat(effectiveText, token, selectedAgent, fileToSend);
      setMessages((prev) => [...prev, res]);
    } catch (err: unknown) {
      const errorMsg: ChatMessage = {
        id: Date.now() + 1,
        role: "assistant",
        agent_type: selectedAgent,
        content: "Sorry, I encountered a temporary connection issue. Please make sure the backend is active.",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }

  async function handleClearHistory() {
    if (!token) return;
    try {
      await clearCareerAssistantHistory(token);
      setMessages([]);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-6xl flex-col px-4 py-4 sm:py-6">
      {/* Top Bar */}
      <div className="mb-4 flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-sm">
            <Bot size={22} />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-white sm:text-base">
              AI Career Assistant (RAG Multi-Agent Copilot)
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Grounded in your profile, attached documents, and real-time IT job openings in India.
            </p>
          </div>
        </div>

        {/* Agent Dropdown Selector & Clear */}
        <div className="flex items-center gap-2">
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
          >
            {AGENT_OPTIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>

          {messages.length > 0 && (
            <button
              onClick={handleClearHistory}
              title="Clear chat history"
              className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 hover:text-rose-500 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Chat Messages Container */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/50 p-4 shadow-inner dark:border-slate-800 dark:bg-slate-950/40">
        {historyLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={24} className="animate-spin text-blue-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100/60 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <Sparkles size={28} />
            </div>
            <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">
              How can I accelerate your fresher career today?
            </h3>
            <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
              Ask any question about your resume, matched jobs, skill gaps, or attach a document below for deep document-grounded career insights.
            </p>

            {/* Quick Prompt Pills */}
            <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
              {PRESET_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(prompt)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition-all hover:border-blue-500 hover:bg-blue-50/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-500/50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, idx) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={idx}
                  className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-2xs">
                      <Bot size={16} />
                    </div>
                  )}

                  <div
                    className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed ${
                      isUser
                        ? "bg-blue-600 text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-800 shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                    }`}
                  >
                    {!isUser && msg.agent_type && (
                      <span className="mb-1.5 inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                        {msg.agent_type.toUpperCase()} AGENT
                      </span>
                    )}

                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>

                  {isUser && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      <User size={16} />
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <Bot size={16} />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin text-blue-600" />
                    Retrieving profile, attached document & job knowledge…
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Form Bar with File Attachment */}
      <div className="mt-3">
        {/* Attached File Preview Pill */}
        {attachedFile && (
          <div className="mb-2 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/80 px-3 py-1.5 text-xs dark:border-blue-900/40 dark:bg-blue-950/40">
            <div className="flex items-center gap-2 truncate">
              <FileCheck size={15} className="text-blue-600 shrink-0" />
              <span className="font-semibold text-blue-950 dark:text-blue-200 truncate">
                Attached: {attachedFile.name}
              </span>
              <span className="text-[10px] text-blue-600/70 shrink-0">
                ({(attachedFile.size / 1024).toFixed(0)} KB)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAttachedFile(null)}
              className="p-0.5 text-blue-700 hover:text-rose-600 dark:text-blue-400 dark:hover:text-rose-400"
              title="Remove attachment"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* File Error Alert */}
        {fileError && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
            <AlertCircle size={14} className="shrink-0" />
            <span>{fileError}</span>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="relative flex items-center gap-2"
        >
          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files?.[0])}
          />

          {/* Attachment Paperclip Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || !token}
            title="Attach Resume, JD or Notes (.pdf, .docx, .txt)"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-300 bg-white text-slate-500 transition-all hover:border-blue-500 hover:bg-blue-50/50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-blue-500 dark:hover:text-blue-400 disabled:opacity-40"
          >
            <Paperclip size={18} />
          </button>

          {/* Text Input */}
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading || !token}
              placeholder={
                token
                  ? attachedFile
                    ? "Add a question about your attached file (or send as-is for general analysis)..."
                    : "Ask anything, or attach a resume/JD using the paperclip..."
                  : "Please sign in to chat with the AI Career Assistant."
              }
              className="w-full rounded-2xl border border-slate-300 bg-white py-3 pr-24 pl-4 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={loading || (!input.trim() && !attachedFile) || !token}
              className="absolute right-2 top-2 flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs transition-all hover:bg-blue-700 disabled:opacity-40"
            >
              <span>Send</span>
              <Send size={13} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
