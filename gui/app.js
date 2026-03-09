const $ = (id) => document.getElementById(id);

const provider = $('provider');
const customProviderCard = $('customProviderCard');
const withTelegram = $('withTelegram');
const telegramFields = $('telegramFields');
const withFeishu = $('withFeishu');
const feishuFields = $('feishuFields');
const configureSkills = $('configureSkills');
const skillsFields = $('skillsFields');
const logs = $('logs');
const planBtn = $('planBtn');
const runBtn = $('runBtn');
const platformInfo = $('platformInfo');
const desktopApi = window.openclawDesktop || null;

function toggleSection(element, visible) {
  element.classList.toggle('hidden', !visible);
}

function parseCsv(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readJsonTextarea() {
  const raw = $('skillEntriesJson').value.trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function collectOptions({ dryRun }) {
  const options = {
    workspace: $('workspace').value.trim() || '~/.openclaw/workspace',
    provider: provider.value,
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim(),
    force: $('force').checked,
    dryRun,
    skipDoctor: $('skipDoctor').checked,
    skipGatewayInstall: $('skipGatewayInstall').checked,
    skipGatewayStart: $('skipGatewayStart').checked,
    withTelegram: withTelegram.checked,
    telegramBotToken: $('telegramBotToken').value.trim(),
    telegramRequireMention: $('telegramRequireMention').checked,
    withFeishu: withFeishu.checked,
    feishuDomain: $('feishuDomain').value,
    feishuAppId: $('feishuAppId').value.trim(),
    feishuAppSecret: $('feishuAppSecret').value.trim(),
    feishuBotName: $('feishuBotName').value.trim(),
    configureSkills: configureSkills.checked,
    skillsExtraDirs: parseCsv($('skillsExtraDirs').value),
    skillsAllowBundled: parseCsv($('skillsAllowBundled').value),
    skillsNodeManager: $('skillsNodeManager').value,
    skillsWatch: $('skillsWatch').checked,
    skillsWatchDebounceMs: Number($('skillsWatchDebounceMs').value || '250'),
    skillsPreferBrew: $('skillsPreferBrew').checked,
    skillEntries: readJsonTextarea(),
    customProviderId: $('customProviderId').value.trim(),
    customApi: $('customApi').value,
    customBaseUrl: $('customBaseUrl').value.trim(),
    customModelId: $('customModelId').value.trim(),
    customModelName: $('customModelName').value.trim(),
    customApiKey: $('customApiKey').value.trim(),
  };

  if (options.provider === 'none') {
    options.skipAuth = true;
  }

  return options;
}

function setBusy(busy) {
  planBtn.disabled = busy;
  runBtn.disabled = busy;
}

async function apiGetDefaults() {
  if (desktopApi) return desktopApi.getDefaults();
  const response = await fetch('/api/defaults');
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

async function startRun(dryRun) {
  let options;
  try {
    options = collectOptions({ dryRun });
  } catch (error) {
    logs.textContent = `JSON 解析失败：${error.message}`;
    return;
  }

  logs.textContent = '正在启动任务...';
  setBusy(true);

  try {
    const payload = await apiStartRun(options);
    const { runId } = payload;
    await pollRun(runId);
  } catch (error) {
    setBusy(false);
    logs.textContent = error.message || '启动失败';
  }
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

provider.addEventListener('change', () => toggleSection(customProviderCard, provider.value === 'custom'));
withTelegram.addEventListener('change', () => toggleSection(telegramFields, withTelegram.checked));
withFeishu.addEventListener('change', () => toggleSection(feishuFields, withFeishu.checked));
configureSkills.addEventListener('change', () => toggleSection(skillsFields, configureSkills.checked));
planBtn.addEventListener('click', () => startRun(true));
runBtn.addEventListener('click', () => startRun(false));

(async () => {
  const payload = await apiGetDefaults();
  const modeLabel = payload.mode === 'desktop' ? '桌面安装器' : '浏览器图形安装器';
  platformInfo.textContent = `当前平台：${payload.platform} · 当前模式：${modeLabel}`;
  toggleSection(customProviderCard, provider.value === 'custom');
  toggleSection(telegramFields, withTelegram.checked);
  toggleSection(feishuFields, withFeishu.checked);
  toggleSection(skillsFields, configureSkills.checked);
})();
