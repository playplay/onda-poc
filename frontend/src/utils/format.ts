export const FORMAT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  video:     { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  carousel:  { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200" },
  image:     { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  images:    { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  gif:       { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" },
  text:      { bg: "bg-gray-50",   text: "text-gray-500",   border: "border-gray-200" },
};

export function normalizeFormat(format: string | null): string | null {
  if (!format) return null;
  const key = format.toLowerCase();
  if (key === "short_video" || key === "long_video") return "video";
  return key;
}

export function getFormatStyle(format: string | null) {
  const key = normalizeFormat(format);
  if (!key) return FORMAT_COLORS.text;
  return FORMAT_COLORS[key] || FORMAT_COLORS.text;
}

export const FORMAT_LABELS: Record<string, string> = {
  image: "Image",
  images: "Images",
  gif: "GIF",
  video: "Video",
  carousel: "Carousel",
  text: "Text",
};

export function formatLabel(fmt: string) {
  return FORMAT_LABELS[fmt] || fmt.charAt(0).toUpperCase() + fmt.slice(1);
}
