const config = { output: process.env.DOCKER_BUILD === 'true' ? 'standalone' : undefined, distDir: process.env.NEXT_BUILD_DIR || '.next', poweredByHeader: false,
  async headers() { return [{ source: '/(.*)', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'same-origin' }
  ] }]; }
};
export default config;
