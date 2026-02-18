export function getEngagementLabel(
  score: number,
  allScores: number[]
): { label: string; className: string } {
  if (allScores.length <= 1)
    return { label: "Neutral", className: "bg-gray-100 text-gray-500" };

  const sorted = [...allScores].sort((a, b) => a - b);
  const rank = sorted.filter((s) => s < score).length / sorted.length;

  if (rank >= 0.9)
    return { label: "Viral", className: "bg-accent-100 text-accent-700" };
  if (rank >= 0.5)
    return { label: "Engaging", className: "bg-gray-900 text-white" };
  return { label: "Neutral", className: "bg-gray-100 text-gray-500" };
}
