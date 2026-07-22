/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Performa & Optimasi untuk Raspberry Pi 4 ──────────────────────────────
  output: "standalone", // Build mandiri, lebih efisien di RPi 4
  compress: true,       // Aktifkan gzip compression

  // Izinkan semua origin untuk dev (berguna saat akses dari browser lain di jaringan lokal)
  allowedDevOrigins: ["*"],

  // Matikan source maps di production — hemat RAM & disk RPi
  productionBrowserSourceMaps: false,

  // Optimasi gambar — nonaktifkan optimasi server-side agar tidak membebani CPU RPi
  images: {
    unoptimized: true,
  },

  // Kurangi verbose log agar tidak membebani proses
  logging: {
    fetches: {
      fullUrl: false,
    },
  },

  // Headers untuk caching aset statis
  async headers() {
    return [
      {
        source: "/rive/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:path*.png",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=3600",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
