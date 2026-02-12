export interface ScrapeRequest {
  search_query: string;
  sector: string | null;
  content_type_filter: string | null;
  is_corporate: boolean;
  organization: string | null;
  max_results: number;
}

export interface ScrapeJob {
  id: string;
  search_query: string;
  sector: string | null;
  content_type_filter: string | null;
  is_corporate: boolean;
  max_results: number;
  status: "pending" | "running" | "downloading_videos" | "completed" | "failed";
  total_posts: number | null;
  apify_run_id: string | null;
  video_download_run_id: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Post {
  id: string;
  scrape_job_id: string;
  title: string | null;
  author_name: string | null;
  author_company: string | null;
  sector: string | null;
  platform: string;
  content_type: string | null;
  format_family: string | null;
  format_variation: string | null;
  reactions: number;
  comments: number;
  shares: number;
  clicks: number;
  impressions: number;
  engagement_score: number;
  post_url: string | null;
  video_url: string | null;
  image_url: string | null;
  duration_seconds: number | null;
  publication_date: string | null;
  created_at: string;
}

export interface RankedTrend {
  rank: number;
  format_family: string;
  post_count: number;
  avg_engagement_score: number;
  top_posts: Post[];
}

export interface GeminiAnalysis {
  id: string;
  post_id: string;
  business_objective: string | null;
  use_case: string | null;
  audience_target: string | null;
  tone_of_voice: string | null;
  content_style: string | null;
  storytelling_approach: string | null;
  creative_execution: string | null;
  icp: string | null;
  script_hook: string | null;
  script_outline: string | null;
  script_cta: string | null;
  voice_language: string | null;
  text_language: string | null;
  contains_an_interview_footage: boolean | null;
  video_dynamism: string | null;
  full_analysis: Record<string, unknown> | null;
  created_at: string;
}

// --- Analysis progress types ---

export interface AnalysisStartResult {
  total: number;
  pending: number;
}

export interface AnalysisProgressResult {
  processed: number;
  total: number;
  all_done: boolean;
  current_analysis: GeminiAnalysis | null;
}

// --- Analysis Modal types ---

export interface AnalysisRow {
  post: Post;
  analysis: GeminiAnalysis | null;
}

export const ANALYSIS_FILTERABLE_FIELDS = [
  "business_objective",
  "use_case",
  "audience_target",
  "tone_of_voice",
  "content_style",
  "storytelling_approach",
  "creative_execution",
  "icp",
  "voice_language",
  "text_language",
  "video_dynamism",
] as const;

export type AnalysisFilterKey = (typeof ANALYSIS_FILTERABLE_FIELDS)[number];
export type AnalysisFilterState = Record<AnalysisFilterKey, string>;

export const ANALYSIS_FILTER_LABELS: Record<AnalysisFilterKey, string> = {
  business_objective: "Objective",
  use_case: "Use Case",
  audience_target: "Audience",
  tone_of_voice: "Tone",
  content_style: "Style",
  storytelling_approach: "Story",
  creative_execution: "Execution",
  icp: "ICP",
  voice_language: "Voice Lang",
  text_language: "Text Lang",
  video_dynamism: "Dynamism",
};

export const ANALYSIS_ENUM_OPTIONS: Record<AnalysisFilterKey, string[]> = {
  business_objective: [
    "awareness", "engagement", "education", "conversion", "loyalty",
    "onboarding", "retention", "internal alignment", "internal training",
    "thought leadership", "brand employer visibility", "advocacy",
    "recruitment", "brand culture or initiatives", "other",
  ],
  use_case: [
    "announce an event", "recap an event", "present a webinar/program",
    "share internal initiative", "promote open positions", "welcome new employee",
    "spotlight an employee/team", "present an offer/product",
    "showcase a customer success story", "present company strategy",
    "share results or statistics or performance", "share company values",
    "share tips and tricks", "promote a product", "share news",
    "explain a process", "train employees", "educate on a topic",
    "share a testimonial", "introduce a new tool or feature",
    "react to current events", "celebrate milestone", "tutorial",
    "express opinion (pov)", "promote a service", "other",
  ],
  audience_target: [
    "employees (internal video)", "customers", "prospects", "partners",
    "candidates", "investors", "media", "general public",
    "leadership/executives", "community (fans/followers)", "students", "other",
  ],
  tone_of_voice: [
    "none", "friendly", "formal", "inspirational", "corporate", "fun",
    "educational", "dynamic", "empowering", "trustworthy", "humorous",
    "empathetic", "authoritative", "celebratory", "provocative", "neutral", "other",
  ],
  content_style: [
    "none", "informative", "narrative/personal journey", "instructional",
    "entertaining", "persuasive", "reactive", "explainer", "highlight reel",
    "testimonial", "interview-based", "trend-based", "emotional", "other",
  ],
  storytelling_approach: [
    "text-based/motion based", "footage based", "voiceover-based", "music-based",
  ],
  creative_execution: [
    "report presentation", "multi-single person snippets", "q&a solo talking",
    "short documentary", "multi-interview snippets", "highlight reel",
    "music based teaser", "long documentary", "two person interview",
    "animated explainer", "expert walkthrough", "snack solo talking",
    "video commentary", "embodied news", "voice-over on media",
    "tutorial, screencast", "webinar recording", "testimonial self-recorded",
    "speaking with animated waveform", "other",
  ],
  icp: [
    "community management", "corporate communication", "hr & employer brand",
    "internal communication", "marketing", "training", "sales",
    "media journalist", "other",
  ],
  voice_language: ["none", "en-us", "fr-fr", "de-de", "others"],
  text_language: ["en-us", "fr-fr", "de-de", "others", "none"],
  video_dynamism: ["slow", "medium", "fast"],
};

// LinkedIn official industry taxonomy (V2, aligned with NAICS)
export const LINKEDIN_INDUSTRIES = [
  "Accommodation Services",
  "Accounting",
  "Administrative and Support Services",
  "Advertising Services",
  "Agriculture, Construction, Mining Machinery Manufacturing",
  "Air Transportation",
  "Alternative Medicine",
  "Animation and Post-production",
  "Apparel Manufacturing",
  "Architecture and Planning",
  "Armed Forces",
  "Artists and Writers",
  "Audio and Video Equipment Manufacturing",
  "Automation Machinery Manufacturing",
  "Aviation and Aerospace Component Manufacturing",
  "Banking",
  "Bars, Taverns, and Nightclubs",
  "Beverage Manufacturing",
  "Biotechnology Research",
  "Book and Periodical Publishing",
  "Breweries",
  "Broadcast Media Production and Distribution",
  "Building Construction",
  "Building Equipment Contractors",
  "Business Consulting and Services",
  "Capital Markets",
  "Chemical Manufacturing",
  "Civic and Social Organizations",
  "Civil Engineering",
  "Claims Adjusting, Actuarial Services",
  "Coal Mining",
  "Collection Agencies",
  "Commercial and Industrial Machinery Maintenance",
  "Communications Equipment Manufacturing",
  "Community Development and Urban Planning",
  "Community Services",
  "Computer Hardware Manufacturing",
  "Computer Networking Products",
  "Computers and Electronics Manufacturing",
  "Construction",
  "Consumer Services",
  "Dairy Product Manufacturing",
  "Dance Companies",
  "Data Infrastructure and Analytics",
  "Data Security Software Products",
  "Defense and Space Manufacturing",
  "Dentists",
  "Design Services",
  "Desktop Computing Software Products",
  "Distilleries",
  "E-Learning Providers",
  "Education",
  "Electric Lighting Equipment Manufacturing",
  "Electric Power Generation, Transmission and Distribution",
  "Electrical Equipment Manufacturing",
  "Electronic and Precision Equipment Maintenance",
  "Embedded Software Products",
  "Emergency and Relief Services",
  "Engineering Services",
  "Entertainment Providers",
  "Environmental Quality Programs",
  "Environmental Services",
  "Events Services",
  "Executive Offices",
  "Executive Search Services",
  "Fabricated Metal Products",
  "Facilities Services",
  "Family Planning Centers",
  "Farming",
  "Farming, Ranching, Forestry",
  "Fashion Accessories Manufacturing",
  "Financial Services",
  "Fine Arts Schools",
  "Fire Protection",
  "Fisheries",
  "Flight Training",
  "Food and Beverage Manufacturing",
  "Food and Beverage Services",
  "Footwear Manufacturing",
  "Forestry and Logging",
  "Freight and Package Transportation",
  "Fuel Cell Manufacturing",
  "Fundraising",
  "Furniture and Home Furnishings Manufacturing",
  "Gambling Facilities and Casinos",
  "Glass, Ceramics and Concrete Manufacturing",
  "Golf Courses and Country Clubs",
  "Government Administration",
  "Government Relations Services",
  "Graphic Design",
  "Health and Human Services",
  "Higher Education",
  "Holding Companies",
  "Home Health Care Services",
  "Horticulture",
  "Hospitality",
  "Hospitals",
  "Hospitals and Health Care",
  "Hotels and Motels",
  "Household Appliance Manufacturing",
  "Household Services",
  "Human Resources Services",
  "HVAC and Refrigeration Equipment Manufacturing",
  "IT Services and IT Consulting",
  "IT System Custom Software Development",
  "IT System Data Services",
  "IT System Design Services",
  "IT System Installation and Disposal",
  "IT System Operations and Maintenance",
  "IT System Testing and Evaluation",
  "IT System Training and Support",
  "Individual and Family Services",
  "Industrial Machinery Manufacturing",
  "Information Services",
  "Insurance",
  "Insurance Agencies and Brokerages",
  "Insurance Carriers",
  "International Affairs",
  "International Trade and Development",
  "Internet Marketplace Platforms",
  "Internet News",
  "Internet Publishing",
  "Investment Advice",
  "Investment Banking",
  "Investment Management",
  "Janitorial Services",
  "Landscaping Services",
  "Language Schools",
  "Laundry and Drycleaning Services",
  "Law Enforcement",
  "Law Practice",
  "Leasing Non-residential Real Estate",
  "Leasing Residential Real Estate",
  "Legal Services",
  "Legislative Offices",
  "Libraries",
  "Loan Brokers",
  "Machinery Manufacturing",
  "Manufacturing",
  "Market Research",
  "Marketing Services",
  "Meat Products Manufacturing",
  "Media Production",
  "Medical Equipment Manufacturing",
  "Medical Practices",
  "Mental Health Care",
  "Metal Ore Mining",
  "Military and International Affairs",
  "Mining",
  "Mobile Computing Software Products",
  "Mobile Food Services",
  "Mobile Gaming Apps",
  "Motor Vehicle Manufacturing",
  "Motor Vehicle Parts Manufacturing",
  "Movies, Videos and Sound",
  "Museums",
  "Musicians",
  "Nanotechnology Research",
  "Natural Gas Distribution",
  "Natural Gas Extraction",
  "Newspaper Publishing",
  "Non-profit Organizations",
  "Nonresidential Building Construction",
  "Nuclear Electric Power Generation",
  "Nursing Homes and Residential Care Facilities",
  "Office Administration",
  "Office Furniture and Fixtures Manufacturing",
  "Oil and Gas",
  "Oil Extraction",
  "Oil, Gas, and Mining",
  "Online Audio and Video Media",
  "Online and Mail-Order Retail",
  "Operations Consulting",
  "Optometrists",
  "Outsourcing and Offshoring Consulting",
  "Packaging and Containers Manufacturing",
  "Paint, Coating, and Adhesive Manufacturing",
  "Paper and Forest Product Manufacturing",
  "Pension Funds",
  "Performing Arts",
  "Performing Arts and Spectator Sports",
  "Personal Care Product Manufacturing",
  "Personal Care Services",
  "Pet Services",
  "Pharmaceutical Manufacturing",
  "Philanthropic Fundraising Services",
  "Photography",
  "Physical, Occupational and Speech Therapists",
  "Physicians",
  "Pipeline Transportation",
  "Plastics and Rubber Product Manufacturing",
  "Plastics Manufacturing",
  "Political Organizations",
  "Primary and Secondary Education",
  "Primary Metal Manufacturing",
  "Printing Services",
  "Professional Organizations",
  "Professional Services",
  "Professional Training and Coaching",
  "Public Health",
  "Public Policy Offices",
  "Public Relations and Communications Services",
  "Public Safety",
  "Rail Transportation",
  "Railroad Equipment Manufacturing",
  "Ranching",
  "Ranching and Fisheries",
  "Real Estate",
  "Real Estate and Equipment Rental Services",
  "Recreational Facilities",
  "Religious Institutions",
  "Renewable Energy Equipment Manufacturing",
  "Renewable Energy Power Generation",
  "Repair and Maintenance",
  "Research Services",
  "Residential Building Construction",
  "Restaurants",
  "Retail",
  "Retail Apparel and Fashion",
  "Retail Art Dealers",
  "Retail Books and Printed News",
  "Retail Building Materials and Garden Equipment",
  "Retail Florists",
  "Retail Furniture and Home Furnishings",
  "Retail Gasoline",
  "Retail Groceries",
  "Retail Health and Personal Care Products",
  "Retail Luxury Goods and Jewelry",
  "Retail Motor Vehicles",
  "Retail Musical Instruments",
  "Retail Office Equipment",
  "Retail Office Supplies and Gifts",
  "Retail Recyclable Materials and Used Merchandise",
  "Savings Institutions",
  "Seafood Product Manufacturing",
  "Security and Investigations",
  "Security Guards and Patrol Services",
  "Security Systems Services",
  "Semiconductor Manufacturing",
  "Services for the Elderly and Disabled",
  "Shipbuilding",
  "Skiing Facilities",
  "Soap and Cleaning Product Manufacturing",
  "Software Development",
  "Solar Electric Power Generation",
  "Sound Recording",
  "Space Research and Technology",
  "Specialty Trade Contractors",
  "Spectator Sports",
  "Sporting Goods Manufacturing",
  "Sports Teams and Clubs",
  "Staffing and Recruiting",
  "Strategic Management Services",
  "Sugar and Confectionery Product Manufacturing",
  "Technical and Vocational Training",
  "Technology, Information and Internet",
  "Technology, Information and Media",
  "Telecommunications",
  "Telecommunications Carriers",
  "Telephone Call Centers",
  "Television Broadcasting",
  "Temporary Help Services",
  "Textile Manufacturing",
  "Theater Companies",
  "Think Tanks",
  "Tobacco Manufacturing",
  "Translation and Localization",
  "Transportation Equipment Manufacturing",
  "Transportation Programs",
  "Transportation, Logistics, Supply Chain and Storage",
  "Travel Arrangements",
  "Truck Transportation",
  "Trusts and Estates",
  "Utilities",
  "Utilities Administration",
  "Vehicle Repair and Maintenance",
  "Venture Capital and Private Equity Principals",
  "Veterinary Services",
  "Vocational Rehabilitation Services",
  "Warehousing and Storage",
  "Waste Collection",
  "Waste Treatment and Disposal",
  "Water, Waste, Steam, and Air Conditioning Services",
  "Wellness and Fitness Services",
  "Wholesale",
  "Wholesale Alcoholic Beverages",
  "Wholesale Apparel and Sewing Supplies",
  "Wholesale Building Materials",
  "Wholesale Chemical and Allied Products",
  "Wholesale Computer Equipment",
  "Wholesale Drugs and Sundries",
  "Wholesale Electronic Markets and Agents and Brokers",
  "Wholesale Food and Beverage",
  "Wholesale Furniture and Home Furnishings",
  "Wholesale Hardware, Plumbing, Heating Equipment",
  "Wholesale Import and Export",
  "Wholesale Luxury Goods and Jewelry",
  "Wholesale Machinery",
  "Wholesale Metals and Minerals",
  "Wholesale Motor Vehicles and Parts",
  "Wholesale Paper Products",
  "Wholesale Petroleum and Petroleum Products",
  "Wholesale Photography Equipment and Supplies",
  "Wholesale Recyclable Materials",
  "Wind Electric Power Generation",
  "Wineries",
  "Wireless Services",
  "Wood Product Manufacturing",
  "Writing and Editing",
  "Zoos and Botanical Gardens",
] as const;

export const CONTENT_TYPES = [
  { value: "", label: "All" },
  { value: "videos", label: "Videos" },
  { value: "photos", label: "Photos" },
  { value: "liveVideos", label: "Live Videos" },
  { value: "documents", label: "Documents" },
  { value: "collaborativeArticles", label: "Collaborative Articles" },
] as const;
