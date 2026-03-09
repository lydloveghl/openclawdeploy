# openclawdeploy

一个给 OpenClaw 准备的多平台一键部署小项目，目标是：

- 支持 **macOS / Linux / Windows**
- 尽量复用 **OpenClaw 官方安装脚本**，少走野路子
- 自动完成常见的 **模型认证、配置文件生成、Gateway 安装与启动**
- 自带一份中文使用手册，覆盖 **OpenAI / Anthropic / OpenRouter / Feishu / Telegram / QQ**

## 先说结论

- **macOS / Linux**：直接跑 `install.sh`
- **Windows**：跑 `install.ps1`
- **Feishu / Telegram**：已做成可自动生成配置的接入流程
- **QQ**：当前 OpenClaw 官方文档里**没有原生 QQ channel**。本项目不会假装“已开箱即用支持 QQ”；手册里给了现实可行的桥接方案说明和边界说明

---

## 快速开始

### macOS / Linux

```bash
cd ~/openclawdeploy
chmod +x install.sh scripts/deploy.mjs
./install.sh --provider openrouter --api-key <YOUR_OPENROUTER_API_KEY>
```

### Windows PowerShell

```powershell
cd $HOME\openclawdeploy
powershell -ExecutionPolicy Bypass -File .\install.ps1 -- --provider openrouter --api-key <YOUR_OPENROUTER_API_KEY>
```

> 注：OpenClaw 官方在 Windows 上**更推荐 WSL2**。本项目提供原生 PowerShell 安装入口，但如果你追求稳定，还是优先 WSL2。

---

## 常见示例

### 1）只部署 OpenClaw + OpenRouter

```bash
./install.sh --provider openrouter --api-key sk-or-xxx
```

### 2）部署 OpenClaw + OpenAI + Telegram

```bash
./install.sh \
  --provider openai \
  --api-key sk-xxx \
  --with-telegram \
  --telegram-bot-token 123456:ABCDEF
```

### 3）部署 OpenClaw + Anthropic + Feishu

```bash
./install.sh \
  --provider anthropic \
  --api-key sk-ant-xxx \
  --with-feishu \
  --feishu-app-id cli_xxx \
  --feishu-app-secret yyy \
  --feishu-bot-name 农场助手
```

### 4）只看执行计划，不落地

```bash
./install.sh --provider openrouter --api-key sk-or-xxx --dry-run
```

### 5）覆盖已有配置（会先自动备份）

```bash
./install.sh --provider openrouter --api-key sk-or-xxx --force
```

---

## 项目结构

```text
openclawdeploy/
├── install.sh                # macOS / Linux 安装入口
├── install.ps1               # Windows PowerShell 安装入口
├── scripts/
│   └── deploy.mjs            # 统一部署逻辑：认证、写配置、装插件、装 gateway
├── docs/
│   ├── 使用手册.md
│   └── QQ接入说明.md
└── templates/
    └── openclaw.example.json5
```

---

## 脚本会做什么

`install.sh` / `install.ps1` 会：

1. 调用 **OpenClaw 官方安装脚本** 安装 CLI（默认跳过交互式 onboard）
2. 运行 `scripts/deploy.mjs`
3. `deploy.mjs` 会根据参数：
   - 配置 OpenAI / Anthropic / OpenRouter API Key
   - 生成 `~/.openclaw/openclaw.json`
   - 启用 Telegram / Feishu 配置
   - Feishu 场景自动安装 `@openclaw/feishu` 插件
   - 执行 `openclaw doctor --non-interactive`
   - 尝试 `openclaw gateway install`
   - 尝试 `openclaw gateway start`
   - 最后执行 `openclaw status`

---

## 重要参数

### 核心参数

- `--provider <openai|anthropic|openrouter|none>`
- `--api-key <token>`
- `--model <provider/model>`
- `--workspace <path>`
- `--force`
- `--dry-run`

### Telegram

- `--with-telegram`
- `--telegram-bot-token <token>`
- `--telegram-require-mention <true|false>`

### Feishu

- `--with-feishu`
- `--feishu-app-id <id>`
- `--feishu-app-secret <secret>`
- `--feishu-bot-name <name>`
- `--feishu-domain <feishu|lark>`
- `--skip-feishu-plugin-install`

### 执行控制

- `--skip-auth`
- `--skip-doctor`
- `--skip-gateway-install`
- `--skip-gateway-start`
- `--skip-openclaw-install`

---

## 部署后最常用的命令

```bash
openclaw status
openclaw gateway status
openclaw gateway start
openclaw gateway stop
openclaw gateway restart
openclaw logs --follow
```

---

## 手册入口

完整说明见：

- [docs/使用手册.md](./docs/使用手册.md)
- [docs/QQ接入说明.md](./docs/QQ接入说明.md)

如果你想把它改成公司内网版、Docker 版、或者批量服务器部署版，我会建议你下一步再加：

- `.env` 读取
- 配置合并而不是整文件覆盖
- Docker Compose / Ansible
- OneBot / NapCat 的 QQ bridge
