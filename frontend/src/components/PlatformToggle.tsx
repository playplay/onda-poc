import { LinkedInIcon, InstagramIcon } from "./PostCard";

interface Props {
  value: "all" | "linkedin" | "instagram";
  onChange: (v: "all" | "linkedin" | "instagram") => void;
  counts?: { linkedin?: number; instagram?: number };
}

export default function PlatformToggle({ value, onChange, counts }: Props) {
  const items: { key: "all" | "linkedin" | "instagram"; label: React.ReactNode; active: string }[] = [
    { key: "all", label: "All", active: "bg-gray-100 text-gray-800" },
    {
      key: "linkedin",
      label: (
        <span className="inline-flex items-center gap-1">
          <LinkedInIcon className="w-3 h-3" />
          {counts?.linkedin != null && <span>{counts.linkedin}</span>}
        </span>
      ),
      active: "bg-blue-50 text-blue-700",
    },
    {
      key: "instagram",
      label: (
        <span className="inline-flex items-center gap-1">
          <InstagramIcon className="w-3 h-3" />
          {counts?.instagram != null && <span>{counts.instagram}</span>}
        </span>
      ),
      active: "bg-pink-50 text-pink-600",
    },
  ];

  return (
    <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
      {items.map((item, i) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={`px-2.5 py-1 text-xs font-medium transition-colors ${
            value === item.key
              ? item.active
              : "bg-white text-gray-500 hover:bg-gray-50"
          } ${i > 0 ? "border-l border-gray-200" : ""}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
