#!/usr/bin/env node
/**
 * Arc Tunnel — Unified Start Script
 * Starts the MCP server with configurable port and optional debug mode.
 */

const { spawn } = require('child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MCP_SERVER = path.join(REPO_ROOT, 'mcp-server', 'dist', 'mcp-server.js');

const port = process.env.WS_PORT || process.argv.find((_, i, arr) => arr[i - 1] === '--port') || '8765';
const debug = process.argv.includes('--debug');

console.log(`[arc-tunnel] Starting MCP Server on port ${port}`);
console.log(`[arc-tunnel] Server path: ${MCP_SERVER}`);

const child = spawn('node', [MCP_SERVER], {
  env: { ...process.env, WS_PORT: String(port) },
  stdio: debug ? 'inherit' : ['ignore', 'pipe', 'pipe']
});

if (!debug) {
  child.stdout.on('data', (data) => {
    console.log(`[mcp-server] ${data.toString().trim()}`);
  });
  child.stderr.on('data', (data) => {
    console.error(`[mcp-server] ${data.toString().trim()}`);
  });
}

child.on('exit', (code) => {
  console.log(`[arc-tunnel] MCP Server exited with code ${code}`);
});

process.on('SIGINT', () => {
  console.log('[arc-tunnel] Shutting down...');
  child.kill('SIGINT');
});
