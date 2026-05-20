const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Build background script
esbuild.build({
  entryPoints: ['src/background/service-worker.ts'],
  bundle: true,
  outfile: 'dist/background/service-worker.js',
  platform: 'browser',
  target: 'chrome96',
  format: 'esm'
});

// Build content script
esbuild.build({
  entryPoints: ['src/content/content-script.ts'],
  bundle: true,
  outfile: 'dist/content/content-script.js',
  platform: 'browser',
  target: 'chrome96'
});

// Build popup
esbuild.build({
  entryPoints: ['src/popup/popup.ts'],
  bundle: true,
  outfile: 'dist/popup/popup.js',
  platform: 'browser',
  target: 'chrome96'
});

// Copy static files
fs.cpSync('public', 'dist', { recursive: true });
