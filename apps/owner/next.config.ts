import type { NextConfig } from 'next';

const config: NextConfig = {
  // Agent installer uploads can exceed the 10MB default (MSIs are ~65MB+).
  // Raise the cap for route handlers reading the request body.
  experimental: {
    proxyClientMaxBodySize: 250 * 1024 * 1024,
  },
};

export default config;
