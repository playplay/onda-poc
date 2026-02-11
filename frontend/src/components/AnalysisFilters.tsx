import type { AnalysisFilterKey, AnalysisFilterState } from "../types";
import {
  ANALYSIS_FILTERABLE_FIELDS,
  ANALYSIS_FILTER_LABELS,
  ANALYSIS_ENUM_OPTIONS,
} from "../types";

interface Props {
  filters: AnalysisFilterState;
  onChange: (key: AnalysisFilterKey, value: string) => void;
  onReset: () => void;
}

export default function AnalysisFilters({ filters, onChange, onReset }: Props) {
  const hasActive = ANALYSIS_FILTERABLE_FIELDS.some((k) => filters[k] !== "");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ANALYSIS_FILTERABLE_FIELDS.map((field) => (
        <select
          key={field}
          value={filters[field]}
          onChange={(e) => onChange(field, e.target.value)}
          className={`text-xs border rounded px-2 py-1.5 ${
            filters[field]
              ? "border-purple-400 bg-purple-50 text-purple-700"
              : "border-gray-300 text-gray-600"
          }`}
        >
          <option value="">{ANALYSIS_FILTER_LABELS[field]}</option>
          {ANALYSIS_ENUM_OPTIONS[field].map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ))}
      {hasActive && (
        <button
          onClick={onReset}
          className="text-xs text-gray-500 hover:text-gray-700 underline ml-1"
        >
          Reset all
        </button>
      )}
    </div>
  );
}
