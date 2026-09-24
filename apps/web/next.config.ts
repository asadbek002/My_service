import path from 'node:path';
import type {NextConfig}from'next';
// Trace from the monorepo root so workspace packages end up in the standalone bundle.
const nextConfig:NextConfig={reactStrictMode:true,output:'standalone',outputFileTracingRoot:path.join(__dirname,'../../')};
export default nextConfig;
