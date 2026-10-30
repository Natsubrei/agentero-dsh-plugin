# agentero-dsh-plugin

Agentero 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 组合包。根目录只提供 `dsh.bundle`，四个包各自作为 loader 入口加载。

```text
agentero-dsh-plugin/          # dsh.bundle、cordis.patch.yml、pnpm-workspace.yaml
  packages/host/              # agentero-dsh-host
  packages/library/           # agentero-dsh-library
  packages/notes/             # agentero-dsh-notes
  packages/pdf/               # agentero-dsh-pdf
```

`cordis.patch.yml` 插入四行：

| loader id | 包名 | 这一步 |
|---|---|---|
| `agentero-host` | `agentero-dsh-host` | Node 读取 `vault` / `agenteroBin`，提供论文列表与笔记文件接口；浏览器提供 `agentero` 服务 |
| `agentero-library` | `agentero-dsh-library` | 会话右栏页 `agentero.library`，开始页卡片 |
| `agentero-notes` | `agentero-dsh-notes` | 会话右栏页 `agentero.notes`，阅读和编辑 Vault 笔记 |
| `agentero-pdf` | `agentero-dsh-pdf` | 会话右栏页 `agentero.pdf`，从文献打开，EmbedPDF / PDFium 阅读、划词和论文笔记槽 |

文献、笔记出现在会话右栏的开始页（en: Library / Notes）。PDF 从文献行打开，不单独占一张卡片。三个界面包运行时不互相引用。本地搭建见 [CONTRIBUTING.md](CONTRIBUTING.md)。产品范围、已实现接口和后续步骤见 [docs/implementation.md](docs/implementation.md)。
