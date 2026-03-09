# QQ 接入说明

这份说明专门讲一件事：**为什么 `openclawdeploy` 没有直接给你做一个 `--with-qq` 开关。**

答案很简单：因为按当前本机 OpenClaw 官方文档来看，**没有原生 QQ channel 支持文档**。

所以这里给的是一条现实可落地的方案，而不是“写个参数假装支持”。

---

## 1. 当前事实

目前 OpenClaw 官方文档里常见的原生渠道包括：

- Telegram
- Feishu / Lark（插件）
- WhatsApp
- Discord
- Slack
- Signal
- iMessage
- 等等

但**没有 QQ 官方原生通道文档**。

这意味着：

- 不能直接照搬 Telegram 那种 `botToken` 配置模式
- 也不应该在部署脚本里承诺“QQ 已支持”

---

## 2. 可行方案：OneBot / NapCat 桥接

更现实的落地方式是：

```text
QQ 客户端 / 机器人
   ↓
NapCat / OneBot 适配层
   ↓
自定义 Bridge 服务
   ↓
OpenClaw Gateway / OpenClaw 会话
   ↓
Bridge 回写 QQ
```

### 你至少需要三层

#### A. QQ 适配层

常见思路：

- NapCat
- OneBot 11 / OneBot 12 兼容实现
- 其他可提供 HTTP / WebSocket 事件的 QQ 适配器

#### B. Bridge 服务

这部分是你自己要补的一层。它负责：

- 接收 QQ 侧事件
- 解析出：发送人、群号、消息内容、引用关系
- 转成 OpenClaw 可理解的输入
- 取回 OpenClaw 输出
- 再发回 QQ

#### C. OpenClaw

OpenClaw 本身继续负责：

- 模型调用
- 工具调用
- 会话记忆
- 回复生成

---

## 3. Bridge 需要处理什么

### 入站

Bridge 需要把 QQ 消息至少转换出这些字段：

- channel: `qq`
- chat_type: `direct` / `group`
- sender_id
- sender_name
- group_id（如果是群）
- message_id
- text
- timestamp
- quoted / reply 信息（如果有）

### 出站

Bridge 需要支持把 OpenClaw 的输出转回：

- 纯文本消息
- 分段发送
- 可选引用回复
- 可选图片 / 文件（后续再加）

---

## 4. 你要注意的坑

### 4.1 风控和稳定性不是 OpenClaw 能解决的

QQ 生态的风控、协议变动、适配器稳定性，本质上是 **QQ 适配层的问题**。

### 4.2 不要把“QQ 机器人可收发消息”误认为“OpenClaw 已原生支持 QQ”

这两件事不是一回事。

### 4.3 群聊权限要自己做

Telegram / Feishu 在 OpenClaw 里有现成的 allowlist / pairing / mention 机制。

QQ bridge 方案里，这些控制很多要由你在 Bridge 里自己补：

- 允许哪些群
- 允许哪些人
- 是否要求 @ 才触发
- 是否静默某些消息

---

## 5. 推荐的落地顺序

如果你非要接 QQ，我建议按这个顺序来：

### 第一步：先把 OpenClaw 本体跑通

先只接：

- OpenRouter / OpenAI / Anthropic 其中一个
- Telegram 或 Feishu 其中一个

确保以下命令都正常：

```bash
openclaw status
openclaw gateway status
openclaw logs --follow
```

### 第二步：单独验证 QQ 适配层

确认 NapCat / OneBot 自己就能：

- 收消息
- 发消息
- 稳定运行

### 第三步：再写 Bridge

Bridge 最小版本先只做：

- 私聊文本
- 群聊文本
- 引用回复可选
- 不做图片、不做文件、不做语音

### 第四步：最后再补权限和运维

- allowlist
- mention gating
- 日志
- 限流
- 重试
- 错误告警

---

## 6. 一个最小可行目标

与其一上来就想“完整 QQ 机器人平台”，不如先定一个更现实的 MVP：

- 只支持一个 QQ 号
- 只支持文本消息
- 只支持一个或几个指定群
- 只在被 @ 时触发
- 回复长度过长时自动分段

这样更容易上线，也更容易维护。

---

## 7. 对这个项目的建议

如果你准备继续做第二版，我建议：

1. 在 `openclawdeploy` 里新增 `bridges/qq-onebot/`
2. Bridge 用 Node.js 写
3. 提供 `.env.example`
4. 提供 Docker Compose
5. 补一个 `--with-qq-bridge` 的实验开关

但在当前这个版本里，**最诚实的做法就是：先把 QQ 视为“桥接方案”，不是“原生支持项”。**

---

## 8. 结论

一句话总结：

- **Feishu / Telegram**：可以直接用 `openclawdeploy` 接
- **QQ**：现在更适合走 NapCat / OneBot + Bridge
- **别把桥接方案包装成原生支持**，后面会省很多麻烦
