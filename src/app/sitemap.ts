import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, lastModified, changeFrequency: "hourly", priority: 1 },
    { url: `${siteUrl}/signals`, lastModified, changeFrequency: "hourly", priority: 0.9 },
    { url: `${siteUrl}/marketplace`, lastModified, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/tutorials`, lastModified, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/observation`, lastModified, changeFrequency: "daily", priority: 0.7 },
    { url: `${siteUrl}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/risk-disclosure`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
  return staticPages;
}