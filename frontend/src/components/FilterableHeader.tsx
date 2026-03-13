import { useState, useEffect, useRef } from "react";

export function ChevronIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={`ml-1 transition-colors ${active ? "text-violet-600" : "text-gray-400"}`}
    >
      <path d="M2.5 3.75L5 6.25L7.5 3.75" />
    </svg>
  );
}

interface FilterableHeaderProps {
  label: string;
  column: string;
  options: { value: string; label: string }[];
  activeValue: string;
  onSelect: (v: string) => void;
  openFilter: string | null;
  setOpenFilter: (v: string | null) => void;
  showSearch?: boolean;
  searchOnly?: boolean;
}

export function FilterableHeader({
  label, column, options, activeValue, onSelect,
  openFilter, setOpenFilter, showSearch, searchOnly,
}: FilterableHeaderProps) {
  const ref = useRef<HTMLTableHeaderCellElement>(null);
  const [search, setSearch] = useState("");
  const isOpen = openFilter === column;
  const isActive = !!activeValue;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenFilter(null);
        setSearch("");
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, setOpenFilter]);

  const opts = showSearch && search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <th className="text-left px-4 py-2 font-medium text-gray-600 relative" ref={ref}>
      <button
        onClick={() => { setOpenFilter(isOpen ? null : column); setSearch(""); }}
        className={`inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors ${
          isActive ? "text-violet-600 font-semibold" : ""
        }`}
      >
        {label}
        <ChevronIcon active={isActive} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[180px] py-1">
          {searchOnly ? (
            <div className="px-2 py-1.5">
              <input
                type="text"
                value={activeValue}
                onChange={(e) => onSelect(e.target.value)}
                placeholder="Type to filter…"
                autoFocus
                className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
              />
              {activeValue && (
                <button
                  onClick={() => { onSelect(""); setOpenFilter(null); }}
                  className="mt-1 text-xs text-gray-400 hover:text-gray-600"
                >
                  Clear
                </button>
              )}
            </div>
          ) : (
            <>
              {showSearch && (
                <div className="px-2 py-1.5">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search…"
                    autoFocus
                    className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
                  />
                </div>
              )}
              <button
                onClick={() => { onSelect(""); setOpenFilter(null); setSearch(""); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${
                  !activeValue ? "text-violet-600 font-medium" : "text-gray-500"
                }`}
              >
                All
              </button>
              <div className="max-h-[240px] overflow-y-auto">
                {opts.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => { onSelect(o.value); setOpenFilter(null); setSearch(""); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${
                      activeValue === o.value ? "text-violet-600 font-medium bg-violet-50" : "text-gray-700"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </th>
  );
}
