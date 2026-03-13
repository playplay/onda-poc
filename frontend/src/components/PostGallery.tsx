import type { Post } from "../types";
import PostCard from "./PostCard";

interface Props {
  posts: Post[];
  allScores: number[];
  accountNames?: Map<string, string>;
  accountTypes?: Map<string, "company" | "person">;
  showSector?: boolean;
  showUseCase?: boolean;
}

export default function PostGallery({ posts, allScores, accountNames, accountTypes, showSector, showUseCase }: Props) {
  if (posts.length === 0) {
    return <p className="text-gray-400 text-center py-8 text-sm">No posts found.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          allScores={allScores}
          accountTypes={accountTypes}
          accountNames={accountNames}
          showSector={showSector}
          showUseCase={showUseCase}
        />
      ))}
    </div>
  );
}
