/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse is a CommonJS/Node lib; keep it server-only.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
