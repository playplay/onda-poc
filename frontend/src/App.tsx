import { useState, useEffect, useRef, useCallback } from "react";
import { Routes, Route, Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { listScrapeJobs } from "./api/client";
import type { ScrapeJob, UserInfo } from "./types";
import ScrapeForm from "./components/ScrapeForm";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";
import LibraryPage from "./pages/LibraryPage";
import AccountsPage from "./pages/AccountsPage";
import AppSidebar from "./components/AppSidebar";

const IN_PROGRESS_STATUSES = ["pending", "running", "downloading_videos"];

export default function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [showNewSearch, setShowNewSearch] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAdmin = user?.role === "admin";

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
    if (!user || !isAdmin) return Promise.resolve();
    return listScrapeJobs(10)
      .then((data) => setJobs(data))
      .catch((err) => console.error("Failed to load scrape jobs:", err));
  }, [user, isAdmin]);

  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  // Poll while any job is in progress (admin only)
  useEffect(() => {
    const hasInProgress = jobs.some((j) => IN_PROGRESS_STATUSES.includes(j.status));
    if (hasInProgress) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => refreshJobs(), 8000);
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

  const handleJobCreated = async (_jobId: string) => {
    setShowNewSearch(false);
    await refreshJobs();
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/library" className="hover:opacity-80 -ml-16">
            <img src="/logo.png" alt="Onda" className="h-14 w-auto object-contain" />
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {isAdmin ? (
              <Link
                to="/admin"
                className={pathname === "/admin" ? "text-gray-900 font-medium" : "text-gray-500 hover:text-gray-900"}
              >
                Admin
              </Link>
            ) : (
              <Link
                to="/accounts"
                className={pathname === "/accounts" ? "text-gray-900 font-medium" : "text-gray-500 hover:text-gray-900"}
              >
                Accounts
              </Link>
            )}
            {isAdmin && (
              <button
                onClick={() => setShowNewSearch(true)}
                className="bg-violet-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-violet-700 transition-colors"
              >
                New search
              </button>
            )}
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

      <div className="max-w-[1400px] mx-auto flex">
        {/* Sidebar — shown on library and accounts pages */}
        {(pathname === "/library" || pathname === "/accounts") && <AppSidebar />}

        {/* Main content */}
        <div className="flex-1 min-w-0 px-6 py-8">
          <Routes>
            <Route path="/" element={<Navigate to="/library" replace />} />
            <Route path="/library" element={<LibraryPage userRole={user.role} />} />
            <Route path="/accounts" element={<AccountsPage userRole={user.role} userEmail={user.email} />} />
            <Route path="/admin" element={isAdmin ? <AdminPage userEmail={user.email} /> : <Navigate to="/library" replace />} />
            <Route path="*" element={<Navigate to="/library" replace />} />
          </Routes>
        </div>
      </div>

      {/* New search modal (admin only) */}
      {showNewSearch && isAdmin && (
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
