const $ = (id) => document.getElementById(id);
const desktopApi = window.openclawDesktop || null;

const stepNav = $('stepNav');
const stepBadge = $('stepBadge');
const stepTitle = $('stepTitle');
const stepLead = $('stepLead');
const stepContent = $('stepContent');
const logs = $('logs');
const planBtn = $('planBtn');
const runBtn = $('runBtn');
const nextBtn = $('nextBtn');
const prevBtn = $('prevBtn');
const platformInfo = $('platformInfo');
const catalogInfo = $('catalogInfo');
const reloadCatalogBtn = $('reloadCatalogBtn');

const state = {
  defaults: null,
  currentStep: 0,
  catalog: { providers: [], skills: [] },
  busy: false,
  skillSearch: '',
  form: {
    workspace: '~/.openclaw/workspace',
    networkPreset: 'global',
    catalogRemote: true,
    providerManifestUrl: '',
    skillsManifestUrl: '',
    installerUrl: '',
    npmRegistry: '',
    provider: 'openrouter',
    apiKey: '',
    model: '',
    customProviderId: '',
    customApi: 'openai-completions',
    customBaseUrl: '',
    customModelId: '',
    customModelName: '',
    customApiKey: '',
    force: false,
    skipDoctor: false,
    skipGatewayInstall: false,
    skipGatewayStart: false,
    withTelegram: false,
    telegramBotToken: '',
    telegramRequireMention: true,
    withFeishu: false,
    feishuDomain: 'feishu',
    feishuAppId: '',
    feishuAppSecret: '',
    feishuBotName: 'OpenClaw',
    configureSkills: true,
    skillsExtraDirs: '',
    skillsAllowBundled: '',
    skillsNodeManager: 'npm',
    skillsWatch: true,
    skillsWatchDebounceMs: 250,
    skillsPreferBrew: true,
  },
  skillSelections: {},
};

const steps = [
  {
    title: '欢迎与环境确认',
    lead: '先确认工作目录、扫描本地已知 provider 与 skills，再开始后面的接入配置。这样用户会先知道这次安装器“能配什么”，而不是一上来就填一堆参数。',
    short: '环境确认',
  },
  {
    title: '模型接入',
    lead: '这里决定 OpenClaw 默认用哪个模型提供方。推荐优先选 OpenRouter / OpenAI / Anthropic；如果你有公司内网代理、LiteLLM、vLLM 或其他兼容接口，也可以选自定义或其他已知 provider。',
    short: '模型配置',
  },
  {
    title: '渠道接入',
    lead: '这一步配置机器人会在哪些平台接收消息。建议先至少接一个渠道，部署完成后方便立刻验证：Telegram 比较省事，Feishu 更适合团队场景。',
    short: '渠道配置',
  },
  {
    title: 'Skills 选择与配置',
    lead: '这里会扫描本机已知 skills（bundled / 已安装 / 工作区 / 扩展附带），让你直接选择要启用或禁用哪些能力。需要 API Key 或外部二进制的 skill，也会在这里标出来。',
    short: 'Skills',
  },
  {
    title: '预览与执行',
    lead: '最后一步把前面所有选择汇总成执行计划。建议先做一次 Dry Run，看清配置和命令，再正式安装。',
    short: '执行',
  },
];

async function apiGetDefaults() {
  if (desktopApi) return desktopApi.getDefaults();
  const response = await fetch('/api/defaults');
  return response.json();
}

async function apiGetCatalog(options) {
  if (desktopApi) return desktopApi.getCatalog(options);
  const params = new URLSearchParams({
    workspace: options.workspace || '~/.openclaw/workspace',
    remote: String(options.remote !== false),
    networkPreset: options.networkPreset || 'global',
    providerManifestUrl: options.providerManifestUrl || '',
    skillsManifestUrl: options.skillsManifestUrl || '',
  });
  const response = await fetch(`/api/catalog?${params.toString()}`);
  return response.json();
}

async function apiStartRun(options) {
  if (desktopApi) return desktopApi.run(options);
  const response = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ options }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || '启动失败');
  return payload;
}

async function apiGetRun(runId) {
  if (desktopApi) return desktopApi.getRun(runId);
  const response = await fetch(`/api/run/${runId}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || '读取任务状态失败');
  return payload;
}

function setBusy(busy) {
  state.busy = busy;
  planBtn.disabled = busy;
  runBtn.disabled = busy;
  nextBtn.disabled = busy;
  prevBtn.disabled = busy;
  reloadCatalogBtn.disabled = busy;
}

function currentProvider() {
  return state.catalog.providers.find((item) => item.id === state.form.provider) || state.catalog.providers[0];
}

function escapeHtml(input = '') {
  return String(input)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseEnvPairs(raw) {
  const result = {};
  const items = parseCsv(raw);
  for (const item of items) {
    const index = item.indexOf('=');
    if (index <= 0) throw new Error(`环境变量格式不对：${item}，应为 KEY=VALUE`);
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    result[key] = value;
  }
  return result;
}

function ensureSkillSelection(skillId) {
  if (!state.skillSelections[skillId]) {
    state.skillSelections[skillId] = {
      mode: 'default',
      apiKey: '',
      envPairs: '',
      configJson: '',
    };
  }
  return state.skillSelections[skillId];
}

function buildSkillEntries() {
  const entries = {};
  for (const skill of state.catalog.skills) {
    const selected = ensureSkillSelection(skill.id);
    if (selected.mode === 'default') continue;
    const entry = {
      enabled: selected.mode === 'enable',
    };
    if (selected.apiKey) entry.apiKey = selected.apiKey;
    if (selected.envPairs) entry.env = parseEnvPairs(selected.envPairs);
    if (selected.configJson) {
      let parsed;
      try {
        parsed = JSON.parse(selected.configJson);
      } catch (error) {
        throw new Error(`skill [${skill.name}] 的 config JSON 不合法：${error.message}`);
      }
      entry.config = parsed;
    }
    entries[skill.id] = entry;
  }
  return entries;
}

function buildManualProviderNote(provider, modelRef) {
  if (!provider || ['none', 'custom', 'openrouter', 'openai', 'anthropic'].includes(provider.id)) return '';
  return `你选择了 ${provider.title}。当前安装器会先把默认模型写成 ${modelRef || `${provider.id}/...`}，认证建议在安装后按官方文档单独完成。`;
}

function collectOptions({ dryRun }) {
  const provider = currentProvider();
  const modelFallback = provider?.defaultModel || '';
  const options = {
    workspace: state.form.workspace.trim() || '~/.openclaw/workspace',
    provider: state.form.provider,
    apiKey: state.form.apiKey.trim(),
    model: (state.form.model || modelFallback).trim(),
    force: state.form.force,
    dryRun,
    skipDoctor: state.form.skipDoctor,
    skipGatewayInstall: state.form.skipGatewayInstall,
    skipGatewayStart: state.form.skipGatewayStart,
    withTelegram: state.form.withTelegram,
    telegramBotToken: state.form.telegramBotToken.trim(),
    telegramRequireMention: state.form.telegramRequireMention,
    withFeishu: state.form.withFeishu,
    feishuDomain: state.form.feishuDomain,
    feishuAppId: state.form.feishuAppId.trim(),
    feishuAppSecret: state.form.feishuAppSecret.trim(),
    feishuBotName: state.form.feishuBotName.trim() || 'OpenClaw',
    configureSkills: state.form.configureSkills,
    skillsExtraDirs: parseCsv(state.form.skillsExtraDirs),
    skillsAllowBundled: parseCsv(state.form.skillsAllowBundled),
    skillsNodeManager: state.form.skillsNodeManager,
    skillsWatch: state.form.skillsWatch,
    skillsWatchDebounceMs: Number(state.form.skillsWatchDebounceMs || 250),
    skillsPreferBrew: state.form.skillsPreferBrew,
    skillEntries: state.form.configureSkills ? buildSkillEntries() : {},
    customProviderId: state.form.customProviderId.trim(),
    customApi: state.form.customApi,
    customBaseUrl: state.form.customBaseUrl.trim(),
    customModelId: state.form.customModelId.trim(),
    customModelName: state.form.customModelName.trim(),
    customApiKey: state.form.customApiKey.trim(),
    networkPreset: state.form.networkPreset,
    providerManifestUrl: state.form.providerManifestUrl.trim(),
    skillsManifestUrl: state.form.skillsManifestUrl.trim(),
    installerUrl: state.form.installerUrl.trim(),
    npmRegistry: state.form.npmRegistry.trim(),
    skipAuth: false,
  };

  if (provider?.id === 'none') {
    options.provider = 'none';
    options.model = '';
    options.skipAuth = true;
  } else if (provider?.id === 'custom') {
    options.provider = 'custom';
    options.model = state.form.model.trim() || (options.customProviderId && options.customModelId ? `${options.customProviderId}/${options.customModelId}` : '');
  } else if (!['openrouter', 'openai', 'anthropic'].includes(provider?.id || '')) {
    options.provider = 'none';
    options.skipAuth = true;
    options.model = state.form.model.trim() || modelFallback;
  }

  return options;
}

function selectedSkillsCount() {
  return Object.values(state.skillSelections).filter((item) => item.mode !== 'default').length;
}

function syncProviderDefaults(providerId) {
  const provider = state.catalog.providers.find((item) => item.id === providerId);
  if (!provider) return;
  state.form.provider = providerId;
  if (!state.form.model || state.form.model === currentProvider()?.defaultModel) {
    state.form.model = provider.defaultModel || state.form.model;
  }
  if (providerId === 'custom' && !state.form.customProviderId) {
    state.form.customProviderId = 'myproxy';
    state.form.customApi = 'openai-completions';
    state.form.customBaseUrl = 'https://example.com/v1';
    state.form.customModelId = 'gpt-4.1';
    state.form.customModelName = 'My Proxy GPT-4.1';
  }
}

function providerSectionHtml() {
  const recommendedIds = ['none', 'openrouter', 'openai', 'anthropic', 'custom'];
  const recommended = state.catalog.providers.filter((item) => recommendedIds.includes(item.id));
  const others = state.catalog.providers.filter((item) => !recommendedIds.includes(item.id));
  const selected = currentProvider();
  const renderCard = (provider) => `
    <button type="button" class="card-choice ${provider.id === selected?.id ? 'selected' : ''}" data-provider-card="${escapeHtml(provider.id)}">
      <h4>${escapeHtml(provider.title)}</h4>
      <div class="badges">
        ${provider.automated ? '<span class="badge good">安装器可直接配置</span>' : ''}
        ${provider.authHint === 'oauth' ? '<span class="badge warn">安装后登录 / OAuth</span>' : ''}
        ${provider.authHint === 'manual' || provider.authHint === 'manual-local' ? '<span class="badge info">安装后手动接入</span>' : ''}
        ${provider.authHint === 'custom' ? '<span class="badge info">兼容接口 / 自建代理</span>' : ''}
      </div>
      <div class="inline-help">${escapeHtml(provider.summary || '')}</div>
      ${provider.defaultModel ? `<div class="skill-meta">建议默认模型：${escapeHtml(provider.defaultModel)}</div>` : ''}
    </button>
  `;

  const provider = selected;
  const manualNote = buildManualProviderNote(provider, state.form.model || provider?.defaultModel);

  let detailHtml = '';
  if (provider?.id === 'none') {
    detailHtml = `
      <div class="callout">
        <strong>这一步会跳过模型接入</strong>
        安装器会先把 OpenClaw 和 Gateway 部署好，不会现在写默认模型，也不会执行任何模型认证。适合先把环境装起来，后面再慢慢接模型。
      </div>
    `;
  } else if (provider?.id === 'custom') {
    detailHtml = `
      <div class="grid">
        <label>Provider ID
          <input id="customProviderId" type="text" value="${escapeHtml(state.form.customProviderId)}" placeholder="例如 myproxy" />
        </label>
        <label>API Adapter
          <select id="customApi">
            ${['openai-completions', 'openai-responses', 'anthropic-messages', 'google-generative-ai']
              .map((value) => `<option value="${value}" ${state.form.customApi === value ? 'selected' : ''}>${value}</option>`)
              .join('')}
          </select>
        </label>
        <label>Base URL
          <input id="customBaseUrl" type="text" value="${escapeHtml(state.form.customBaseUrl)}" placeholder="https://example.com/v1" />
        </label>
        <label>Model ID
          <input id="customModelId" type="text" value="${escapeHtml(state.form.customModelId)}" placeholder="例如 gpt-4.1" />
        </label>
        <label>Model Name
          <input id="customModelName" type="text" value="${escapeHtml(state.form.customModelName)}" placeholder="可留空" />
        </label>
        <label>API Key
          <input id="customApiKey" type="password" value="${escapeHtml(state.form.customApiKey)}" placeholder="可留空" />
        </label>
        <label>默认模型引用
          <input id="model" type="text" value="${escapeHtml(state.form.model)}" placeholder="例如 myproxy/gpt-4.1" />
        </label>
      </div>
      <div class="callout">
        <strong>什么时候选它？</strong>
        当你有公司网关、LiteLLM、vLLM、Claude/OpenAI 兼容代理，或者自己封装了一层统一接口时，用这个入口最合适。
      </div>
    `;
  } else {
    const apiLabel = provider?.id === 'openrouter' ? 'OpenRouter API Key' : provider?.id === 'openai' ? 'OpenAI API Key' : provider?.id === 'anthropic' ? 'Anthropic API Key' : '安装后手动认证';
    detailHtml = `
      <div class="grid">
        <label>默认模型引用
          <input id="model" type="text" value="${escapeHtml(state.form.model || provider?.defaultModel || '')}" placeholder="${escapeHtml(provider?.defaultModel || `${provider?.id || ''}/...`)}" />
        </label>
        ${provider?.automated ? `
          <label>${apiLabel}
            <input id="apiKey" type="password" value="${escapeHtml(state.form.apiKey)}" placeholder="可留空，后面也能手动 onboard" />
          </label>
        ` : `
          <div class="callout">
            <strong>这类 provider 当前按官方流程手动接入更稳</strong>
            ${escapeHtml(manualNote || provider?.summary || '')}
          </div>
        `}
      </div>
      <div class="callout">
        <strong>说明</strong>
        ${escapeHtml(provider?.summary || '')}
      </div>
    `;
  }

  return `
    <div class="stack">
      <div class="callout">
        <strong>推荐顺序</strong>
        如果你是第一次部署：优先选 <b>OpenRouter</b>；如果你是公司内部已有统一模型接口：优先选 <b>自定义 Provider</b>；如果今天只想先把服务跑起来：直接选 <b>先跳过</b>。
      </div>
      <div class="stack">
        <div class="section-head"><h3>推荐入口</h3><p class="muted">这些选项是安装器已经做了较完整适配的。</p></div>
        <div class="provider-grid">${recommended.map(renderCard).join('')}</div>
      </div>
      <div class="stack">
        <div class="section-head"><h3>更多本机已知 Provider</h3><p class="muted">这些 provider 来自 OpenClaw 本地文档。你也可以先写默认模型，安装后再按官方流程完成认证。</p></div>
        <div class="provider-grid">${others.map(renderCard).join('')}</div>
      </div>
      <div class="divider"></div>
      <div class="stack">
        <div class="section-head"><h3>当前选择：${escapeHtml(selected?.title || '')}</h3><p class="muted">下面只展示当前 provider 需要填写的字段。</p></div>
        ${detailHtml}
      </div>
    </div>
  `;
}

function channelsSectionHtml() {
  return `
    <div class="stack">
      <div class="callout">
        <strong>怎么选渠道？</strong>
        个人自测最省事的是 Telegram；团队或企业内部更适合 Feishu / Lark。你也可以先不接渠道，只部署服务本体，安装后再补。
      </div>
      <div class="two-col">
        <div class="stack">
          <div class="card-choice ${state.form.withTelegram ? 'selected' : ''}">
            <h4>Telegram</h4>
            <div class="badges"><span class="badge good">原生支持</span><span class="badge info">适合先快速联调</span></div>
            <div class="inline-help">需要先在 @BotFather 创建 Bot，拿到 Bot Token。群里默认建议要求 @ 触发，避免刷屏。</div>
            <label class="checkbox-line"><input id="withTelegram" type="checkbox" ${state.form.withTelegram ? 'checked' : ''} /> 启用 Telegram</label>
            <div class="grid ${state.form.withTelegram ? '' : 'hidden'}" id="telegramConfigBlock">
              <label>Telegram Bot Token
                <input id="telegramBotToken" type="password" value="${escapeHtml(state.form.telegramBotToken)}" placeholder="可留空" />
              </label>
              <label class="checkbox-line"><input id="telegramRequireMention" type="checkbox" ${state.form.telegramRequireMention ? 'checked' : ''} /> 群聊默认需要 @ 才触发</label>
            </div>
          </div>
        </div>
        <div class="stack">
          <div class="card-choice ${state.form.withFeishu ? 'selected' : ''}">
            <h4>Feishu / Lark</h4>
            <div class="badges"><span class="badge good">插件自动安装</span><span class="badge info">适合团队内部</span></div>
            <div class="inline-help">需要企业自建应用、Bot 能力、App ID / App Secret，以及事件订阅长连接。安装器会自动安装 Feishu 插件。</div>
            <label class="checkbox-line"><input id="withFeishu" type="checkbox" ${state.form.withFeishu ? 'checked' : ''} /> 启用 Feishu / Lark</label>
            <div class="grid ${state.form.withFeishu ? '' : 'hidden'}" id="feishuConfigBlock">
              <label>域名
                <select id="feishuDomain">
                  <option value="feishu" ${state.form.feishuDomain === 'feishu' ? 'selected' : ''}>feishu</option>
                  <option value="lark" ${state.form.feishuDomain === 'lark' ? 'selected' : ''}>lark</option>
                </select>
              </label>
              <label>App ID
                <input id="feishuAppId" type="text" value="${escapeHtml(state.form.feishuAppId)}" placeholder="cli_xxx" />
              </label>
              <label>App Secret
                <input id="feishuAppSecret" type="password" value="${escapeHtml(state.form.feishuAppSecret)}" placeholder="可留空" />
              </label>
              <label>Bot 名称
                <input id="feishuBotName" type="text" value="${escapeHtml(state.form.feishuBotName)}" />
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="callout">
        <strong>建议</strong>
        如果你后面还要给别人发安装包，我建议默认把 Telegram 和 Feishu 都做成可选，而不是强制其中一个。这样个人用户和团队用户都能用同一套安装器。
      </div>
    </div>
  `;
}

function renderSkillCard(skill) {
  const selection = ensureSkillSelection(skill.id);
  const matchesSearch = !state.skillSearch || `${skill.name} ${skill.description} ${skill.source}`.toLowerCase().includes(state.skillSearch.toLowerCase());
  if (!matchesSearch) return '';
  const badges = [
    `<span class="badge info">${escapeHtml(skill.source)}</span>`,
    skill.hasApiKey ? `<span class="badge warn">需要 ${escapeHtml(skill.primaryEnv)}</span>` : `<span class="badge good">无需 API Key</span>`,
    skill.install.available ? `<span class="badge info">可安装依赖：${escapeHtml(skill.install.kinds.join(', '))}</span>` : '',
  ].filter(Boolean).join('');
  const requirements = [
    skill.requirements.bins.length ? `二进制：${skill.requirements.bins.join(', ')}` : '',
    skill.requirements.env.length ? `环境变量：${skill.requirements.env.join(', ')}` : '',
    skill.install.labels.length ? `建议安装：${skill.install.labels.join(' / ')}` : '',
  ].filter(Boolean).join(' · ');

  return `
    <div class="card-choice ${selection.mode !== 'default' ? 'selected' : ''}">
      <h4>${escapeHtml(skill.emoji || '🧩')} ${escapeHtml(skill.name)}</h4>
      <div class="badges">${badges}</div>
      <div class="inline-help">${escapeHtml(skill.description)}</div>
      <div class="skill-meta">${escapeHtml(requirements || '这个 skill 没有额外要求说明。')}</div>
      <div class="skill-config">
        <label>处理方式
          <select data-skill-mode="${escapeHtml(skill.id)}">
            <option value="default" ${selection.mode === 'default' ? 'selected' : ''}>保持默认</option>
            <option value="enable" ${selection.mode === 'enable' ? 'selected' : ''}>启用 / 写入 enabled: true</option>
            <option value="disable" ${selection.mode === 'disable' ? 'selected' : ''}>禁用 / 写入 enabled: false</option>
          </select>
        </label>
        ${selection.mode !== 'default' ? `
          ${skill.hasApiKey ? `
            <label>${escapeHtml(skill.primaryEnv || 'API Key')}
              <input type="password" data-skill-apikey="${escapeHtml(skill.id)}" value="${escapeHtml(selection.apiKey)}" placeholder="可留空" />
            </label>
          ` : ''}
          <label>额外 env（多个用 KEY=VALUE,KEY2=VALUE2）
            <input type="text" data-skill-env="${escapeHtml(skill.id)}" value="${escapeHtml(selection.envPairs)}" placeholder="可留空" />
          </label>
          <label>高级 config JSON
            <textarea data-skill-config="${escapeHtml(skill.id)}" placeholder='例如 {"endpoint":"https://example.com"}'>${escapeHtml(selection.configJson)}</textarea>
          </label>
        ` : ''}
      </div>
    </div>
  `;
}

function skillsSectionHtml() {
  const visibleSkills = state.catalog.skills.filter((skill) => !state.skillSearch || `${skill.name} ${skill.description} ${skill.source}`.toLowerCase().includes(state.skillSearch.toLowerCase()));
  return `
    <div class="stack">
      <div class="callout">
        <strong>这一步怎么理解？</strong>
        OpenClaw 的 skills 就像“给助手加能力包”。这里会把本机扫描到的技能都列出来，包括 bundled skills、工作区 skills、已安装 managed skills、以及扩展附带的 skills。你可以决定哪些要显式启用、哪些要禁用、哪些要补 API Key。
      </div>
      <label class="checkbox-line"><input id="configureSkills" type="checkbox" ${state.form.configureSkills ? 'checked' : ''} /> 把 skills 配置写进 openclaw.json</label>
      <div class="grid ${state.form.configureSkills ? '' : 'hidden'}" id="skillsGlobalConfig">
        <label>extraDirs（多个用逗号分隔）
          <input id="skillsExtraDirs" type="text" value="${escapeHtml(state.form.skillsExtraDirs)}" placeholder="~/my-skills,~/team-skills" />
        </label>
        <label>allowBundled（多个用逗号分隔）
          <input id="skillsAllowBundled" type="text" value="${escapeHtml(state.form.skillsAllowBundled)}" placeholder="weather,apple-notes" />
        </label>
        <label>nodeManager
          <select id="skillsNodeManager">
            ${['npm', 'pnpm', 'yarn', 'bun'].map((value) => `<option value="${value}" ${state.form.skillsNodeManager === value ? 'selected' : ''}>${value}</option>`).join('')}
          </select>
        </label>
        <label>watchDebounceMs
          <input id="skillsWatchDebounceMs" type="number" min="0" value="${escapeHtml(String(state.form.skillsWatchDebounceMs))}" />
        </label>
        <label class="checkbox-line"><input id="skillsWatch" type="checkbox" ${state.form.skillsWatch ? 'checked' : ''} /> 开启 skills watcher</label>
        <label class="checkbox-line"><input id="skillsPreferBrew" type="checkbox" ${state.form.skillsPreferBrew ? 'checked' : ''} /> 安装依赖时优先 brew</label>
      </div>
      <div class="kpi-row">
        <div class="kpi"><span class="muted">已扫描 skills</span><strong>${state.catalog.skills.length}</strong></div>
        <div class="kpi"><span class="muted">当前筛选结果</span><strong>${visibleSkills.length}</strong></div>
        <div class="kpi"><span class="muted">将写入配置的 skills</span><strong>${selectedSkillsCount()}</strong></div>
      </div>
      <div class="search-bar">
        <input id="skillSearch" type="text" value="${escapeHtml(state.skillSearch)}" placeholder="搜索 skill 名称、描述、来源，例如 weather / github / voice" />
        <button id="clearSkillSearch" class="ghost">清空筛选</button>
      </div>
      <div class="skills-grid">
        ${visibleSkills.map(renderSkillCard).join('') || '<div class="callout"><strong>没搜到结果</strong>换个关键词试试，或者先清空筛选。</div>'}
      </div>
    </div>
  `;
}

function reviewSectionHtml() {
  const provider = currentProvider();
  const options = (() => {
    try {
      return collectOptions({ dryRun: true });
    } catch (error) {
      return { __error: error.message };
    }
  })();

  const selectedSkills = Object.entries(state.skillSelections)
    .filter(([, value]) => value.mode !== 'default')
    .map(([key, value]) => `${key} → ${value.mode === 'enable' ? '启用' : '禁用'}`);

  const manualNote = buildManualProviderNote(provider, options.model);

  return `
    <div class="stack">
      <div class="callout">
        <strong>执行前建议</strong>
        先点一次 <b>Dry Run</b>，确认配置文件、默认模型、skills 和渠道都对，再点正式安装。这样出错时更容易看清是哪一层配置有问题。
      </div>
      ${options.__error ? `<div class="callout"><strong>当前表单有问题</strong>${escapeHtml(options.__error)}</div>` : ''}
      <div class="summary-list">
        <div class="summary-item">
          <strong>步骤 1：基础环境</strong>
          工作目录：${escapeHtml(state.form.workspace)}<br />
          网络预设：${escapeHtml(state.form.networkPreset)}<br />
          目录来源：${state.form.catalogRemote ? '在线优先，本地回退' : '仅本地'}<br />
          npm 镜像：${escapeHtml(state.form.npmRegistry || '（默认）')}
        </div>
        <div class="summary-item">
          <strong>步骤 2：模型</strong>
          Provider：${escapeHtml(provider?.title || '')}<br />
          默认模型：${escapeHtml(options.model || '（未设置）')}<br />
          ${manualNote ? `<span class="muted">${escapeHtml(manualNote)}</span>` : '<span class="muted">安装器会按当前选择尝试自动配置或跳过认证。</span>'}
        </div>
        <div class="summary-item">
          <strong>步骤 3：渠道</strong>
          Telegram：${state.form.withTelegram ? '开启' : '关闭'}<br />
          Feishu / Lark：${state.form.withFeishu ? '开启' : '关闭'}
        </div>
        <div class="summary-item">
          <strong>步骤 4：Skills</strong>
          Skills 配置：${state.form.configureSkills ? '写入配置' : '跳过'}<br />
          ${selectedSkills.length ? escapeHtml(selectedSkills.join('；')) : '<span class="muted">没有显式启用或禁用的 skill 条目，保持默认。</span>'}
        </div>
        <div class="summary-item">
          <strong>步骤 5：执行策略</strong>
          doctor：${state.form.skipDoctor ? '跳过' : '执行'}<br />
          gateway install：${state.form.skipGatewayInstall ? '跳过' : '执行'}<br />
          gateway start：${state.form.skipGatewayStart ? '跳过' : '执行'}<br />
          覆盖已有配置：${state.form.force ? '是（会自动备份）' : '否'}
        </div>
      </div>
    </div>
  `;
}

function welcomeSectionHtml() {
  return `
    <div class="stack">
      <div class="callout">
        <strong>整个部署流程会怎么走？</strong>
        这套安装器不是把所有选项一次性堆给你，而是按照真正部署顺序来：先确认环境 → 再选模型 → 再接渠道 → 再决定 skills → 最后统一预览和执行。这里还会把“网络与镜像策略”放在第一步，因为它会影响在线列表获取、依赖下载和国内网络体验。
      </div>
      <div class="kpi-row">
        <div class="kpi"><span class="muted">当前可见 Provider</span><strong>${state.catalog.providers.length}</strong></div>
        <div class="kpi"><span class="muted">当前可见 Skills</span><strong>${state.catalog.skills.length}</strong></div>
        <div class="kpi"><span class="muted">当前目录源</span><strong>${state.form.catalogRemote ? '在线优先' : '仅本地'}</strong></div>
      </div>
      <div class="grid">
        <label>OpenClaw 工作目录
          <input id="workspace" type="text" value="${escapeHtml(state.form.workspace)}" placeholder="~/.openclaw/workspace" />
        </label>
        <label>网络预设
          <select id="networkPreset">
            <option value="global" ${state.form.networkPreset === 'global' ? 'selected' : ''}>global（默认直连）</option>
            <option value="cn" ${state.form.networkPreset === 'cn' ? 'selected' : ''}>cn（优先国内友好源 / CDN）</option>
          </select>
        </label>
        <label class="checkbox-line"><input id="catalogRemote" type="checkbox" ${state.form.catalogRemote ? 'checked' : ''} /> 在线获取 Provider / Skills 列表（失败时回退本地）</label>
        <label>远程 Provider 索引 URL（可留空）
          <input id="providerManifestUrl" type="text" value="${escapeHtml(state.form.providerManifestUrl)}" placeholder="可自定义在线 provider 索引 URL" />
        </label>
        <label>远程 Skills Manifest URL（可留空）
          <input id="skillsManifestUrl" type="text" value="${escapeHtml(state.form.skillsManifestUrl)}" placeholder="可自定义在线 skills JSON URL" />
        </label>
        <label>OpenClaw 安装脚本镜像 URL（可留空）
          <input id="installerUrl" type="text" value="${escapeHtml(state.form.installerUrl)}" placeholder="例如 https://your-mirror.example.com/openclaw/install.sh" />
        </label>
        <label>npm Registry / 镜像（可留空）
          <input id="npmRegistry" type="text" value="${escapeHtml(state.form.npmRegistry)}" placeholder="例如 https://registry.npmmirror.com" />
        </label>
        <div class="callout">
          <strong>为什么这里先问网络和镜像？</strong>
          因为在线 provider / skills 列表、Electron 依赖下载、以及后续 OpenClaw 安装，都可能受网络影响。国内环境下，提前配置 npm 镜像和在线目录源，会比装到一半再失败好很多。
        </div>
      </div>
      <div class="summary-list">
        <div class="summary-item"><strong>在线列表策略</strong>Provider 列表默认可从 OpenClaw 官方线上文档拉取；Skills 支持在线 manifest URL，自定义后就能把“远程技能市场”并入本地扫描结果。</div>
        <div class="summary-item"><strong>国内网络建议</strong>如果你在国内，建议把“网络预设”切到 <b>cn</b>，并填写 npm 镜像，例如 <code>https://registry.npmmirror.com</code>。</div>
        <div class="summary-item"><strong>如果你只想最快装起来</strong>建议选：OpenRouter + Telegram + 少量 skills，然后先 Dry Run 一次。</div>
      </div>
    </div>
  `;
}

function renderStepNav() {
  stepNav.innerHTML = steps
    .map((step, index) => `
      <li class="${index === state.currentStep ? 'active' : ''} ${index < state.currentStep ? 'done' : ''}">
        <div class="step-index">${index + 1}</div>
        <div class="step-text">
          <strong>${escapeHtml(step.short)}</strong>
          <span>${escapeHtml(step.lead)}</span>
        </div>
      </li>
    `)
    .join('');
}

function bindWelcome() {
  ['workspace', 'providerManifestUrl', 'skillsManifestUrl', 'installerUrl', 'npmRegistry'].forEach((id) => {
    const element = $(id);
    if (!element) return;
    element.addEventListener('input', (event) => {
      state.form[id] = event.target.value;
    });
  });

  ['networkPreset'].forEach((id) => {
    const element = $(id);
    if (!element) return;
    element.addEventListener('change', (event) => {
      state.form[id] = event.target.value;
    });
  });

  ['catalogRemote'].forEach((id) => {
    const element = $(id);
    if (!element) return;
    element.addEventListener('change', (event) => {
      state.form[id] = event.target.checked;
    });
  });
}

function bindProviders() {
  stepContent.querySelectorAll('[data-provider-card]').forEach((button) => {
    button.addEventListener('click', () => {
      syncProviderDefaults(button.dataset.providerCard);
      renderCurrentStep();
    });
  });

  ['apiKey', 'model', 'customProviderId', 'customApi', 'customBaseUrl', 'customModelId', 'customModelName', 'customApiKey'].forEach((id) => {
    const element = $(id);
    if (!element) return;
    element.addEventListener('input', (event) => {
      state.form[id] = event.target.value;
    });
    element.addEventListener('change', (event) => {
      state.form[id] = event.target.value;
      if (id === 'customProviderId' || id === 'customModelId') {
        const modelRef = state.form.customProviderId && state.form.customModelId ? `${state.form.customProviderId}/${state.form.customModelId}` : '';
        if (!state.form.model || state.form.provider === 'custom') state.form.model = modelRef;
      }
    });
  });
}

function bindChannels() {
  ['telegramBotToken', 'feishuAppId', 'feishuAppSecret', 'feishuBotName'].forEach((id) => {
    const element = $(id);
    if (!element) return;
    element.addEventListener('input', (event) => {
      state.form[id] = event.target.value;
    });
  });

  ['withTelegram', 'telegramRequireMention', 'withFeishu'].forEach((id) => {
    const element = $(id);
    if (!element) return;
    element.addEventListener('change', (event) => {
      state.form[id] = event.target.checked;
      renderCurrentStep();
    });
  });

  ['feishuDomain'].forEach((id) => {
    const element = $(id);
    if (!element) return;
    element.addEventListener('change', (event) => {
      state.form[id] = event.target.value;
    });
  });
}

function bindSkills() {
  ['configureSkills', 'skillsWatch', 'skillsPreferBrew'].forEach((id) => {
    const element = $(id);
    if (!element) return;
    element.addEventListener('change', (event) => {
      state.form[id] = event.target.checked;
      renderCurrentStep();
    });
  });

  ['skillsExtraDirs', 'skillsAllowBundled', 'skillsNodeManager', 'skillsWatchDebounceMs'].forEach((id) => {
    const element = $(id);
    if (!element) return;
    const eventName = element.tagName === 'SELECT' ? 'change' : 'input';
    element.addEventListener(eventName, (event) => {
      state.form[id] = event.target.value;
    });
  });

  $('skillSearch')?.addEventListener('input', (event) => {
    state.skillSearch = event.target.value;
    renderCurrentStep();
  });
  $('clearSkillSearch')?.addEventListener('click', () => {
    state.skillSearch = '';
    renderCurrentStep();
  });

  stepContent.querySelectorAll('[data-skill-mode]').forEach((element) => {
    element.addEventListener('change', (event) => {
      ensureSkillSelection(event.target.dataset.skillMode).mode = event.target.value;
      renderCurrentStep();
    });
  });
  stepContent.querySelectorAll('[data-skill-apikey]').forEach((element) => {
    element.addEventListener('input', (event) => {
      ensureSkillSelection(event.target.dataset.skillApikey).apiKey = event.target.value;
    });
  });
  stepContent.querySelectorAll('[data-skill-env]').forEach((element) => {
    element.addEventListener('input', (event) => {
      ensureSkillSelection(event.target.dataset.skillEnv).envPairs = event.target.value;
    });
  });
  stepContent.querySelectorAll('[data-skill-config]').forEach((element) => {
    element.addEventListener('input', (event) => {
      ensureSkillSelection(event.target.dataset.skillConfig).configJson = event.target.value;
    });
  });
}

function renderCurrentStep() {
  const step = steps[state.currentStep];
  stepBadge.textContent = `步骤 ${state.currentStep + 1} / ${steps.length}`;
  stepTitle.textContent = step.title;
  stepLead.textContent = step.lead;

  if (state.currentStep === 0) {
    stepContent.innerHTML = welcomeSectionHtml();
    bindWelcome();
  } else if (state.currentStep === 1) {
    stepContent.innerHTML = providerSectionHtml();
    bindProviders();
  } else if (state.currentStep === 2) {
    stepContent.innerHTML = channelsSectionHtml();
    bindChannels();
  } else if (state.currentStep === 3) {
    stepContent.innerHTML = skillsSectionHtml();
    bindSkills();
  } else {
    stepContent.innerHTML = reviewSectionHtml();
  }

  prevBtn.classList.toggle('hidden', state.currentStep === 0);
  nextBtn.classList.toggle('hidden', state.currentStep === steps.length - 1);
  planBtn.classList.toggle('hidden', state.currentStep !== steps.length - 1);
  runBtn.classList.toggle('hidden', state.currentStep !== steps.length - 1);
  renderStepNav();
}

async function loadCatalog() {
  catalogInfo.textContent = state.form.catalogRemote ? '正在从线上优先、本地回退地扫描 Provider 与 Skills…' : '正在扫描本地 Provider 与 Skills…';
  const catalog = await apiGetCatalog({
    workspace: state.form.workspace,
    remote: state.form.catalogRemote,
    networkPreset: state.form.networkPreset,
    providerManifestUrl: state.form.providerManifestUrl,
    skillsManifestUrl: state.form.skillsManifestUrl,
  });
  state.catalog = catalog;
  if (!state.catalog.providers.find((item) => item.id === state.form.provider)) {
    state.form.provider = 'openrouter';
  }
  state.catalog.skills.forEach((skill) => ensureSkillSelection(skill.id));
  const providerSource = catalog.meta?.providerSource || 'local';
  const skillsSource = catalog.meta?.skillsSource || 'local';
  catalogInfo.textContent = `已发现 ${catalog.providers.length} 个 provider，${catalog.skills.length} 个 skills · provider源：${providerSource} · skills源：${skillsSource}`;
  renderCurrentStep();
}

async function pollRun(runId) {
  while (true) {
    const payload = await apiGetRun(runId);
    logs.textContent = payload.logs || '暂无日志';
    logs.scrollTop = logs.scrollHeight;

    if (payload.status === 'finished' || payload.status === 'failed') {
      setBusy(false);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function startRun(dryRun) {
  let options;
  try {
    options = collectOptions({ dryRun });
  } catch (error) {
    logs.textContent = `参数整理失败：${error.message}`;
    return;
  }

  logs.textContent = dryRun ? '正在执行 Dry Run…' : '正在开始安装…';
  setBusy(true);

  try {
    const payload = await apiStartRun(options);
    await pollRun(payload.runId);
  } catch (error) {
    setBusy(false);
    logs.textContent = error.message || '启动失败';
  }
}

reloadCatalogBtn.addEventListener('click', loadCatalog);
prevBtn.addEventListener('click', () => {
  if (state.currentStep > 0) {
    state.currentStep -= 1;
    renderCurrentStep();
  }
});
nextBtn.addEventListener('click', () => {
  if (state.currentStep < steps.length - 1) {
    state.currentStep += 1;
    renderCurrentStep();
  }
});
planBtn.addEventListener('click', () => startRun(true));
runBtn.addEventListener('click', () => startRun(false));

(async () => {
  state.defaults = await apiGetDefaults();
  platformInfo.textContent = `当前平台：${state.defaults.platform} · 当前模式：${state.defaults.mode === 'desktop' ? '桌面安装器' : '浏览器图形安装器'}`;
  await loadCatalog();
})();
