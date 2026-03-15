import { useNavigate, useLocation } from "react-router-dom";

export default function AppSidebar({ isAdmin }: { isAdmin?: boolean }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const searchParams = new URLSearchParams(search);

  const currentTab = pathname === "/library" ? (searchParams.get("tab") ?? "library") : "";

  const navTo = (tab: string) => navigate(`/library?tab=${tab}`);

  return (
    <aside className="w-56 shrink-0 border-r border-gray-100 sticky top-[81px] h-[calc(100vh-81px)] overflow-y-auto flex flex-col py-3 bg-white">

      {/* Main nav */}
      <div className="space-y-0.5 px-2 mb-3">
        {/* Post Library */}
        <button
          onClick={() => navTo("library")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentTab === "library" ? "bg-violet-50 text-violet-700" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          Post Library
        </button>

        {/* My Portfolio */}
        <button
          onClick={() => navTo("portfolio")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentTab === "portfolio" ? "bg-violet-50 text-violet-700" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
          My Portfolio
        </button>

        {/* Favorites */}
        <button
          onClick={() => navTo("favorites")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentTab === "favorites" ? "bg-violet-50 text-violet-700" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
          Favorites
        </button>
        {/* Custom Search */}
        <button
          onClick={() => navTo("custom")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentTab === "custom" ? "bg-violet-50 text-violet-700" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" />
          </svg>
          Custom Search
        </button>
      </div>

      {/* Admin section */}
      {isAdmin && (
        <>
          <div className="mx-2 border-t border-gray-100 my-1" />
          <div className="space-y-0.5 px-2">
            <button
              onClick={() => navigate("/scrape-history")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith("/scrape-history") ? "bg-violet-50 text-violet-700" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Scrape History
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
