import ScrapeForm from "../components/ScrapeForm";

export default function HomePage() {
  return (
    <div className="py-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Discover LinkedIn Trends
        </h2>
        <p className="text-gray-500">
          Scrape, rank, and analyze content trends with AI
        </p>
      </div>
      <ScrapeForm />
    </div>
  );
}
