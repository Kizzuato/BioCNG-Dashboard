import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Font dimuat dari Google Fonts dengan display swap agar tidak blocking render
// Di RPi: Next.js akan download dan cache font ini saat build
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",   // Tampilkan fallback font dulu, swap setelah font siap
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false, // Mono tidak critical, lazy load saja
});

export const metadata = {
  title: "BioCNG Dashboard",
  description: "Dashboard monitoring real-time sistem BioCNG — Flow, Pressure, Gas Purity",
};

// Next.js 15: viewport harus di export terpisah
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // Matikan zoom agar tidak ada layout shift di RPi
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        {/* Preconnect untuk mempercepat fetch resource */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Preload file Rive utama agar tersedia sebelum JS di-execute */}
        <link
          rel="preload"
          href="/rive/display_biocng.riv"
          as="fetch"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning={true}
      >
        {children}
      </body>
    </html>
  );
}
