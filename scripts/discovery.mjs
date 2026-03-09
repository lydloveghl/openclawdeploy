#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function expandHome(input) {
  if (!input) return input;
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function listFilesRecursive(root, predicate, acc = []) {
  if (!root || !fs.existsSync(root)) return acc;
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) return acc;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      listFilesRecursive(full, predicate, acc);
    } else if (predicate(full)) {
      acc.push(full);
    }
  }
  return acc;
}

function matchField(raw, key) {
  const regex = new RegExp(`^${key}:\\s*(.+)$`, 'm');
  const match = raw.match(regex);
  if (!match) return '';
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

function uniqueStrings(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function extractList(raw, key) {
  const regex = new RegExp(`${key}\\s*":\\s*\\[(.*?)\\]`, 'gs');
  const match = raw.match(regex);
  if (!match || match.length === 0) return [];
  const joined = match.join('\n');
  return uniqueStrings([...joined.matchAll(/"([^"]+)"/g)].map((item) => item[1]));
}

function parseSkillFile(filePath, source) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const description = matchField(raw, 'description') || 'No description';
  const name = matchField(raw, 'name') || path.basename(path.dirname(filePath));
  const homepage = matchField(raw, 'homepage');
  const emoji = (raw.match(/"emoji"\s*:\s*"([^"]+)"/) || [])[1] || '';
  const primaryEnv =
    (raw.match(/"primaryEnv"\s*:\s*"([^"]+)"/) || [])[1] ||
    (raw.match(/primaryEnv:\s*"?([^"\n,}]+)"?/) || [])[1] ||
    '';
  const bins = extractList(raw, 'bins');
  const env = uniqueStrings([...extractList(raw, 'env'), primaryEnv]);
  const installKinds = uniqueStrings([...raw.matchAll(/"kind"\s*:\s*"([^"]+)"/g)].map((item) => item[1]));
  const installLabels = uniqueStrings([...raw.matchAll(/"label"\s*:\s*"([^"]+)"/g)].map((item) => item[1]));

  return {
    id: name,
    name,
    description,
    homepage,
    emoji,
    source,
    location: filePath,
    requirements: {
      bins,
      env,
    },
    install: {
      available: installKinds.length > 0,
      kinds: installKinds,
      labels: installLabels,
    },
    hasApiKey: Boolean(primaryEnv),
    primaryEnv,
  };
}

const DEFAULT_PROVIDER_MODELS = {
  openrouter: 'openrouter/anthropic/claude-sonnet-4-5',
  openai: 'openai/gpt-5.4',
  anthropic: 'anthropic/claude-opus-4-6',
  qwen: 'qwen-portal/coder-model',
  'github-copilot': 'github-copilot/gpt-5',
  ollama: 'ollama/qwen2.5-coder:latest',
  glm: 'glm/glm-4.5',
  zai: 'zai/glm-4.5',
  moonshot: 'moonshot/kimi-k2.5',
  mistral: 'mistral/mistral-medium-latest',
  together: 'together/deepseek-ai/DeepSeek-R1',
  minimax: 'minimax/hailuo-02',
  xiaomi: 'xiaomi/mimo-v2-flash',
};

const AUTOMATED_PROVIDER_IDS = new Set(['openrouter', 'openai', 'anthropic']);

function parseProviderFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return parseProviderMarkdown(raw, path.basename(filePath, '.md'));
}

function parseProviderMarkdown(raw, idHint = '') {
  const id = idHint || matchField(raw, 'title').toLowerCase();
  const title = matchField(raw, 'title') || id;
  const summary = matchField(raw, 'summary') || '';
  const automated = AUTOMATED_PROVIDER_IDS.has(id);
  const oauth = /OAuth|device flow/i.test(raw);
  const local = /local models|local server|Ollama|vLLM/i.test(raw);
  const authHint = automated
    ? 'installer'
    : oauth
      ? 'oauth'
      : local
        ? 'manual-local'
        : 'manual';

  return {
    id,
    title,
    summary,
    docPath: '',
    defaultModel: DEFAULT_PROVIDER_MODELS[id] || '',
    automated,
    authHint,
  };
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function baseEntries() {
  return [
    {
      id: 'none',
      title: '先跳过',
      summary: '先把 OpenClaw 和 Gateway 装起来，模型稍后再接。',
      defaultModel: '',
      automated: true,
      authHint: 'skip',
      docPath: '',
      source: 'built-in',
    },
    {
      id: 'custom',
      title: '自定义 Provider',
      summary: '用于自建代理、企业网关，或 OpenAI/Anthropic 兼容接口。',
      defaultModel: '',
      automated: false,
      authHint: 'custom',
      docPath: '',
      source: 'built-in',
    },
  ];
}

function sortProviders(items) {
  const rank = (item) => {
    if (item.id === 'none') return -2;
    if (item.id === 'openrouter') return 0;
    if (item.id === 'openai') return 1;
    if (item.id === 'anthropic') return 2;
    if (item.id === 'ollama') return 3;
    if (item.id === 'custom') return 98;
    return 10;
  };
  return items.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
}

function mergeProviders(items) {
  const map = new Map();
  for (const entry of items) {
    map.set(entry.id, { ...(map.get(entry.id) || {}), ...entry });
  }
  return sortProviders([...map.values()]);
}

function mergeSkills(items) {
  const map = new Map();
  for (const entry of items) {
    map.set(entry.id, { ...(map.get(entry.id) || {}), ...entry });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function getRemoteProviderUrls(options = {}) {
  const manual = uniqueStrings(parseCsvLike(options.providerManifestUrls || options.providerManifestUrl || ''));
  if (manual.length > 0) return manual;

  const rawUrl = 'https://raw.githubusercontent.com/openclaw/openclaw/main/docs/providers/index.md';
  const jsdelivrUrl = 'https://cdn.jsdelivr.net/gh/openclaw/openclaw@main/docs/providers/index.md';
  const fastlyUrl = 'https://fastly.jsdelivr.net/gh/openclaw/openclaw@main/docs/providers/index.md';
  const ghproxyUrl = `https://mirror.ghproxy.com/${rawUrl}`;

  if (options.networkPreset === 'cn') return [jsdelivrUrl, fastlyUrl, ghproxyUrl, rawUrl];
  return [rawUrl, jsdelivrUrl, fastlyUrl, ghproxyUrl];
}

function getRemoteSkillsUrls(options = {}) {
  const manual = uniqueStrings(parseCsvLike(options.skillsManifestUrls || options.skillsManifestUrl || ''));
  return manual;
}

function parseCsvLike(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function fetchTextWithFallback(urls = []) {
  for (const url of urls) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (response.ok) return { url, text: await response.text() };
    } catch {
      // ignore and try next source
    }
  }
  return null;
}

async function fetchJsonWithFallback(urls = []) {
  const result = await fetchTextWithFallback(urls);
  if (!result) return null;
  try {
    return { url: result.url, json: JSON.parse(result.text) };
  } catch {
    return null;
  }
}

function parseProviderIndexMarkdown(raw) {
  const providers = [];
  for (const match of raw.matchAll(/- \[([^\]]+)\]\(\/providers\/([^\)]+)\)/g)) {
    const title = match[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
    const id = match[2].trim();
    providers.push({
      id,
      title,
      summary: '',
      docPath: '',
      defaultModel: DEFAULT_PROVIDER_MODELS[id] || '',
      automated: AUTOMATED_PROVIDER_IDS.has(id),
      authHint: AUTOMATED_PROVIDER_IDS.has(id) ? 'installer' : 'manual',
      source: 'remote',
    });
  }
  return providers;
}

async function discoverProvidersRemote(options = {}) {
  const result = await fetchTextWithFallback(getRemoteProviderUrls(options));
  if (!result) return { items: [], source: 'none' };
  return {
    items: parseProviderIndexMarkdown(result.text),
    source: result.url,
  };
}

export function discoverProvidersLocal(projectRoot) {
  const docsRoot = path.join(
    path.dirname(projectRoot),
    '.nvm/versions/node/v22.22.0/lib/node_modules/openclaw/docs/providers',
  );

  const files = fs.existsSync(docsRoot)
    ? fs
        .readdirSync(docsRoot)
        .filter((name) => name.endsWith('.md') && !['index.md', 'models.md'].includes(name))
        .map((name) => path.join(docsRoot, name))
    : [];

  const packagedProviders = readJsonIfExists(path.join(projectRoot, 'catalog', 'providers.json')) || [];
  const local = files.length > 0
    ? files.map(parseProviderFile).map((item) => ({ ...item, source: 'local-docs' }))
    : packagedProviders.map((item) => ({ ...item, source: item.source || 'packaged' }));

  return mergeProviders([...baseEntries(), ...local]);
}

async function discoverSkillsRemote(options = {}) {
  const result = await fetchJsonWithFallback(getRemoteSkillsUrls(options));
  if (!result || !Array.isArray(result.json)) return { items: [], source: 'none' };
  return {
    items: result.json.map((item) => ({ ...item, source: item.source || 'remote' })),
    source: result.url,
  };
}

export function discoverSkillsLocal(workspace = '~/.openclaw/workspace', projectRoot = '') {
  const packagedSkills = readJsonIfExists(path.join(projectRoot || '', 'catalog', 'skills.json')) || [];
  const skillLocations = [
    { source: 'bundled', root: path.join(os.homedir(), '.nvm/versions/node/v22.22.0/lib/node_modules/openclaw/skills') },
    { source: 'managed', root: path.join(os.homedir(), '.openclaw/skills') },
    { source: 'workspace', root: path.join(expandHome(workspace), 'skills') },
    { source: 'extensions', root: path.join(os.homedir(), '.openclaw/extensions') },
  ];

  const seen = new Map();
  for (const item of skillLocations) {
    const files = item.source === 'extensions'
      ? listFilesRecursive(item.root, (file) => /\/skills\/[^/]+\/SKILL\.md$/.test(file))
      : listFilesRecursive(item.root, (file) => file.endsWith('/SKILL.md'));

    for (const file of files) {
      const skill = parseSkillFile(file, item.source);
      if (!seen.has(skill.id) || seen.get(skill.id).source === 'bundled') {
        seen.set(skill.id, skill);
      }
    }
  }

  const discovered = [...seen.values()];
  for (const skill of packagedSkills) {
    if (!seen.has(skill.id)) discovered.push({ ...skill, source: skill.source || 'packaged' });
  }

  return mergeSkills(discovered);
}

export async function discoverCatalog({ projectRoot, workspace, remote = true, networkPreset = 'global', providerManifestUrl = '', providerManifestUrls = '', skillsManifestUrl = '', skillsManifestUrls = '' }) {
  const localProviders = discoverProvidersLocal(projectRoot);
  const localSkills = discoverSkillsLocal(workspace, projectRoot);

  if (!remote) {
    return {
      providers: localProviders,
      skills: localSkills,
      meta: {
        providerSource: 'local',
        skillsSource: 'local',
      },
    };
  }

  const [remoteProviders, remoteSkills] = await Promise.all([
    discoverProvidersRemote({ networkPreset, providerManifestUrl, providerManifestUrls }),
    discoverSkillsRemote({ networkPreset, skillsManifestUrl, skillsManifestUrls }),
  ]);

  return {
    providers: mergeProviders([...localProviders, ...remoteProviders.items]),
    skills: mergeSkills([...localSkills, ...remoteSkills.items]),
    meta: {
      providerSource: remoteProviders.source !== 'none' ? remoteProviders.source : 'local',
      skillsSource: remoteSkills.source !== 'none' ? remoteSkills.source : 'local',
    },
  };
}
