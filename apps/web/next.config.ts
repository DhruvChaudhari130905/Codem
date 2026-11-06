import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@codem/shared'],
  // packages/shared uses NodeNext-style `./x.js` imports that point at `.ts` sources.
  webpack(cfg) {
    cfg.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] }
    return cfg
  },
}
export default config
