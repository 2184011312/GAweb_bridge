const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/mcp-server.js',
  sourcemap: true,
  external: ['@modelcontextprotocol/sdk', 'ws']
}).catch(() => process.exit(1));
