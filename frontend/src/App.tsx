import { useState, useEffect, useRef, useCallback } from "react";
import { Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { listScrapeJobs, deleteScrapeJob } from "./api/client";
import type { ScrapeJob } from "./types";
import ScrapeForm from "./components/ScrapeForm";
import ResultsPage from "./pages/ResultsPage";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";
import LibraryPage from "./pages/LibraryPage";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin h-3 w-3 ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

const IN_PROGRESS_STATUSES = ["pending", "running", "downloading_videos"];

function JobStatusLabel({ job }: { job: ScrapeJob }) {
  if (job.status === "completed") {
    const hasWarning = job.error_message?.startsWith("[Bright Data failed");
    return (
      <span className={`text-xs ${hasWarning ? "text-amber-500" : "text-gray-400"}`}>
        {formatDate(job.created_at)} · {job.total_posts ?? 0} posts{hasWarning ? " (partial)" : ""}
      </span>
    );
  }
  if (job.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-500">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
        Failed
      </span>
    );
  }
  const label = job.status === "downloading_videos" ? "Downloading..." : "Scraping...";
  return (
    <span className="inline-flex items-center gap-1 text-xs text-blue-500">
      <Spinner className="text-blue-500" />
      {label}
    </span>
  );
}

function EmptyHome({ onNewSearch }: { onNewSearch: () => void }) {
  return (
    <div className="py-16 text-center">
      <h2 className="text-2xl font-semibold text-gray-900 mb-2">
        Discover LinkedIn Trends
      </h2>
      <p className="text-sm text-gray-400 mb-6">
        Scrape, rank and analyze content trends with AI
      </p>
      <button
        onClick={onNewSearch}
        className="bg-violet-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-violet-700 transition-colors"
      >
        Launch your first search
      </button>
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [showNewSearch, setShowNewSearch] = useState(false);
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    axios.get("/api/auth/me", { withCredentials: true })
      .then(({ data }) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLogout = async () => {
    await axios.post("/api/auth/logout", {}, { withCredentials: true });
    setUser(null);
  };

  const refreshJobs = useCallback(() => {
    if (!user) return Promise.resolve();
    return listScrapeJobs(10)
      .then((data) => {
        setJobs(data);
        setJobsLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to load scrape jobs:", err);
        setJobsLoaded(true);
      });
  }, [user]);

  // Fetch jobs on navigation
  useEffect(() => {
    refreshJobs();
  }, [pathname, refreshJobs]);

  // Poll while any job is in progress
  useEffect(() => {
    const hasInProgress = jobs.some((j) => IN_PROGRESS_STATUSES.includes(j.status));

    if (hasInProgress) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          refreshJobs();
        }, 8000);
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
  }, [jobs, refreshJobs]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={() => {
      axios.get("/api/auth/me", { withCredentials: true })
        .then(({ data }) => setUser(data))
        .catch(() => setUser(null));
    }} />;
  }

  const handleJobCreated = async (jobId: string) => {
    setShowNewSearch(false);
    await refreshJobs();
    navigate(`/results/${jobId}`);
  };

  const handleDeleteJob = async () => {
    if (!deleteJobId || deleting) return;
    setDeleting(true);
    const idToDelete = deleteJobId;
    const wasViewing = pathname.startsWith(`/results/${idToDelete}`);
    try {
      await deleteScrapeJob(idToDelete);
      setDeleteJobId(null);
      const updatedJobs = await listScrapeJobs(10);
      setJobs(updatedJobs);
      if (wasViewing) {
        const next = updatedJobs[0];
        navigate(next ? `/results/${next.id}` : "/");
      }
    } catch (err) {
      console.error("Failed to delete job:", err);
      alert("Failed to delete this research. Please try again.");
      setDeleteJobId(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex flex-col items-start hover:opacity-80">
            <img src="/logo.png" alt="Onda" className="h-11 w-auto object-contain" />
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              to="/admin"
              className={pathname === "/admin" ? "text-gray-900 font-medium" : "text-gray-500 hover:text-gray-900"}
            >
              Admin
            </Link>
            <button
              onClick={() => setShowNewSearch(true)}
              className="bg-violet-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-violet-700 transition-colors"
            >
              New search
            </button>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Sign out"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 flex gap-8">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 hidden md:block border-r border-gray-200 pr-8">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            Last searches
          </h3>
          {jobs.length === 0 ? (
            <p className="text-xs text-gray-400 px-3">No searches yet</p>
          ) : (
            <ul className="space-y-1">
              {jobs.map((job) => {
                const isActive = pathname.startsWith(`/results/${job.id}`);
                return (
                  <li key={job.id} className="group relative">
                    <button
                      onClick={() => navigate(`/results/${job.id}`)}
                      className={`w-full text-left px-3 py-2 pr-7 rounded-lg text-sm transition-colors ${
                        isActive
                          ? "bg-gray-100 text-gray-900"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <span className="block font-medium truncate">{job.sector || job.search_query}</span>
                      <JobStatusLabel job={job} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteJobId(job.id); }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 transition-opacity text-gray-400 hover:text-red-500"
                      title="Delete"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <Routes>
            <Route
              path="/"
              element={
                !jobsLoaded ? (
                  <p className="text-center text-gray-400 py-8">Loading...</p>
                ) : jobs.length === 0 ? (
                  <EmptyHome onNewSearch={() => setShowNewSearch(true)} />
                ) : (
                  <LibraryPage />
                )
              }
            />
            <Route path="/results/:jobId" element={<ResultsPage jobs={jobs} refreshJobs={refreshJobs} />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </main>
      </div>

      {/* Delete confirmation modal */}
      {deleteJobId && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setDeleteJobId(null)}
        >
          <div
            className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-gray-700 mb-4">
              Are you sure you want to delete this research?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteJobId(null)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors"
              >
                No
              </button>
              <button
                onClick={handleDeleteJob}
                disabled={deleting}
                className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Yes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New search modal */}
      {showNewSearch && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setShowNewSearch(false)}
        >
          <div
            className="max-w-xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <ScrapeForm onJobCreated={handleJobCreated} />
          </div>
        </div>
      )}
    </div>
  );
}
