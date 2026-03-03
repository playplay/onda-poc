import { LinkedInIcon, InstagramIcon, TikTokIcon } from "./PostCard";

export type PlatformFilterValue = "all" | "linkedin" | "instagram" | "tiktok";

interface Props {
  value: PlatformFilterValue;
  onChange: (v: PlatformFilterValue) => void;
  counts?: { linkedin?: number; instagram?: number; tiktok?: number };
}

export default function PlatformToggle({ value, onChange, counts }: Props) {
  const items: { key: PlatformFilterValue; label: React.ReactNode; active: string }[] = [
    { key: "all", label: "All", active: "bg-gray-100 text-gray-800" },
    {
      key: "linkedin",
      label: (
        <span className="inline-flex items-center justify-center gap-1 min-w-[32px]">
          <LinkedInIcon className="w-3 h-3" />
          {counts?.linkedin != null && <span>{counts.linkedin}</span>}
        </span>
      ),
      active: "bg-blue-50 text-blue-700",
    },
    {
      key: "instagram",
      label: (
        <span className="inline-flex items-center justify-center gap-1 min-w-[32px]">
          <InstagramIcon className="w-3 h-3" />
          {counts?.instagram != null && <span>{counts.instagram}</span>}
        </span>
      ),
      active: "bg-pink-50 text-pink-600",
    },
    {
      key: "tiktok",
      label: (
        <span className="inline-flex items-center justify-center gap-1 min-w-[32px]">
          <TikTokIcon className="w-3 h-3" />
          {counts?.tiktok != null && <span>{counts.tiktok}</span>}
        </span>
      ),
      active: "bg-gray-100 text-black",
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
