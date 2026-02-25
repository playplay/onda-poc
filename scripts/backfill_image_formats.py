"""
One-time backfill: reclassify format_family for existing 'image' posts
into 'image', 'images', or 'gif' based on raw_data image count and HEAD request.
"""

import asyncio
import httpx
from sqlalchemy import select, update
from app.db import async_session
from app.models.post import Post


async def detect_gif(url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.head(url, follow_redirects=True)
            return "image/gif" in resp.headers.get("content-type", "").lower()
    except Exception:
        return False


async def main():
    async with async_session() as db:
        result = await db.execute(
            select(Post).where(Post.format_family == "image")
        )
        posts = list(result.scalars().all())
        print(f"Found {len(posts)} posts with format_family='image'")

        updates = {"image": 0, "images": 0, "gif": 0}

        for i, post in enumerate(posts):
            raw = post.raw_data or {}

            # Bright Data posts have "images" list, Apify posts have "postImages" list
            bd_images = raw.get("images") or []
            apify_images = raw.get("postImages") or []
            image_count = len(bd_images) or len(apify_images)

            if image_count >= 2:
                post.format_family = "images"
                updates["images"] += 1
            elif image_count == 1:
                # Check if it's a GIF
                url = bd_images[0] if bd_images else (apify_images[0].get("url") if apify_images else None)
                if url and await detect_gif(url):
                    post.format_family = "gif"
                    updates["gif"] += 1
                else:
                    updates["image"] += 1
            else:
                # No image list in raw_data, keep as image
                updates["image"] += 1

            if (i + 1) % 20 == 0:
                print(f"  Processed {i + 1}/{len(posts)}...")

        await db.commit()
        print(f"\nDone! Results: {updates}")


if __name__ == "__main__":
    asyncio.run(main())
