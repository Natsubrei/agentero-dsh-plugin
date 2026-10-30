# agentero-dsh-plugin

Agentero 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 组合包。根目录只提供 `dsh.bundle`，五个包各自作为 loader 入口加载。

```text
agentero-dsh-plugin/          # dsh.bundle、cordis.patch.yml、pnpm-workspace.yaml
  packages/host/              # agentero-dsh-host
  packages/library/           # agentero-dsh-library
  packages/notes/             # agentero-dsh-notes
  packages/pdf/               # agentero-dsh-pdf
  packages/recommend/         # agentero-dsh-recommend
```

`cordis.patch.yml` 插入五行：

| loader id | 包名 | 这一步 |
|---|---|---|
| `agentero-host` | `agentero-dsh-host` | Node 读取 `vault` / `agenteroBin`，提供论文列表、笔记、推荐接口；浏览器提供 `agentero` 服务 |
| `agentero-library` | `agentero-dsh-library` | 会话右栏页 `agentero.library`，开始页卡片 |
| `agentero-notes` | `agentero-dsh-notes` | 会话右栏页 `agentero.notes`，阅读和编辑 Vault 笔记 |
| `agentero-pdf` | `agentero-dsh-pdf` | 会话右栏页 `agentero.pdf`，从文献打开，EmbedPDF / PDFium 阅读、划词和论文笔记槽 |
| `agentero-recommend` | `agentero-dsh-recommend` | 会话输入框下方的小卡片条：arXiv 每日推荐与知乎讨论，可折叠、可换分类 |

文献、笔记出现在会话右栏的开始页（en: Library / Notes）。PDF 从文献行打开，不单独占一张卡片。推荐不占右栏，是会话输入框下方的一条卡片（en: Recommend）。四个界面包运行时不互相引用。本地搭建见 [CONTRIBUTING.md](CONTRIBUTING.md)。产品范围、已实现接口和后续步骤见 [docs/implementation.md](docs/implementation.md)。

PDF 全文翻译直接在原页面替换段落，复用 Harness 配置的 DeepSeek 模型。配置、motif 算法迁移和限制见 [PDF 页面内翻译](docs/pdf-translation.md)。
