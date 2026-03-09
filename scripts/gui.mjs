#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRun, getRun } from './run-manager.mjs';
import { discoverCatalog } from './discovery.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const guiRoot = path.join(projectRoot, 'gui');

function detectOpenClawInstalled() {
  if (process.platform === 'win32') {
    const result = spawnSync('cmd', ['/c', 'where openclaw'], { stdio: 'ignore' });
    return result.status === 0;
  }

  const shellChecks = [
    ['/bin/zsh', ['-lc', 'command -v openclaw >/dev/null 2>&1']],
    ['/bin/bash', ['-lc', 'command -v openclaw >/dev/null 2>&1']],
  ];

  for (const [cmd, args] of shellChecks) {
    const result = spawnSync(cmd, args, { stdio: 'ignore' });
    if (result.status === 0) return true;
  }

  const candidates = [
    path.join(process.env.HOME || '', '.nvm/versions/node/v22.22.0/bin/openclaw'),
    '/usr/local/bin/openclaw',
    '/opt/homebrew/bin/openclaw',
  ].filter(Boolean);

  return candidates.some((candidate) => {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function text(res, status, data, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(data);
}

function notFound(res) {
  text(res, 404, 'Not found');
}

function openBrowser(url) {
  const options = { detached: true, stdio: 'ignore' };
  try {
    if (process.platform === 'darwin') {
      spawn('open', [url], options).unref();
      return;
    }
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], options).unref();
      return;
    }
    spawn('xdg-open', [url], options).unref();
  } catch (error) {
    console.error(`[openclawdeploy-gui] 无法自动打开浏览器，请手动访问：${url}`);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/') {
      const html = fs.readFileSync(path.join(guiRoot, 'index.html'), 'utf8');
      return text(res, 200, html, 'text/html; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/app.js') {
      const js = fs.readFileSync(path.join(guiRoot, 'app.js'), 'utf8');
      return text(res, 200, js, 'application/javascript; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/styles.css') {
      const css = fs.readFileSync(path.join(guiRoot, 'styles.css'), 'utf8');
      return text(res, 200, css, 'text/css; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/api/defaults') {
      return json(res, 200, { platform: process.platform, mode: 'browser', openclawInstalled: detectOpenClawInstalled() });
    }

    if (req.method === 'GET' && url.pathname === '/api/catalog') {
      const workspace = url.searchParams.get('workspace') || '~/.openclaw/workspace';
      const remote = url.searchParams.get('remote') !== 'false';
      const networkPreset = url.searchParams.get('networkPreset') || 'global';
      const providerManifestUrl = url.searchParams.get('providerManifestUrl') || '';
      const skillsManifestUrl = url.searchParams.get('skillsManifestUrl') || '';
      const catalog = await discoverCatalog({
        projectRoot,
        workspace,
        remote,
        networkPreset,
        providerManifestUrl,
        skillsManifestUrl,
      });
      return json(res, 200, catalog);
    }

    if (req.method === 'POST' && url.pathname === '/api/run') {
      const raw = await readBody(req);
      const payload = JSON.parse(raw || '{}');
      const options = payload.options || {};
      const runId = createRun(projectRoot, options, { label: 'openclawdeploy-gui' });
      return json(res, 200, { runId });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/run/')) {
      const runId = url.pathname.split('/').pop();
      const run = getRun(runId);
      if (!run) return json(res, 404, { error: 'run not found' });
      return json(res, 200, run);
    }

    return notFound(res);
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  console.log(`[openclawdeploy-gui] 安装器已启动：${url}`);
  console.log('[openclawdeploy-gui] 浏览器应该会自动打开。关闭本进程即关闭安装器。');
  openBrowser(url);
});
