import type { NextConfig } from "next";
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  // This line fixes the Supabase import error by forcing Next.js to bundle it correctly
  transpilePackages: ['@supabase/supabase-js'],
};

export default withPWA(nextConfig);
