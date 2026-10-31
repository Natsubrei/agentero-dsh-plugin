# Agentero × DeepSeek Harness

Agentero 是本地优先的科研工作台。这个插件把它的文献库、笔记和 PDF 阅读器带进 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（下称 dsh），让 Agent 和你坐在同一个窗口里做科研：你读论文、做判断，Agent 帮你查资料、翻笔记、整理结论。所有资料都留在自己的本地。

![文献库与 PDF 阅读](assets/pdf-library.png)

## 一起做科研

- 聊天在中间，论文在右边，读到哪句可以直接丢回对话。
- Agent 能查你已经有的文献和笔记，回答时引用真实的本地论文。
- 讨论完可以让 Agent 把结论整理成笔记，下次接着用。
- 新论文让 Agent 按 arXiv、DOI 或链接导入，不用手动整理文件。

可以这样说：

> 帮我把这个方向近两年的论文找出来，导入文献库，再结合我的笔记整理一份提纲。

> 把这轮讨论整理成一篇阅读笔记，开头列出用到的论文。

![Agent 在对话中写笔记](assets/note.png)

## 能做什么

- **读文献**：搜索、标签、导入、补下载、删除到回收站。
- **读 PDF**：翻页、查找、目录、链接；划词后复制、高亮、批注、翻译或加入对话。
- **全文翻译**：用 dsh 配置的 DeepSeek 模型在原页面上逐段替换，保留公式和版面。
- **写笔记**：编辑自己的笔记，也可以让 Agent 代写；每篇论文还有自己的专属笔记。
- **让 Agent 动手**：查文献、导入论文、读和搜笔记、整理提纲。

## 安装

需要 dsh 0.2.x、Node.js 24.9+、一个已有的 Agentero Vault，以及 Agentero CLI。

先安装 CLI：在 Agentero 桌面端打开「设置 → 关于 → 安装 CLI」，或参考 [CONTRIBUTING.md](CONTRIBUTING.md) 本地构建。确认终端里能运行：

```sh
agentero --help
```

然后安装插件：

```sh
dsh plugin --profile web add github:poco-ai/agentero-dsh-plugin
```

在 `~/.dsh/profiles/web/cordis.patch.yml` 里填 Vault 和 CLI 路径：

```yaml
- id: agentero-host
  config:
    vault: /path/to/vault
    agenteroBin: /path/to/agentero
```

启动：

```sh
dsh web --no-open
```

看到 `[agentero] plugin loaded` 后，打开终端打印的链接，进入会话，右侧就有「文献」和「笔记」。

## 数据

论文、PDF、笔记和标注都留在 Vault 里，和 Agentero 桌面端共用。插件只在本机运行，不另建数据库。

## 已知限制

- 扫描件需要先在桌面端做 OCR 和版面分析。
- 全文翻译重新打开文档会重新计算；译文上的原文链接和高亮暂不支持。
- 「推荐」卡片暂未启用。

## 开发

见 [CONTRIBUTING.md](CONTRIBUTING.md)。
