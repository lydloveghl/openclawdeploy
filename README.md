# openclawdeploy

一个给 OpenClaw 准备的多平台安装器项目，目标是：

- 支持 **macOS / Linux / Windows**
- 尽量复用 **OpenClaw 官方安装脚本**，少走野路子
- 提供 **终端交互向导**
- 提供 **桌面安装程序壳**，可打包成 **dmg / exe**
- 打开后直接显示一个安装窗口，**不再通过浏览器打开**
- 允许用户 **跳过大模型接入**，先把 OpenClaw 装起来
- 支持 **自定义大模型提供方** 接入
- 支持 **Telegram / Feishu** 渠道配置
- 支持把 **skills 配置** 一起写入 `~/.openclaw/openclaw.json`
- 自带中文手册，覆盖 **OpenAI / Anthropic / OpenRouter / 自定义模型 / Feishu / Telegram / Skills / QQ**

## 你要的成品形态

这版已经改成了 **桌面安装器架构**，不是“打开浏览器网页”的方案了。

目标产物：

- macOS：`dmg`
- Windows：`exe`（NSIS 安装器）
- Linux：`AppImage`

桌面壳使用 **Electron**，安装界面仍然是当前这套表单 UI，但会直接跑在桌面窗口里。

---

## 当前项目包含什么

```text
openclawdeploy/
├── desktop/                  # Electron 主进程 / preload
├── gui/                      # 安装界面
├── scripts/
│   ├── deploy.mjs            # 安装逻辑
│   ├── gui.mjs               # 浏览器版本地服务（保留）
│   ├── run-manager.mjs       # 任务启动与日志管理
│   └── package-macos-app.mjs # 简易 macOS .app 打包脚本（旧轻量方案）
├── install.sh
├── install.ps1
├── OpenClawDeploy.command
├── OpenClawDeploy.sh
├── OpenClawDeploy.bat
└── package.json              # 已加入 electron / electron-builder 打包配置
```

---

## 现在怎么启动桌面版

在项目目录执行：

```bash
npm install
npm run desktop
```

这会直接打开一个桌面窗口，不会跳浏览器。

---

## 怎么打包成 dmg / exe

### macOS dmg

```bash
npm install
npm run package:dmg
```

产物默认在：

```text
release/
```

### Windows exe

建议在 Windows 机器上执行：

```powershell
npm install
npm run package:exe
```

### Linux AppImage

```bash
npm install
npm run package:desktop
```

---

## 为什么我建议这样做

因为你要的是：

> 一个 exe 或者 dmg，打开时像安装程序，不要通过浏览器打开。

那最稳的思路就是：

- 用 **Electron** 做桌面外壳
- 里面承载安装 UI
- 后端继续复用现在已经写好的部署逻辑

这样改动最小，但产物形态最接近真正的安装程序。

---

## 当前支持的安装能力

桌面安装器里已经支持：

- 跳过模型接入
- OpenRouter / OpenAI / Anthropic
- 自定义 provider
- Telegram / Feishu
- Skills 配置
- Dry Run
- 正式执行安装
- 日志实时查看

---

## 终端模式仍然保留

如果以后你还想做自动化，也还可以继续用：

```bash
./install.sh --interactive
```

或者：

```bash
node ./scripts/deploy.mjs --help
```

---

## 重要提醒

我已经把项目改成了 **可打包桌面安装器的源码形态**。

但如果你要我**现在就实际产出一个 `.dmg` 或 `.exe` 文件**，下一步需要安装这些依赖：

- `electron`
- `electron-builder`

这一步会走 npm 下载。

### 平台建议

- **dmg**：我可以在这台 mac 上继续给你打
- **exe**：通常更建议在 Windows 上打；如果要在 mac 上跨平台打 exe，还会额外依赖 Windows 打包链，成功率和稳定性都没 Windows 原生环境高

---

## 相关命令

```bash
npm run desktop        # 启动桌面安装器
npm run package:dmg    # 打包 macOS dmg
npm run package:exe    # 打包 Windows exe
npm run package:desktop # 通用 electron-builder 打包
```

---

## 手册入口

完整说明见：

- [docs/使用手册.md](./docs/使用手册.md)
- [docs/QQ接入说明.md](./docs/QQ接入说明.md)
