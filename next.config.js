/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // API routes need the raw body for Twilio signature validation.
  // We disable Next's default body parsing per-route instead (see route configs).
  poweredByHeader: false,
};

module.exports = nextConfig;
