import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { ScrapeJob } from "../types";
import { listScrapeJobs } from "../api/client";

type JobTab = "weekly" | "custom" | "link";

const IN_PROGRESS_STATUSES = ["pending", "running", "downloading_videos"];

function jobTab(job: ScrapeJob): JobTab {
  if (!job.is_custom_search) return "weekly";
  if (job.custom_account_name === "Imported post") return "link";
  return "custom";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    }) + ", " + new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function durationMinutes(job: ScrapeJob): string | null {
  if (!job.completed_at || !job.created_at) return null;
  const ms = new Date(job.completed_at).getTime() - new Date(job.created_at).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "< 1 min";
  return `${mins} min`;
}

function StatusBadge({ status }: { status: ScrapeJob["status"] }) {
  if (status === "completed") {
    return (
      <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-50 text-green-700">
        Done
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">
        Failed
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 flex items-center gap-1">
      <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Running…
    </span>
  );
}

function JobCard({ job, onClick }: { job: ScrapeJob; onClick: () => void }) {
  const dur = durationMinutes(job);
  const title = job.is_custom_search
    ? (job.custom_account_name || job.custom_account_url || "Search")
    : (job.sector ? job.sector : "All sectors");

  return (
    <button
      onClick={onClick}
      className="text-left border border-gray-200 rounded-xl p-5 bg-white shadow-sm hover:shadow-md hover:border-violet-200 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate flex-1">
          {title}
        </h3>
        <StatusBadge status={job.status} />
      </div>

      {job.scraper_backend && (
        <p className="text-xs text-gray-400 mb-2 truncate">{job.scraper_backend}</p>
      )}

      {job.user_email && (
        <p className="text-xs text-gray-400 mb-2 truncate">{job.user_email}</p>
      )}

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="font-medium text-gray-700">{job.total_posts ?? 0} posts</span>
        {dur && (
          <>
            <span className="text-gray-200">·</span>
            <span>{dur}</span>
          </>
        )}
        <span className="text-gray-200">·</span>
        <span>{formatDate(job.created_at)}</span>
      </div>
    </button>
  );
}

const TAB_LABELS: { id: JobTab; label: string }[] = [
  { id: "weekly", label: "Weekly Scrape" },
  { id: "custom", label: "Custom Search" },
  { id: "link", label: "From a Link" },
];

export default function ScrapeHistoryPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<JobTab>("weekly");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadJobs = () => {
    return listScrapeJobs(100)
      .then((data) => setJobs(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadJobs();
  }, []);

  // Auto-refresh when any job is running
  useEffect(() => {
    const hasRunning = jobs.some((j) => IN_PROGRESS_STATUSES.includes(j.status));
    if (hasRunning) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => loadJobs(), 8000);
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [jobs]);

  const visibleJobs = jobs.filter((j) => jobTab(j) === activeTab);

  return (
    <div>
      {/* Hero header */}
      <div
        className="-mx-6 -mt-8 px-6 pt-8 pb-6 mb-6 rounded-b-2xl"
        style={{ background: "linear-gradient(135deg, #faeefa 0%, #ffeef1 50%, #fff4ec 100%)" }}
      >
        <h1 className="text-2xl font-bold text-gray-900">Scrape History</h1>
        <p className="text-sm text-gray-500 mt-1">Monitor weekly scrapes, custom searches and link imports</p>
      </div>

      {/* Tabs + refresh */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1 border-b border-gray-200">
          {TAB_LABELS.map((t) => {
            const count = jobs.filter((j) => jobTab(j) === t.id).length;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === t.id
                    ? "border-violet-600 text-violet-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
                <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => { setLoading(true); loadJobs(); }}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors px-3 py-1.5 rounded-md border border-gray-200 hover:border-gray-300"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-center text-gray-400 text-sm py-16">Loading...</p>
      ) : visibleJobs.length === 0 ? (
        <div className="py-20 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-gray-400">No {activeTab === "weekly" ? "weekly scrapes" : activeTab === "custom" ? "custom searches" : "link imports"} yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onClick={() => navigate(`/scrape-history/${job.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
