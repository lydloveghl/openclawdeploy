#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const guiRoot = path.join(projectRoot, 'gui');
const runs = new Map();

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

function buildArgs(options) {
  const args = [];
  const push = (flag, value) => {
    if (value === undefined || value === null || value === '') return;
    args.push(flag, String(value));
  };

  push('--provider', options.provider);
  push('--api-key', options.apiKey);
  push('--model', options.model);
  push('--workspace', options.workspace);
  if (options.force) args.push('--force');
  if (options.dryRun) args.push('--dry-run');
  if (options.skipAuth) args.push('--skip-auth');
  if (options.skipDoctor) args.push('--skip-doctor');
  if (options.skipGatewayInstall) args.push('--skip-gateway-install');
  if (options.skipGatewayStart) args.push('--skip-gateway-start');

  if (options.provider === 'custom') {
    push('--custom-provider-id', options.customProviderId);
    push('--custom-api', options.customApi);
    push('--custom-base-url', options.customBaseUrl);
    push('--custom-model-id', options.customModelId);
    push('--custom-model-name', options.customModelName);
    push('--custom-api-key', options.customApiKey);
  }

  if (options.withTelegram) {
    args.push('--with-telegram');
    push('--telegram-bot-token', options.telegramBotToken);
    push('--telegram-require-mention', String(Boolean(options.telegramRequireMention)));
  }

  if (options.withFeishu) {
    args.push('--with-feishu');
    push('--feishu-domain', options.feishuDomain);
    push('--feishu-app-id', options.feishuAppId);
    push('--feishu-app-secret', options.feishuAppSecret);
    push('--feishu-bot-name', options.feishuBotName);
  }

  if (options.configureSkills) {
    args.push('--configure-skills');
    if (Array.isArray(options.skillsExtraDirs) && options.skillsExtraDirs.length > 0) {
      push('--skills-extra-dirs', options.skillsExtraDirs.join(','));
    }
    if (Array.isArray(options.skillsAllowBundled) && options.skillsAllowBundled.length > 0) {
      push('--skills-allow-bundled', options.skillsAllowBundled.join(','));
    }
    push('--skills-node-manager', options.skillsNodeManager);
    push('--skills-watch', String(Boolean(options.skillsWatch)));
    push('--skills-watch-debounce-ms', options.skillsWatchDebounceMs);
    push('--skills-prefer-brew', String(Boolean(options.skillsPreferBrew)));

    if (options.skillEntries && typeof options.skillEntries === 'object') {
      for (const [key, entry] of Object.entries(options.skillEntries)) {
        args.push('--skill-entry-json', JSON.stringify({ key, ...entry }));
      }
    }
  }

  return args;
}

function createRun(options) {
  const runId = crypto.randomUUID();
  const run = {
    id: runId,
    status: 'running',
    createdAt: new Date().toISOString(),
    logs: [`[openclawdeploy-gui] 已创建任务 ${runId}`],
  };
  runs.set(runId, run);

  const append = (chunk) => {
    const text = chunk.toString();
    run.logs.push(text);
    if (run.logs.length > 2000) run.logs = run.logs.slice(-2000);
  };

  const args = buildArgs(options);
  const child = process.platform === 'win32'
    ? spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', path.join(projectRoot, 'install.ps1'), '--', ...args], {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    : spawn('bash', [path.join(projectRoot, 'install.sh'), ...args], {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

  run.childPid = child.pid;
  run.logs.push(`[openclawdeploy-gui] 启动命令: ${process.platform === 'win32' ? 'install.ps1' : 'install.sh'} ${args.join(' ')}`);

  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('close', (code) => {
    run.status = code === 0 ? 'finished' : 'failed';
    run.exitCode = code;
    run.logs.push(`\n[openclawdeploy-gui] 任务结束，退出码: ${code}`);
  });
  child.on('error', (error) => {
    run.status = 'failed';
    run.logs.push(`\n[openclawdeploy-gui] 启动失败: ${error.message}`);
  });

  return runId;
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
      return json(res, 200, { platform: process.platform });
    }

    if (req.method === 'POST' && url.pathname === '/api/run') {
      const raw = await readBody(req);
      const payload = JSON.parse(raw || '{}');
      const options = payload.options || {};
      const runId = createRun(options);
      return json(res, 200, { runId });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/run/')) {
      const runId = url.pathname.split('/').pop();
      const run = runs.get(runId);
      if (!run) return json(res, 404, { error: 'run not found' });
      return json(res, 200, {
        status: run.status,
        exitCode: run.exitCode,
        logs: run.logs.join(''),
      });
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
