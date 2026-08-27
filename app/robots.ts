import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/auth", "/verify/"],
      disallow: [
        "/api/",
        "/dashboard",
        "/courses/",
        "/documents/",
        "/skills",
        "/work-lab",
        "/job-readiness",
        "/assessment",
        "/procurement-flow",
      ],
    },
  };
}
