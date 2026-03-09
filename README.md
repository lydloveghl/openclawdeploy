# openclawdeploy

一个给 OpenClaw 准备的多平台一键部署小项目，目标是：

- 支持 **macOS / Linux / Windows**
- 尽量复用 **OpenClaw 官方安装脚本**，少走野路子
- 提供 **可交互安装向导**
- 提供 **双击启动的浏览器图形安装器**，避免自己在终端里敲参数
- 允许用户 **跳过大模型接入**，先把 OpenClaw 装起来
- 支持 **自定义大模型提供方** 接入
- 支持 **Telegram / Feishu** 渠道配置
- 支持把 **skills 配置** 一起写入 `~/.openclaw/openclaw.json`
- 自带中文手册，覆盖 **OpenAI / Anthropic / OpenRouter / 自定义模型 / Feishu / Telegram / Skills / QQ**

## 先说结论

- **macOS / Linux**：可以双击 `OpenClawDeploy.command` / `OpenClawDeploy.sh`
- **Windows**：可以双击 `OpenClawDeploy.bat`
- **浏览器图形安装器** 会自动打开，不需要手动敲部署命令
- **终端模式** 也保留，方便自动化
- **QQ**：当前 OpenClaw 官方文档里**没有原生 QQ channel**。本项目不会假装“已开箱即用支持 QQ”；手册里给了现实可行的桥接方案说明和边界说明

---

## 现在怎么用

### 方式一：双击运行（推荐）

#### macOS

双击：

- `OpenClawDeploy.command`

或者先生成一个 `.app`：

```bash
cd ~/openclawdeploy
node ./scripts/package-macos-app.mjs
open ./dist/OpenClawDeploy.app
```

#### Linux

双击或执行：

- `OpenClawDeploy.sh`

#### Windows

双击：

- `OpenClawDeploy.bat`

启动后会自动打开浏览器图形安装器。

### 方式二：终端模式

```bash
cd ~/openclawdeploy
chmod +x install.sh scripts/deploy.mjs
./install.sh
```

> 注：OpenClaw 官方在 Windows 上**更推荐 WSL2**。本项目提供 PowerShell 和 BAT 启动入口，但如果你追求稳定，还是优先 WSL2。

---

## 图形安装器能做什么

图形安装器会把终端参数变成表单，你可以在浏览器里完成：

- 选择是否先接入模型
- 选择 OpenRouter / OpenAI / Anthropic
- 选择 **自定义 provider**
- 允许 API Key 先留空，后面再补
- 配置 Telegram / Feishu
- 配置 Skills：
  - `skills.load.extraDirs`
  - `skills.allowBundled`
  - `skills.install.nodeManager`
  - `skills.install.preferBrew`
  - `skills.entries.<skillKey>` 的 `enabled / apiKey / env / config`
- 先做 **Dry Run** 预览
- 真正执行安装部署
- 在页面里直接看安装日志

---

## 交互向导特性

如果你还是喜欢终端但不想记参数，也可以：

```bash
./install.sh --interactive
```

它会逐步提问：

- 工作目录
- 模型提供方
- 是否跳过模型接入
- 是否接入 Telegram / Feishu
- 是否配置 skills
- 是否执行 doctor / gateway install / gateway start
- 是否 dry-run
- 是否覆盖已有配置

---

## 常见示例

### 1）直接进入图形安装器

- 双击 `OpenClawDeploy.command`
- 或执行 `npm run gui`

### 2）显式进入交互向导

```bash
./install.sh --interactive
```

### 3）只部署 OpenClaw，先跳过模型接入

```bash
./install.sh --provider none
```

### 4）部署 OpenClaw + OpenRouter

```bash
./install.sh --provider openrouter --api-key sk-or-xxx
```

### 5）部署 OpenClaw + OpenAI + Telegram

```bash
./install.sh \
  --provider openai \
  --api-key sk-xxx \
  --with-telegram \
  --telegram-bot-token 123456:ABCDEF
```

### 6）部署 OpenClaw + Anthropic + Feishu

```bash
./install.sh \
  --provider anthropic \
  --api-key sk-ant-xxx \
  --with-feishu \
  --feishu-app-id cli_xxx \
  --feishu-app-secret yyy \
  --feishu-bot-name 农场助手
```

### 7）接入自定义大模型 provider

```bash
./install.sh \
  --provider custom \
  --custom-provider-id myproxy \
  --custom-api openai-completions \
  --custom-base-url https://example.com/v1 \
  --custom-model-id gpt-4.1 \
  --custom-model-name "My Proxy GPT-4.1" \
  --custom-api-key sk-xxx
```

### 8）配置 skills

```bash
./install.sh \
  --configure-skills \
  --skills-extra-dirs ~/my-skills,~/team-skills \
  --skills-allow-bundled weather,apple-notes \
  --skills-node-manager pnpm \
  --skill-entry-json '{"key":"sag","enabled":false}' \
  --skill-entry-json '{"key":"nano-banana-pro","apiKey":"xxx","env":{"GEMINI_API_KEY":"xxx"}}'
```

### 9）只看执行计划，不落地

```bash
./install.sh --provider openrouter --api-key sk-or-xxx --dry-run
```

### 10）覆盖已有配置（会先自动备份）

```bash
./install.sh --provider openrouter --api-key sk-or-xxx --force
```

---

## 项目结构

```text
openclawdeploy/
├── OpenClawDeploy.command     # macOS 双击启动入口
├── OpenClawDeploy.sh          # Linux 启动入口
├── OpenClawDeploy.bat         # Windows 启动入口
├── gui/                       # 浏览器图形安装器前端
├── install.sh                 # macOS / Linux 安装入口
├── install.ps1                # Windows PowerShell 安装入口
├── scripts/
│   ├── deploy.mjs             # 统一部署逻辑：交互向导、认证、写配置、装插件、装 gateway
│   ├── gui.mjs                # 图形安装器本地服务
│   └── package-macos-app.mjs  # 生成 macOS .app
├── docs/
│   ├── 使用手册.md
│   └── QQ接入说明.md
└── templates/
    └── openclaw.example.json5
```

---

## 脚本会做什么

图形安装器或 `install.sh` / `install.ps1` 会：

1. 调用 **OpenClaw 官方安装脚本** 安装 CLI（默认跳过交互式 onboard）
2. 运行 `scripts/deploy.mjs`
3. `deploy.mjs` 会根据参数或向导选择：
   - 配置 OpenAI / Anthropic / OpenRouter API Key
   - 或跳过模型接入
   - 或写入自定义 provider 配置
   - 生成 `~/.openclaw/openclaw.json`
   - 启用 Telegram / Feishu 配置
   - Feishu 场景自动安装 `@openclaw/feishu` 插件
   - 写入 skills 相关配置
   - 执行 `openclaw doctor --non-interactive`
   - 尝试 `openclaw gateway install`
   - 尝试 `openclaw gateway start`
   - 最后执行 `openclaw status`

---

## package.json 脚本

```bash
npm run gui         # 启动浏览器图形安装器
npm run wizard      # 启动终端交互向导
npm run package:mac # 生成 dist/OpenClawDeploy.app
```

---

## 手册入口

完整说明见：

- [docs/使用手册.md](./docs/使用手册.md)
- [docs/QQ接入说明.md](./docs/QQ接入说明.md)
