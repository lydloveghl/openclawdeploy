#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const argv = process.argv.slice(2);
const CUSTOM_APIS = ['openai-completions', 'openai-responses', 'anthropic-messages', 'google-generative-ai'];
const NODE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'];

function printHelp() {
  console.log(`openclawdeploy - 一键部署 OpenClaw（支持交互向导）

用法:
  node scripts/deploy.mjs [options]
  ./install.sh [options]
  powershell -ExecutionPolicy Bypass -File .\\install.ps1 -- [options]

常见用法:
  ./install.sh
      不带参数时，如果当前终端可交互，会自动进入安装向导。

  ./install.sh --interactive
      强制进入交互向导。

  ./install.sh --provider none
      跳过大模型接入，只先部署 OpenClaw。

  ./install.sh --provider custom --custom-provider-id myproxy \
    --custom-base-url https://example.com/v1 \
    --custom-api openai-completions \
    --custom-model-id gpt-4.1 \
    --custom-api-key sk-xxx
      配置一个自定义大模型提供方。

核心参数:
  --interactive                                 强制进入交互式安装向导
  --provider <openai|anthropic|openrouter|custom|none>
                                               大模型提供方
  --skip-model-setup                            显式跳过模型接入（等价于 --provider none）
  --bootstrap-only                              仅做 OpenClaw 基础安装，不写配置、不做后续配置动作
  --api-key <token>                             OpenAI / Anthropic / OpenRouter API Key
  --model <provider/model>                      默认模型；不传则按 provider 自动选
  --workspace <path>                            OpenClaw 默认工作目录
  --force                                       覆盖已有 ~/.openclaw/openclaw.json（会先备份）
  --dry-run                                     只输出计划，不实际执行

自定义 Provider 参数:
  --custom-provider-id <id>                     自定义 provider id
  --custom-api <adapter>                        openai-completions | openai-responses |
                                               anthropic-messages | google-generative-ai
  --custom-base-url <url>                       自定义 provider baseUrl
  --custom-model-id <id>                        自定义 provider 的模型 id
  --custom-model-name <name>                    模型展示名，默认同 model id
  --custom-api-key <token>                      自定义 provider API Key

渠道参数:
  --with-telegram                               启用 Telegram
  --telegram-bot-token <token>                  Telegram Bot Token
  --telegram-require-mention <true|false>       群聊是否默认要求 @，默认 true

  --with-feishu                                 启用 Feishu/Lark
  --feishu-app-id <id>                          Feishu App ID
  --feishu-app-secret <secret>                  Feishu App Secret
  --feishu-bot-name <name>                      Feishu 机器人名，默认 OpenClaw
  --feishu-domain <feishu|lark>                 默认 feishu

Skills 参数:
  --configure-skills                            写入 skills 配置
  --skills-extra-dirs <a,b,c>                   额外扫描的 skills 目录
  --skills-allow-bundled <a,b,c>                限制允许的 bundled skills
  --skills-watch <true|false>                   是否开启 skills watcher
  --skills-watch-debounce-ms <ms>               watcher 防抖，默认 250
  --skills-node-manager <npm|pnpm|yarn|bun>     skills 安装时使用的 node 管理器
  --skills-prefer-brew <true|false>             skills 安装时是否优先 brew
  --skill-entry-json <json>                     追加一个 skills.entries 配置
                                                例：
                                                --skill-entry-json '{"key":"sag","enabled":false}'
                                                --skill-entry-json '{"key":"nano-banana-pro","apiKey":"xxx","env":{"GEMINI_API_KEY":"xxx"}}'

执行控制:
  --skip-auth                                   跳过模型认证
  --skip-doctor                                 跳过 openclaw doctor --non-interactive
  --skip-gateway-install                        跳过 openclaw gateway install
  --skip-gateway-start                          跳过 openclaw gateway start
  --skip-feishu-plugin-install                  启用 Feishu 时不自动安装插件
  --help                                        查看帮助
`);
}

function splitCsv(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBooleanish(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function expandHome(input) {
  if (!input) return input;
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function defaultModelFor(provider, options = {}) {
  switch (provider) {
    case 'openai':
      return 'openai/gpt-5.4';
    case 'anthropic':
      return 'anthropic/claude-opus-4-6';
    case 'openrouter':
      return 'openrouter/anthropic/claude-sonnet-4-5';
    case 'custom':
      return options.customProviderId && options.customModelId
        ? `${options.customProviderId}/${options.customModelId}`
        : '';
    case 'none':
    default:
      return '';
  }
}

function commandName() {
  return process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw';
}

function renderKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function renderValue(value, indent = 0) {
  const pad = ' '.repeat(indent);
  const padChild = ' '.repeat(indent + 2);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[
${value.map((item) => `${padChild}${renderValue(item, indent + 2)}`).join(',\n')}
${pad}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    return `{
${entries
      .map(([key, val]) => `${padChild}${renderKey(key)}: ${renderValue(val, indent + 2)}`)
      .join(',\n')}
${pad}}`;
  }

  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (value === null) return 'null';
  return 'undefined';
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createPrompt() {
  const rl = readline.createInterface({ input, output, terminal: true });
  const originalWrite = rl._writeToOutput?.bind(rl);
  rl.stdoutMuted = false;

  if (originalWrite) {
    rl._writeToOutput = (stringToWrite) => {
      if (rl.stdoutMuted) {
        rl.output.write('*');
        return;
      }
      originalWrite(stringToWrite);
    };
  }

  async function ask(label, defaultValue = '') {
    const suffix = defaultValue !== '' && defaultValue != null ? ` [${defaultValue}]` : '';
    const answer = (await rl.question(`${label}${suffix}: `)).trim();
    return answer === '' ? defaultValue : answer;
  }

  async function askSecret(label) {
    rl.stdoutMuted = true;
    const answer = (await rl.question(`${label}: `)).trim();
    rl.stdoutMuted = false;
    rl.output.write('\n');
    return answer;
  }

  async function confirm(label, defaultValue = true) {
    const hint = defaultValue ? 'Y/n' : 'y/N';
    const answer = (await rl.question(`${label} (${hint}): `)).trim().toLowerCase();
    if (!answer) return defaultValue;
    return ['y', 'yes', '1', 'true'].includes(answer);
  }

  async function choose(label, choices, defaultValue) {
    console.log(`\n${label}`);
    choices.forEach((choice, index) => {
      const marker = choice.value === defaultValue ? ' (默认)' : '';
      console.log(`  ${index + 1}. ${choice.label}${marker}`);
    });

    while (true) {
      const raw = (await rl.question('请输入序号或值: ')).trim();
      if (!raw && defaultValue !== undefined) return defaultValue;
      const index = Number(raw);
      if (!Number.isNaN(index) && index >= 1 && index <= choices.length) {
        return choices[index - 1].value;
      }
      const matched = choices.find((choice) => choice.value === raw);
      if (matched) return matched.value;
      console.log('输入不合法，再来一次。');
    }
  }

  function close() {
    rl.close();
  }

  return { ask, askSecret, confirm, choose, close };
}

function parseSkillEntryJson(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`--skill-entry-json 不是合法 JSON: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--skill-entry-json 必须是 JSON 对象');
  }

  if (!parsed.key || typeof parsed.key !== 'string') {
    throw new Error('--skill-entry-json 必须包含字符串字段 key');
  }

  const entry = {};
  if (parsed.enabled !== undefined) entry.enabled = Boolean(parsed.enabled);
  if (parsed.apiKey !== undefined) entry.apiKey = parsed.apiKey;
  if (parsed.env !== undefined) entry.env = parsed.env;
  if (parsed.config !== undefined) entry.config = parsed.config;
  return { key: parsed.key, entry };
}

function parseArgs(args) {
  const options = {
    interactive: false,
    provider: 'openrouter',
    apiKey: '',
    model: '',
    workspace: '~/.openclaw/workspace',
    force: false,
    dryRun: false,
    help: false,
    withTelegram: false,
    telegramBotToken: '',
    telegramRequireMention: true,
    withFeishu: false,
    feishuAppId: '',
    feishuAppSecret: '',
    feishuBotName: 'OpenClaw',
    feishuDomain: 'feishu',
    skipAuth: false,
    skipDoctor: false,
    skipGatewayInstall: false,
    skipGatewayStart: false,
    skipFeishuPluginInstall: false,
    skipModelSetup: false,
    bootstrapOnly: false,
    customProviderId: '',
    customApi: 'openai-completions',
    customBaseUrl: '',
    customModelId: '',
    customModelName: '',
    customApiKey: '',
    configureSkills: false,
    skillsExtraDirs: [],
    skillsAllowBundled: [],
    skillsWatch: true,
    skillsWatchDebounceMs: 250,
    skillsNodeManager: 'npm',
    skillsPreferBrew: true,
    skillEntries: {},
  };

  const readValue = (i, flag) => {
    const value = args[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${flag} 缺少参数值`);
    }
    return value;
  };

  const applySkillEntry = (key, entry) => {
    options.configureSkills = true;
    options.skillEntries[key] = {
      ...(options.skillEntries[key] || {}),
      ...entry,
    };
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--interactive':
        options.interactive = true;
        break;
      case '--provider':
        options.provider = readValue(i, arg);
        i += 1;
        break;
      case '--skip-model-setup':
        options.skipModelSetup = true;
        options.provider = 'none';
        options.model = '';
        options.skipAuth = true;
        break;
      case '--bootstrap-only':
        options.bootstrapOnly = true;
        options.provider = 'none';
        options.model = '';
        options.skipAuth = true;
        options.configureSkills = false;
        break;
      case '--api-key':
        options.apiKey = readValue(i, arg);
        i += 1;
        break;
      case '--model':
        options.model = readValue(i, arg);
        i += 1;
        break;
      case '--workspace':
        options.workspace = readValue(i, arg);
        i += 1;
        break;
      case '--with-telegram':
        options.withTelegram = true;
        break;
      case '--telegram-bot-token':
        options.telegramBotToken = readValue(i, arg);
        i += 1;
        break;
      case '--telegram-require-mention':
        options.telegramRequireMention = parseBooleanish(readValue(i, arg), true);
        i += 1;
        break;
      case '--with-feishu':
        options.withFeishu = true;
        break;
      case '--feishu-app-id':
        options.feishuAppId = readValue(i, arg);
        i += 1;
        break;
      case '--feishu-app-secret':
        options.feishuAppSecret = readValue(i, arg);
        i += 1;
        break;
      case '--feishu-bot-name':
        options.feishuBotName = readValue(i, arg);
        i += 1;
        break;
      case '--feishu-domain':
        options.feishuDomain = readValue(i, arg);
        i += 1;
        break;
      case '--skip-auth':
        options.skipAuth = true;
        break;
      case '--skip-doctor':
        options.skipDoctor = true;
        break;
      case '--skip-gateway-install':
        options.skipGatewayInstall = true;
        break;
      case '--skip-gateway-start':
        options.skipGatewayStart = true;
        break;
      case '--skip-feishu-plugin-install':
        options.skipFeishuPluginInstall = true;
        break;
      case '--custom-provider-id':
        options.customProviderId = readValue(i, arg);
        options.provider = 'custom';
        i += 1;
        break;
      case '--custom-api':
        options.customApi = readValue(i, arg);
        options.provider = 'custom';
        i += 1;
        break;
      case '--custom-base-url':
        options.customBaseUrl = readValue(i, arg);
        options.provider = 'custom';
        i += 1;
        break;
      case '--custom-model-id':
        options.customModelId = readValue(i, arg);
        options.provider = 'custom';
        i += 1;
        break;
      case '--custom-model-name':
        options.customModelName = readValue(i, arg);
        options.provider = 'custom';
        i += 1;
        break;
      case '--custom-api-key':
        options.customApiKey = readValue(i, arg);
        options.provider = 'custom';
        i += 1;
        break;
      case '--configure-skills':
        options.configureSkills = true;
        break;
      case '--skills-extra-dirs':
        options.configureSkills = true;
        options.skillsExtraDirs = splitCsv(readValue(i, arg));
        i += 1;
        break;
      case '--skills-allow-bundled':
        options.configureSkills = true;
        options.skillsAllowBundled = splitCsv(readValue(i, arg));
        i += 1;
        break;
      case '--skills-watch':
        options.configureSkills = true;
        options.skillsWatch = parseBooleanish(readValue(i, arg), true);
        i += 1;
        break;
      case '--skills-watch-debounce-ms':
        options.configureSkills = true;
        options.skillsWatchDebounceMs = Number(readValue(i, arg));
        i += 1;
        break;
      case '--skills-node-manager':
        options.configureSkills = true;
        options.skillsNodeManager = readValue(i, arg);
        i += 1;
        break;
      case '--skills-prefer-brew':
        options.configureSkills = true;
        options.skillsPreferBrew = parseBooleanish(readValue(i, arg), true);
        i += 1;
        break;
      case '--skill-entry-json': {
        const { key, entry } = parseSkillEntryJson(readValue(i, arg));
        applySkillEntry(key, entry);
        i += 1;
        break;
      }
      case '--force':
        options.force = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        throw new Error(`不支持的参数: ${arg}`);
    }
  }

  if (options.provider === 'custom' && !options.model && options.customProviderId && options.customModelId) {
    options.model = `${options.customProviderId}/${options.customModelId}`;
  }

  return options;
}

function buildSkillConfig(options, { redactSecrets = false } = {}) {
  if (!options.configureSkills) return undefined;

  const entries = {};
  for (const [key, value] of Object.entries(options.skillEntries || {})) {
    const entry = {};
    if (value.enabled !== undefined) entry.enabled = value.enabled;
    if (value.apiKey !== undefined && value.apiKey !== '') {
      entry.apiKey = redactSecrets ? '***REDACTED***' : value.apiKey;
    }
    if (value.env && Object.keys(value.env).length > 0) {
      entry.env = redactSecrets
        ? Object.fromEntries(Object.keys(value.env).map((envKey) => [envKey, '***REDACTED***']))
        : value.env;
    }
    if (value.config && Object.keys(value.config).length > 0) {
      entry.config = value.config;
    }
    if (Object.keys(entry).length > 0) entries[key] = entry;
  }

  const skillConfig = {
    load: {
      extraDirs: options.skillsExtraDirs.map(expandHome),
      watch: options.skillsWatch,
      watchDebounceMs: options.skillsWatchDebounceMs,
    },
    install: {
      preferBrew: options.skillsPreferBrew,
      nodeManager: options.skillsNodeManager,
    },
  };

  if (options.skillsAllowBundled.length > 0) {
    skillConfig.allowBundled = options.skillsAllowBundled;
  }

  if (Object.keys(entries).length > 0) {
    skillConfig.entries = entries;
  }

  return skillConfig;
}

function buildConfig(options, { redactSecrets = false } = {}) {
  const defaults = {
    workspace: options.workspace,
    userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };

  if (options.model) {
    defaults.model = { primary: options.model };
  }

  const config = {
    identity: {
      name: 'OpenClaw',
      theme: 'multi-platform personal assistant',
      emoji: '🦞',
    },
    agents: {
      defaults,
    },
  };

  if (options.provider === 'custom') {
    config.models = {
      mode: 'merge',
      providers: {
        [options.customProviderId]: {
          baseUrl: options.customBaseUrl,
          api: options.customApi,
          ...(options.customApiKey
            ? { apiKey: redactSecrets ? '***REDACTED***' : options.customApiKey }
            : {}),
          models: [
            {
              id: options.customModelId,
              name: options.customModelName || options.customModelId,
            },
          ],
        },
      },
    };
  }

  const channels = {};
  if (options.withTelegram) {
    channels.telegram = {
      enabled: true,
      botToken: options.telegramBotToken || 'REPLACE_ME_TELEGRAM_BOT_TOKEN',
      dmPolicy: 'pairing',
      groups: {
        '*': {
          requireMention: options.telegramRequireMention,
        },
      },
    };
  }

  if (options.withFeishu) {
    channels.feishu = {
      enabled: true,
      domain: options.feishuDomain || 'feishu',
      dmPolicy: 'pairing',
      accounts: {
        default: {
          appId: options.feishuAppId || 'cli_xxx',
          appSecret: redactSecrets && options.feishuAppSecret ? '***REDACTED***' : (options.feishuAppSecret || 'REPLACE_ME_FEISHU_APP_SECRET'),
          botName: options.feishuBotName || 'OpenClaw',
        },
      },
    };
  }

  if (Object.keys(channels).length > 0) {
    config.channels = channels;
  }

  const skills = buildSkillConfig(options, { redactSecrets });
  if (skills) {
    config.skills = skills;
  }

  return `// ~/.openclaw/openclaw.json
// Generated by openclawdeploy. OpenClaw supports JSON5 here.
${renderValue(config, 0)}
`;
}

function maskInText(text, secretValues = []) {
  let masked = text;
  for (const secret of secretValues.filter(Boolean)) {
    masked = masked.split(secret).join('***REDACTED***');
  }
  return masked;
}

function runCommand(label, cmd, args, { dryRun = false, allowFailure = false, secretValues = [] } = {}) {
  const pretty = maskInText(`${cmd} ${args.join(' ')}`.trim(), secretValues);
  console.log(`\n[openclawdeploy] ${label}`);
  console.log(`  $ ${pretty}`);

  if (dryRun) return { status: 0 };

  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    if (allowFailure) {
      console.warn(`[openclawdeploy] 命令执行失败，但继续: ${result.error.message}`);
      return result;
    }
    throw result.error;
  }

  if (result.status !== 0 && !allowFailure) {
    throw new Error(`命令退出码非 0: ${pretty}`);
  }

  return result;
}

function setupAuth(options) {
  if (options.skipAuth) {
    console.log('[openclawdeploy] 已按要求跳过模型认证。');
    return;
  }

  const cmd = commandName();

  if (options.provider === 'custom') {
    console.log('[openclawdeploy] 自定义 provider 通过写入 openclaw.json 完成接入，不额外调用 onboard。');
    return;
  }

  if (!options.apiKey || options.provider === 'none') {
    console.log('[openclawdeploy] 未提供 API Key，先跳过模型认证。你后续可以手动执行 openclaw onboard。');
    return;
  }

  if (options.provider === 'openai') {
    runCommand('配置 OpenAI API Key', cmd, ['onboard', '--openai-api-key', options.apiKey], {
      dryRun: options.dryRun,
      secretValues: [options.apiKey],
    });
    return;
  }

  if (options.provider === 'anthropic') {
    runCommand('配置 Anthropic API Key', cmd, ['onboard', '--anthropic-api-key', options.apiKey], {
      dryRun: options.dryRun,
      secretValues: [options.apiKey],
    });
    return;
  }

  if (options.provider === 'openrouter') {
    runCommand(
      '配置 OpenRouter API Key',
      cmd,
      ['onboard', '--auth-choice', 'apiKey', '--token-provider', 'openrouter', '--token', options.apiKey],
      { dryRun: options.dryRun, secretValues: [options.apiKey] },
    );
    return;
  }

  console.warn(`[openclawdeploy] 未内置 ${options.provider} 的自动认证命令，请手动执行 openclaw onboard。`);
}

function maybeInstallFeishuPlugin(options) {
  if (!options.withFeishu || options.skipFeishuPluginInstall) return;
  runCommand('安装 Feishu 插件', commandName(), ['plugins', 'install', '@openclaw/feishu'], {
    dryRun: options.dryRun,
  });
}

function writeConfig(options) {
  const configDir = path.join(os.homedir(), '.openclaw');
  const configPath = path.join(configDir, 'openclaw.json');
  const rendered = buildConfig(options, { redactSecrets: false });
  const renderedPreview = buildConfig(options, { redactSecrets: true });

  console.log(`\n[openclawdeploy] 目标配置文件: ${configPath}`);

  if (!options.dryRun) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  if (fs.existsSync(configPath)) {
    const backupPath = `${configPath}.bak.${new Date().toISOString().replace(/[:]/g, '-')}`;
    if (!options.force && !options.dryRun) {
      throw new Error(`检测到已有配置文件: ${configPath}\n为避免误覆盖，请重新执行并添加 --force，或者使用 --interactive 走向导确认。`);
    }
    console.log(`[openclawdeploy] 已存在配置${options.dryRun ? '（dry-run，不会覆盖）' : ''}，备份路径: ${backupPath}`);
    if (!options.dryRun) {
      fs.copyFileSync(configPath, backupPath);
    }
  }

  if (options.dryRun) {
    console.log('\n[openclawdeploy] 生成的配置预览（敏感信息已隐藏）:\n');
    console.log(renderedPreview);
    return;
  }

  fs.writeFileSync(configPath, rendered, 'utf8');
  console.log('[openclawdeploy] 配置文件写入完成。');
}

function postChecks(options) {
  const cmd = commandName();

  if (!options.skipDoctor) {
    runCommand('执行 openclaw doctor', cmd, ['doctor', '--non-interactive'], {
      dryRun: options.dryRun,
      allowFailure: true,
    });
  }

  if (!options.skipGatewayInstall) {
    runCommand('安装 Gateway 服务', cmd, ['gateway', 'install'], {
      dryRun: options.dryRun,
      allowFailure: true,
    });
  }

  if (!options.skipGatewayStart) {
    runCommand('启动 Gateway', cmd, ['gateway', 'start'], {
      dryRun: options.dryRun,
      allowFailure: true,
    });
  }

  runCommand('查看 OpenClaw 状态', cmd, ['status'], {
    dryRun: options.dryRun,
    allowFailure: true,
  });
}

function validateSkillEntries(options) {
  for (const [key, value] of Object.entries(options.skillEntries || {})) {
    if (!key) throw new Error('skills.entries 的 key 不能为空');
    if (value.env !== undefined && (typeof value.env !== 'object' || Array.isArray(value.env))) {
      throw new Error(`skills.entries.${key}.env 必须是对象`);
    }
    if (value.config !== undefined && (typeof value.config !== 'object' || Array.isArray(value.config))) {
      throw new Error(`skills.entries.${key}.config 必须是对象`);
    }
  }
}

function validate(options) {
  options.workspace = expandHome(options.workspace);
  options.skillsExtraDirs = options.skillsExtraDirs.map(expandHome);

  const allowedProviders = new Set(['openai', 'anthropic', 'openrouter', 'custom', 'none']);
  if (!allowedProviders.has(options.provider) && !options.provider.includes('/')) {
    throw new Error(`不支持的 provider: ${options.provider}`);
  }

  if (options.provider === 'custom') {
    if (!options.customProviderId) throw new Error('自定义 provider 缺少 --custom-provider-id');
    if (!options.customBaseUrl) throw new Error('自定义 provider 缺少 --custom-base-url');
    if (!CUSTOM_APIS.includes(options.customApi)) {
      throw new Error(`--custom-api 不支持：${options.customApi}`);
    }
    if (!options.customModelId) throw new Error('自定义 provider 缺少 --custom-model-id');
    if (!options.model) options.model = `${options.customProviderId}/${options.customModelId}`;
  }

  if (options.provider === 'none') {
    options.model = '';
  }

  if (options.withTelegram && !options.telegramBotToken) {
    console.warn('[openclawdeploy] 你启用了 Telegram，但没传 --telegram-bot-token；配置里会写占位符。');
  }

  if (options.withFeishu) {
    if (!options.feishuAppId) console.warn('[openclawdeploy] 你启用了 Feishu，但没传 --feishu-app-id；配置里会写占位符。');
    if (!options.feishuAppSecret) console.warn('[openclawdeploy] 你启用了 Feishu，但没传 --feishu-app-secret；配置里会写占位符。');
  }

  if (!NODE_MANAGERS.includes(options.skillsNodeManager)) {
    throw new Error(`skills node manager 不支持：${options.skillsNodeManager}`);
  }

  if (!Number.isFinite(options.skillsWatchDebounceMs) || options.skillsWatchDebounceMs < 0) {
    throw new Error('--skills-watch-debounce-ms 必须是 >= 0 的数字');
  }

  validateSkillEntries(options);
}

function detectInteractiveMode(options) {
  return options.interactive || (argv.length === 0 && input.isTTY && output.isTTY);
}

function summarizeOptions(options) {
  return [
    `- provider: ${options.provider}`,
    `- model: ${options.model || '（未设置）'}`,
    `- workspace: ${options.workspace}`,
    `- bootstrap-only: ${options.bootstrapOnly ? 'yes' : 'no'}`,
    `- telegram: ${options.withTelegram ? 'on' : 'off'}`,
    `- feishu: ${options.withFeishu ? 'on' : 'off'}`,
    `- skills: ${options.configureSkills ? 'on' : 'off'}`,
    `- dry-run: ${options.dryRun ? 'yes' : 'no'}`,
  ].join('\n');
}

function parseEnvPairs(raw) {
  const result = {};
  const items = splitCsv(raw);
  for (const item of items) {
    const index = item.indexOf('=');
    if (index <= 0) {
      throw new Error(`环境变量格式不对：${item}，应为 KEY=VALUE`);
    }
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (!key) throw new Error(`环境变量 key 不能为空：${item}`);
    result[key] = value;
  }
  return result;
}

async function configureSkillsInteractively(options, prompt) {
  options.configureSkills = await prompt.confirm('要现在配置 skills 吗', options.configureSkills);
  if (!options.configureSkills) {
    options.skillsExtraDirs = [];
    options.skillsAllowBundled = [];
    options.skillEntries = {};
    return;
  }

  const extraDirs = await prompt.ask(
    '额外 skills 目录（多个用英文逗号分隔，可留空）',
    options.skillsExtraDirs.join(','),
  );
  options.skillsExtraDirs = splitCsv(extraDirs);

  const allowBundled = await prompt.ask(
    '允许的 bundled skills（多个用英文逗号分隔，可留空表示不限制）',
    options.skillsAllowBundled.join(','),
  );
  options.skillsAllowBundled = splitCsv(allowBundled);

  options.skillsWatch = await prompt.confirm('开启 skills watcher', options.skillsWatch);
  options.skillsWatchDebounceMs = Number(
    await prompt.ask('skills watcher 防抖毫秒数', String(options.skillsWatchDebounceMs)),
  );
  options.skillsNodeManager = await prompt.choose(
    'skills 安装使用哪个 node 管理器？',
    NODE_MANAGERS.map((value) => ({ value, label: value })),
    options.skillsNodeManager,
  );
  options.skillsPreferBrew = await prompt.confirm('安装 skills 时优先使用 brew（若可用）', options.skillsPreferBrew);

  const entries = clone(options.skillEntries || {});
  let keepAdding = await prompt.confirm('要添加或修改某个 skill 条目吗', Object.keys(entries).length > 0);
  while (keepAdding) {
    const skillKey = await prompt.ask('skill key（例如 sag / nano-banana-pro / weather）');
    const enabledMode = await prompt.choose(
      `skill [${skillKey}] 的启用状态`,
      [
        { value: 'unset', label: '不写 enabled（保持默认）' },
        { value: 'true', label: '启用' },
        { value: 'false', label: '禁用' },
      ],
      entries[skillKey]?.enabled === true ? 'true' : entries[skillKey]?.enabled === false ? 'false' : 'unset',
    );

    const apiKey = await prompt.askSecret('该 skill 的 API Key（可留空）');
    const envRaw = await prompt.ask('该 skill 的 env（多个用 KEY=VALUE,KEY2=VALUE2，可留空）', '');
    const configRaw = await prompt.ask('该 skill 的 config JSON（可留空）', '');

    const entry = {};
    if (enabledMode !== 'unset') entry.enabled = enabledMode === 'true';
    if (apiKey) entry.apiKey = apiKey;
    if (envRaw) entry.env = parseEnvPairs(envRaw);
    if (configRaw) {
      let parsed;
      try {
        parsed = JSON.parse(configRaw);
      } catch (error) {
        throw new Error(`skill [${skillKey}] 的 config JSON 不合法: ${error.message}`);
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`skill [${skillKey}] 的 config 必须是 JSON 对象`);
      }
      entry.config = parsed;
    }

    if (Object.keys(entry).length > 0) {
      entries[skillKey] = entry;
    }

    keepAdding = await prompt.confirm('继续添加/修改下一个 skill 条目吗', false);
  }

  options.skillEntries = entries;
}

async function runInteractiveWizard(options) {
  const prompt = createPrompt();
  try {
    console.log('[openclawdeploy] 进入交互式安装向导。');
    console.log('[openclawdeploy] 你可以随时留空使用默认值；API Key / Secret 允许先跳过。\n');

    options.workspace = await prompt.ask('OpenClaw 工作目录', options.workspace);

    const providerChoice = await prompt.choose(
      '先配置哪种大模型接入？',
      [
        { value: 'openrouter', label: 'OpenRouter（最省事）' },
        { value: 'openai', label: 'OpenAI' },
        { value: 'anthropic', label: 'Anthropic' },
        { value: 'custom', label: '自定义 provider' },
        { value: 'none', label: '先跳过，后面再配' },
      ],
      options.provider,
    );

    options.provider = providerChoice;

    if (providerChoice === 'none') {
      options.skipAuth = true;
      options.model = '';
    } else if (providerChoice === 'custom') {
      options.customProviderId = await prompt.ask('自定义 provider id', options.customProviderId || 'custom-openai');
      options.customApi = await prompt.choose(
        '自定义 provider 使用哪种 API 适配器？',
        CUSTOM_APIS.map((value) => ({ value, label: value })),
        options.customApi,
      );
      options.customBaseUrl = await prompt.ask('自定义 provider baseUrl', options.customBaseUrl || 'https://example.com/v1');
      options.customModelId = await prompt.ask('自定义 provider 模型 id', options.customModelId || 'gpt-4.1');
      options.customModelName = await prompt.ask('自定义 provider 模型展示名', options.customModelName || options.customModelId);
      const setAsDefault = await prompt.confirm('把这个自定义模型设为默认模型', true);
      options.model = setAsDefault ? `${options.customProviderId}/${options.customModelId}` : '';
      options.customApiKey = await prompt.askSecret('自定义 provider API Key（可留空）');
      options.skipAuth = true;
    } else {
      const builtInDefaultModel = options.model || defaultModelFor(providerChoice, options);
      options.model = await prompt.ask('默认模型', builtInDefaultModel);
      options.apiKey = await prompt.askSecret(`${providerChoice} API Key（可留空，后面手动 onboard 也行）`);
    }

    options.withTelegram = await prompt.confirm('要接入 Telegram 吗', options.withTelegram);
    if (options.withTelegram) {
      options.telegramBotToken = await prompt.askSecret('Telegram Bot Token（可留空）');
      options.telegramRequireMention = await prompt.confirm('Telegram 群聊默认需要 @ 触发吗', options.telegramRequireMention);
    }

    options.withFeishu = await prompt.confirm('要接入 Feishu / Lark 吗', options.withFeishu);
    if (options.withFeishu) {
      options.feishuDomain = await prompt.choose(
        'Feishu 域名',
        [
          { value: 'feishu', label: 'feishu（中国大陆）' },
          { value: 'lark', label: 'lark（国际版）' },
        ],
        options.feishuDomain,
      );
      options.feishuAppId = await prompt.ask('Feishu App ID（可留空）', options.feishuAppId || 'cli_xxx');
      options.feishuAppSecret = await prompt.askSecret('Feishu App Secret（可留空）');
      options.feishuBotName = await prompt.ask('Feishu Bot 名称', options.feishuBotName);
    }

    await configureSkillsInteractively(options, prompt);

    options.skipDoctor = !(await prompt.confirm('安装完成后执行 openclaw doctor', !options.skipDoctor));
    options.skipGatewayInstall = !(await prompt.confirm('安装 Gateway 服务', !options.skipGatewayInstall));
    options.skipGatewayStart = !(await prompt.confirm('安装后立即启动 Gateway', !options.skipGatewayStart));
    options.dryRun = await prompt.confirm('先做 dry-run 预览，不真正落地', options.dryRun);

    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    if (fs.existsSync(configPath)) {
      options.force = await prompt.confirm('检测到已有 ~/.openclaw/openclaw.json，是否覆盖并自动备份', options.force);
    }

    console.log(`\n[openclawdeploy] 当前安装计划\n${summarizeOptions(options)}\n`);
    const confirmed = await prompt.confirm('确认按以上计划继续吗', true);
    if (!confirmed) {
      throw new Error('用户取消了安装。');
    }
  } finally {
    prompt.close();
  }
}

async function main() {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }

  if (detectInteractiveMode(options)) {
    await runInteractiveWizard(options);
  }

  if (options.provider === 'custom' && !options.model && options.customProviderId && options.customModelId) {
    options.model = `${options.customProviderId}/${options.customModelId}`;
  }

  validate(options);

  console.log('[openclawdeploy] 部署计划');
  console.log(summarizeOptions(options));

  if (options.bootstrapOnly) {
    console.log('\n[openclawdeploy] bootstrap-only 模式：OpenClaw CLI 已由安装脚本处理完成，当前跳过配置写入与后续动作。');
    console.log('[openclawdeploy] 现在可以重新扫描本机环境，再继续后续模型 / 渠道 / skills 配置。');
    return;
  }

  maybeInstallFeishuPlugin(options);
  setupAuth(options);
  writeConfig(options);
  postChecks(options);

  console.log('\n[openclawdeploy] 完成。');
  console.log('[openclawdeploy] 接下来建议先读 docs/使用手册.md，再按里面的模型 / Telegram / Feishu / Skills / QQ 指南继续配置。');
}

try {
  await main();
} catch (error) {
  console.error(`\n[openclawdeploy] 失败: ${error.message}`);
  process.exit(1);
}
