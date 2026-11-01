import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Vibradex",
        short_name: "Vibradex",
        description: "Diagnostics & monitoring hub for the Vibranic suite",
        start_url: "/",
        display: "standalone",
        background_color: "#0b0e1c",
        theme_color: "#0b0e1c",
        icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}
