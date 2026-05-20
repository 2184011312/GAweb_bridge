const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/mcp-server.js',
  sourcemap: true
  // All deps bundled - no npm needed at runtime
}).catch(() => process.exit(1));
