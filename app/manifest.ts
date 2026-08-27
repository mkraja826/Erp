import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ERP Edu",
    short_name: "ERP Edu",
    description:
      "Learn SAP by doing with verified practice, simulated work experience, and job-readiness evidence.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fb",
    theme_color: "#6c52ff",
    categories: ["education", "productivity"],
  };
}
