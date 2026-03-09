#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);

function printHelp() {
  console.log(`openclawdeploy - 一键部署 OpenClaw

用法:
  node scripts/deploy.mjs [options]
  ./install.sh [options]
  powershell -ExecutionPolicy Bypass -File .\\install.ps1 -- [options]

核心参数:
  --provider <openai|anthropic|openrouter|none>   大模型提供方，默认 openrouter
  --api-key <token>                               提供方 API Key
  --model <provider/model>                        默认模型；不传则按 provider 自动选
  --workspace <path>                              OpenClaw 默认工作目录
  --force                                         覆盖已有 ~/.openclaw/openclaw.json（会先备份）
  --dry-run                                       只输出计划，不实际执行

渠道参数:
  --with-telegram                                 启用 Telegram
  --telegram-bot-token <token>                    Telegram Bot Token
  --telegram-require-mention <true|false>         群聊是否默认要求 @，默认 true

  --with-feishu                                   启用 Feishu/Lark
  --feishu-app-id <id>                            Feishu App ID
  --feishu-app-secret <secret>                    Feishu App Secret
  --feishu-bot-name <name>                        Feishu 机器人名，默认 OpenClaw
  --feishu-domain <feishu|lark>                   默认 feishu

执行控制:
  --skip-auth                                     跳过模型认证
  --skip-doctor                                   跳过 openclaw doctor --non-interactive
  --skip-gateway-install                          跳过 openclaw gateway install
  --skip-gateway-start                            跳过 openclaw gateway start
  --skip-feishu-plugin-install                    启用 Feishu 时不自动安装插件
  --help                                          查看帮助

示例:
  ./install.sh --provider openrouter --api-key sk-or-xxx

  ./install.sh --provider openai --api-key sk-xxx --with-telegram \
    --telegram-bot-token 123456:ABCDEF

  ./install.sh --provider anthropic --api-key sk-ant-xxx --with-feishu \
    --feishu-app-id cli_xxx --feishu-app-secret yyy --feishu-bot-name 农场助手
`);
}

function parseArgs(args) {
  const options = {
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
  };

  const readValue = (i, flag) => {
    const value = args[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${flag} 缺少参数值`);
    }
    return value;
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--provider':
        options.provider = readValue(i, arg);
        i += 1;
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
      case '--telegram-require-mention': {
        const value = readValue(i, arg);
        options.telegramRequireMention = !['false', '0', 'no'].includes(value.toLowerCase());
        i += 1;
        break;
      }
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

  return options;
}

function expandHome(input) {
  if (!input) return input;
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function defaultModelFor(provider) {
  switch (provider) {
    case 'openai':
      return 'openai/gpt-5.4';
    case 'anthropic':
      return 'anthropic/claude-opus-4-6';
    case 'openrouter':
      return 'openrouter/anthropic/claude-sonnet-4-5';
    case 'none':
      return 'openrouter/anthropic/claude-sonnet-4-5';
    default:
      return provider.includes('/') ? provider : 'openrouter/anthropic/claude-sonnet-4-5';
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

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }

  if (value === null) return 'null';
  return 'undefined';
}

function buildConfig(options) {
  const workspace = options.workspace;
  const config = {
    identity: {
      name: 'OpenClaw',
      theme: 'multi-platform personal assistant',
      emoji: '🦞',
    },
    agents: {
      defaults: {
        workspace,
        userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        model: {
          primary: options.model || defaultModelFor(options.provider),
        },
      },
    },
    channels: {},
  };

  if (options.withTelegram) {
    config.channels.telegram = {
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
    config.channels.feishu = {
      enabled: true,
      domain: options.feishuDomain || 'feishu',
      dmPolicy: 'pairing',
      accounts: {
        default: {
          appId: options.feishuAppId || 'cli_xxx',
          appSecret: options.feishuAppSecret || 'REPLACE_ME_FEISHU_APP_SECRET',
          botName: options.feishuBotName || 'OpenClaw',
        },
      },
    };
  }

  return `// ~/.openclaw/openclaw.json
// Generated by openclawdeploy. OpenClaw supports JSON5 here.
${renderValue(config, 0)}
`;
}

function runCommand(label, cmd, args, { dryRun = false, allowFailure = false } = {}) {
  const pretty = `${cmd} ${args.join(' ')}`.trim();
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
  if (options.skipAuth || !options.apiKey || options.provider === 'none') {
    console.log('[openclawdeploy] 跳过模型认证。');
    return;
  }

  const cmd = commandName();
  if (options.provider === 'openai') {
    runCommand('配置 OpenAI API Key', cmd, ['onboard', '--openai-api-key', options.apiKey], {
      dryRun: options.dryRun,
    });
    return;
  }

  if (options.provider === 'anthropic') {
    runCommand('配置 Anthropic API Key', cmd, ['onboard', '--anthropic-api-key', options.apiKey], {
      dryRun: options.dryRun,
    });
    return;
  }

  if (options.provider === 'openrouter') {
    runCommand(
      '配置 OpenRouter API Key',
      cmd,
      ['onboard', '--auth-choice', 'apiKey', '--token-provider', 'openrouter', '--token', options.apiKey],
      { dryRun: options.dryRun },
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
  const rendered = buildConfig(options);

  console.log(`\n[openclawdeploy] 目标配置文件: ${configPath}`);

  if (!options.dryRun) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  if (fs.existsSync(configPath)) {
    const backupPath = `${configPath}.bak.${new Date().toISOString().replace(/[:]/g, '-')}`;
    if (!options.force && !options.dryRun) {
      throw new Error(`检测到已有配置文件: ${configPath}\n为避免误覆盖，请重新执行并添加 --force。`);
    }
    console.log(`[openclawdeploy] 已存在配置${options.dryRun ? '（dry-run，不会覆盖）' : ''}，备份路径: ${backupPath}`);
    if (!options.dryRun) {
      fs.copyFileSync(configPath, backupPath);
    }
  }

  if (options.dryRun) {
    console.log('\n[openclawdeploy] 生成的配置预览:\n');
    console.log(rendered);
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

function validate(options) {
  options.workspace = expandHome(options.workspace);

  const allowedProviders = new Set(['openai', 'anthropic', 'openrouter', 'none']);
  if (!allowedProviders.has(options.provider) && !options.provider.includes('/')) {
    throw new Error(`不支持的 provider: ${options.provider}`);
  }

  if (options.withTelegram && !options.telegramBotToken) {
    console.warn('[openclawdeploy] 你启用了 Telegram，但没传 --telegram-bot-token；配置里会写占位符。');
  }

  if (options.withFeishu) {
    if (!options.feishuAppId) {
      console.warn('[openclawdeploy] 你启用了 Feishu，但没传 --feishu-app-id；配置里会写占位符。');
    }
    if (!options.feishuAppSecret) {
      console.warn('[openclawdeploy] 你启用了 Feishu，但没传 --feishu-app-secret；配置里会写占位符。');
    }
  }
}

function main() {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }

  validate(options);

  console.log('[openclawdeploy] 部署计划');
  console.log(`- provider: ${options.provider}`);
  console.log(`- model: ${options.model || defaultModelFor(options.provider)}`);
  console.log(`- workspace: ${options.workspace}`);
  console.log(`- telegram: ${options.withTelegram ? 'on' : 'off'}`);
  console.log(`- feishu: ${options.withFeishu ? 'on' : 'off'}`);
  console.log(`- dry-run: ${options.dryRun ? 'yes' : 'no'}`);

  maybeInstallFeishuPlugin(options);
  setupAuth(options);
  writeConfig(options);
  postChecks(options);

  console.log('\n[openclawdeploy] 完成。');
  console.log('[openclawdeploy] 接下来建议先读 docs/使用手册.md，再按里面的 Telegram / Feishu / QQ / API 指南继续接入。');
}

try {
  main();
} catch (error) {
  console.error(`\n[openclawdeploy] 失败: ${error.message}`);
  process.exit(1);
}
