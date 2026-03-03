const USE_CASE_SHORT_NAMES: Record<string, string> = {
  "announce an event": "Event announce",
  "recap an event": "Event recap",
  "present a webinar/program": "Webinar / Program",
  "share internal initiative": "Internal initiative",
  "promote open positions": "Job opening",
  "welcome new employee": "New hire welcome",
  "spotlight an employee/team": "Employee spotlight",
  "present an offer/product": "Product presentation",
  "showcase a customer success story": "Customer story",
  "present company strategy": "Company strategy",
  "share results or statistics or performance": "Results & stats",
  "share company values": "Company values",
  "share tips and tricks": "Tips & tricks",
  "promote a product": "Product promo",
  "share news": "Company news",
  "explain a process": "Process explainer",
  "train employees": "Employee training",
  "educate on a topic": "Education",
  "share a testimonial": "Testimonial",
  "introduce a new tool or feature": "New tool / Feature",
  "react to current events": "Current events",
  "celebrate milestone": "Milestone",
  "tutorial": "Tutorial",
  "express opinion (pov)": "Opinion / POV",
  "promote a service": "Service promo",
  "other": "Other",
};

export function shortUseCaseName(fullName: string): string {
  return USE_CASE_SHORT_NAMES[fullName] || fullName;
}
