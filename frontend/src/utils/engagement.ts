interface PostEngagement {
  engagement_rate: number | null;
  author_follower_count: number | null;
  engagement_score: number;
}

/** Compute percentile rank of value in a sorted-asc array (0 to 1). */
function percentileRank(value: number, sortedAsc: number[]): number {
  if (sortedAsc.length <= 1) return 0.5;
  const below = sortedAsc.filter((s) => s < value).length;
  return below / (sortedAsc.length - 1);
}

export function getEngagementLabel(
  post: PostEngagement,
  allScores: number[]
): { label: string; className: string } {
  const rate = post.engagement_rate;
  const followers = post.author_follower_count;

  if (rate == null) {
    // Percentile-based for posts without follower data
    if (allScores.length <= 1)
      return { label: "Neutral", className: "bg-gray-100 text-gray-500" };

    const sorted = [...allScores].sort((a, b) => a - b);
    const rank = percentileRank(post.engagement_score, sorted);

    if (rank >= 0.9)
      return { label: "Viral", className: "bg-accent-100 text-accent-700" };
    if (rank >= 0.5)
      return { label: "Engaging", className: "bg-violet-100 text-violet-700" };
    return { label: "Neutral", className: "bg-gray-100 text-gray-500" };
  }

  // Tier-based thresholds
  let level: string;
  if (followers != null && followers >= 100_000) {
    level = rate > 2 ? "viral" : rate >= 0.5 ? "engaging" : "neutral";
  } else if (followers != null && followers >= 10_000) {
    level = rate > 3 ? "viral" : rate >= 1 ? "engaging" : "neutral";
  } else {
    level = rate > 5 ? "viral" : rate >= 2 ? "engaging" : "neutral";
  }

  if (level === "viral")
    return { label: "Viral", className: "bg-accent-100 text-accent-700" };
  if (level === "engaging")
    return { label: "Engaging", className: "bg-violet-100 text-violet-700" };
  return { label: "Neutral", className: "bg-gray-100 text-gray-500" };
}
