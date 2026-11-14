import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  logging: { incomingRequests: { ignore: [/(?:^|\/)api\/calendar\//] } },
  // Preserve this repository's existing AGENTS.md and context kit verbatim.
  agentRules: false,
};

export default nextConfig;
