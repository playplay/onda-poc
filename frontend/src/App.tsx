import { Routes, Route, Link, useLocation } from "react-router-dom";
import HomePage from "./pages/HomePage";
import ResultsPage from "./pages/ResultsPage";
import TrendDetailPage from "./pages/TrendDetailPage";
import AdminPage from "./pages/AdminPage";

export default function App() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <Link to="/" className="text-xl font-semibold text-gray-900 tracking-tight hover:opacity-80">
              Onda
            </Link>
            <p className="text-xs text-gray-400 mt-0.5">LinkedIn Trend Intelligence</p>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link
              to="/"
              className={pathname === "/" ? "text-gray-900 font-medium" : "text-gray-500 hover:text-gray-900"}
            >
              Home
            </Link>
            <Link
              to="/admin"
              className={pathname === "/admin" ? "text-gray-900 font-medium" : "text-gray-500 hover:text-gray-900"}
            >
              Admin
            </Link>
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/results/:jobId" element={<ResultsPage />} />
          <Route path="/results/:jobId/trend/:rank" element={<TrendDetailPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}
