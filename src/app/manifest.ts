import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Routine", short_name: "Routine", description: "Daily routine, streaks and friendly accountability",
    start_url: "/tasks", scope: "/", display: "standalone", orientation: "portrait",
    background_color: "#f6f3ee", theme_color: "#d8481f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
