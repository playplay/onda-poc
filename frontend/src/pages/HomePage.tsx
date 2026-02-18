import ScrapeForm from "../components/ScrapeForm";

export default function HomePage() {
  return (
    <div className="py-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-1">
          Discover LinkedIn Trends
        </h2>
        <p className="text-sm text-gray-400">
          Scrape, rank, and analyze content trends with AI
        </p>
      </div>
      <ScrapeForm />
    </div>
  );
}
