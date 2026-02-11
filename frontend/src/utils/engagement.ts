export function getEngagementLabel(
  score: number,
  allScores: number[]
): { label: string; className: string } {
  if (allScores.length <= 1)
    return { label: "Normal", className: "bg-gray-100 text-gray-700" };

  const sorted = [...allScores].sort((a, b) => a - b);
  const rank = sorted.filter((s) => s < score).length / sorted.length;

  if (rank >= 0.9)
    return { label: "Viral", className: "bg-red-100 text-red-700" };
  if (rank >= 0.7)
    return { label: "Engaging", className: "bg-green-100 text-green-700" };
  if (rank >= 0.3)
    return { label: "Normal", className: "bg-gray-100 text-gray-700" };
  return { label: "Not engaging", className: "bg-orange-100 text-orange-700" };
}
