import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const runs = new Map();

export function buildArgs(options = {}) {
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

export function createRun(projectRoot, options = {}, meta = {}) {
  const runId = crypto.randomUUID();
  const label = meta.label || 'openclawdeploy';
  const run = {
    id: runId,
    status: 'running',
    createdAt: new Date().toISOString(),
    logs: [`[${label}] 已创建任务 ${runId}`],
  };
  runs.set(runId, run);

  const append = (chunk) => {
    const text = chunk.toString();
    run.logs.push(text);
    if (run.logs.length > 2000) run.logs = run.logs.slice(-2000);
  };

  const args = buildArgs(options);
  const env = {
    ...process.env,
    ...(options.npmRegistry
      ? {
          OPENCLAWDEPLOY_NPM_REGISTRY: options.npmRegistry,
          npm_config_registry: options.npmRegistry,
          NPM_CONFIG_REGISTRY: options.npmRegistry,
        }
      : {}),
    ...(options.installerUrl ? { OPENCLAWDEPLOY_INSTALLER_URL: options.installerUrl } : {}),
    ...(meta.env || {}),
  };

  const child = process.platform === 'win32'
    ? spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', path.join(projectRoot, 'install.ps1'), '--', ...args], {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      })
    : spawn('bash', [path.join(projectRoot, 'install.sh'), ...args], {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      });

  run.childPid = child.pid;
  run.logs.push(`[${label}] 启动命令: ${process.platform === 'win32' ? 'install.ps1' : 'install.sh'} ${args.join(' ')}`);

  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('close', (code) => {
    run.status = code === 0 ? 'finished' : 'failed';
    run.exitCode = code;
    run.logs.push(`\n[${label}] 任务结束，退出码: ${code}`);
  });
  child.on('error', (error) => {
    run.status = 'failed';
    run.logs.push(`\n[${label}] 启动失败: ${error.message}`);
  });

  return runId;
}

export function getRun(runId) {
  const run = runs.get(runId);
  if (!run) return null;
  return {
    status: run.status,
    exitCode: run.exitCode,
    logs: run.logs.join(''),
  };
}

export function listRuns() {
  return Array.from(runs.values()).map((run) => ({
    id: run.id,
    status: run.status,
    exitCode: run.exitCode,
    createdAt: run.createdAt,
  }));
}
