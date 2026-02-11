import { useState, useEffect, useMemo, useCallback } from "react";
import type {
  Post,
  GeminiAnalysis,
  AnalysisRow,
  AnalysisFilterKey,
  AnalysisFilterState,
} from "../types";
import { ANALYSIS_FILTERABLE_FIELDS } from "../types";
import AnalysisFilters from "./AnalysisFilters";
import AnalysisTable from "./AnalysisTable";

interface Props {
  open: boolean;
  onClose: () => void;
  posts: Post[];
  analyses: GeminiAnalysis[];
  loading?: boolean;
}

const EMPTY_FILTERS: AnalysisFilterState = Object.fromEntries(
  ANALYSIS_FILTERABLE_FIELDS.map((k) => [k, ""])
) as AnalysisFilterState;

export default function AnalysisModal({
  open,
  onClose,
  posts,
  analyses,
  loading,
}: Props) {
  const [filters, setFilters] = useState<AnalysisFilterState>(EMPTY_FILTERS);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Merge posts with analyses
  const rows: AnalysisRow[] = useMemo(() => {
    const analysisMap = new Map<string, GeminiAnalysis>();
    for (const a of analyses) {
      analysisMap.set(a.post_id, a);
    }
    return posts.map((post) => ({
      post,
      analysis: analysisMap.get(post.id) ?? null,
    }));
  }, [posts, analyses]);

  // Apply filters
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!row.analysis) return true; // show pending rows always
      for (const key of ANALYSIS_FILTERABLE_FIELDS) {
        const filterVal = filters[key];
        if (!filterVal) continue;
        const cellVal = row.analysis[key as keyof GeminiAnalysis];
        if (typeof cellVal === "string" && cellVal !== filterVal) return false;
        if (typeof cellVal === "boolean") continue; // booleans aren't filtered via dropdowns
      }
      return true;
    });
  }, [rows, filters]);

  const handleFilterChange = useCallback(
    (key: AnalysisFilterKey, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleReset = useCallback(() => {
    setFilters(EMPTY_FILTERS);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-[95vw] max-h-[90vh] w-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold">Trend Analysis</h2>
            <span className="text-sm text-gray-500">
              {filteredRows.length} of {rows.length} posts
            </span>
            {loading && (
              <div className="flex items-center gap-2 text-sm text-purple-600">
                <div className="animate-spin w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full" />
                Analyzing…
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2"
          >
            ✕
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b bg-gray-50 shrink-0">
          <AnalysisFilters
            filters={filters}
            onChange={handleFilterChange}
            onReset={handleReset}
          />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-hidden px-2 py-2">
          <AnalysisTable rows={filteredRows} loading={loading} />
        </div>
      </div>
    </div>
  );
}
