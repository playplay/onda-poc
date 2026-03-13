import { useState, useRef, useEffect } from "react";

interface Props {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (val: string) => void;
  onClear: () => void;
  displayFn?: (val: string) => string;
  countMap?: Map<string, number>;
  className?: string;
}

export default function FilterDropdown({ label, options, selected, onToggle, onClear, displayFn, countMap, className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [open]);

  const sorted = countMap
    ? [...options].sort((a, b) => (countMap.get(b) || 0) - (countMap.get(a) || 0))
    : options;

  const disabled = options.length === 0;

  return (
    <div className={`relative ${className ?? ""}`} ref={ref}>
      <button
        onClick={() => !disabled && setOpen(!open)}
        className={`w-full px-3.5 py-1.5 text-xs rounded-md border transition-colors inline-flex items-center gap-1.5 ${
          disabled
            ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
            : selected.size > 0
              ? "bg-gray-50 text-gray-900 border-gray-300 font-medium"
              : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
        }`}
      >
        <span className="truncate">{label}{selected.size > 0 ? ` (${selected.size})` : ""}</span>
        <svg className={`w-3 h-3 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-72 max-h-72 overflow-y-auto">
          {sorted.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={selected.has(opt)}
                onChange={() => onToggle(opt)}
                className="rounded border-gray-300 text-gray-700 focus:ring-gray-400 w-3 h-3"
              />
              <span className="truncate flex-1">{displayFn ? displayFn(opt) : opt}</span>
              {countMap && (
                <span className="text-gray-400 shrink-0 text-[10px]">{countMap.get(opt) || 0}</span>
              )}
            </label>
          ))}
          {selected.size > 0 && (
            <button
              onClick={onClear}
              className="w-full text-left px-3 py-1 text-xs text-gray-500 hover:bg-gray-50 border-t border-gray-100"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
