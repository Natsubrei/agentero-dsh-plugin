# 贡献指南

`agentero-dsh-plugin` 是 Agentero 的 DeepSeek Harness 组合包。它单独成库，本地检出放在 Agentero 工作树里，方便对照 Motif 源码开发。

```text
motif/
├── deepseek-harness/      # Harness 宿主
└── agentero-dsh-plugin/   # 本仓库
```

本仓库的 Git 远程是 <https://github.com/poco-ai/agentero-dsh-plugin>。不要把这个目录提交进 Motif。

## 如何贡献

1. 从 `main` 拉出功能分支。
2. 按下面的「体验」在 `web` profile 里确认插件能加载，并能打开一篇论文。
3. 用 [Conventional Commits](https://www.conventionalcommits.org/) 写提交说明，例如 `feat: register the agentero tool`。一次提交只做一件事。
4. 推送分支，打开 Pull Request，说明改了什么、如何验证。

问题用 GitHub Issues。破坏性改动写在 PR 描述里。

## 环境要求

对照 [DeepSeek Harness 开发指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md)：

- Node.js 24.9 或更新。本仓库 `engines.node` 与宿主一致。
- pnpm 11.28.5。Harness 在根 `package.json` 的 `packageManager` 里锁定这个版本。本机若已有别的 pnpm，在仓库目录里用 Corepack 启动，避免用到旧版本：

  ```sh
  corepack enable
  corepack prepare pnpm@11.28.5 --activate
  corepack pnpm --version
  ```

- Git 2.26 或更新。
- 调用模型时再准备 DeepSeek API key。只验证插件是否加载时不需要。

当前宿主源码版本见 `deepseek-harness/package.json`（检出时为 `0.2.2-alpha.2`）。本包用 `engines.dsh` 声明 `>=0.2.1-rc.5 <0.3.0`。DSH 仍在开发者预览，升级宿主后如果安装被拒绝，先收紧这个范围再重试。

## 体验

目录必须是上面的并列关系。插件的类型检查用相对路径读取旁边的 `deepseek-harness`。看文献和 PDF 还需要一份已经有论文的 Agentero Vault（含 `papers/` 和 `.agentero/catalog.sqlite`），以及本仓库上层 Motif 编出来的 `agentero-cli`。

先构建宿主、插件和 CLI：

```sh
cd motif/deepseek-harness
corepack pnpm install
corepack pnpm run build

cd ../agentero-dsh-plugin
corepack pnpm install

cd ..
cargo build -p agentero-cli
```

宿主的 `pnpm run build` 生成仓库产物，之后 `pnpm dsh` 直接使用这些产物。已经构建过就可以跳过。插件的 `prepare` 会构建四个包的 Node 入口和浏览器 client bundle。`lib/` 和 `node_modules/` 不提交。需要单独重建时运行 `corepack pnpm build`；只做类型检查时运行 `corepack pnpm typecheck`。

四个包把 `@deepseek-ai/cordis` 放在 `peerDependencies`。根 `package.json` 用 `file:./packages/host` 等依赖这四个包名，方便 profile 安装时解析。

装进 `dsh web` 启动的那个 profile。CLI 把第一个非选项词当成 profile 名：`dsh web` 就是 `--profile web`。不要再写一遍 `--profile`，否则会报 profile 选了两次。名为 `desktop` 的 profile 只给 Electron 用，CLI 不能启动它。

```sh
cd motif/deepseek-harness
corepack pnpm dsh plugin --profile web add ../agentero-dsh-plugin
corepack pnpm dsh web --dump-config
```

`--dump-config` 里应能看到 `# == agentero-dsh-plugin`，以及 `agentero-host`、`agentero-library`、`agentero-notes`、`agentero-pdf` 四行。

Vault 可以在文献面板顶部的「选择知识库」中指定：选择已有知识库根目录并打开，DSH 会保存到当前 profile，并记住最近的目录。切换前先保存笔记，切换后页面会重新载入。CLI 路径仍可在本机 profile 配置；也可手动配置 Vault。不要把本机路径写进会提交的 `cordis.patch.yml`。编辑 `~/.dsh/profiles/web/cordis.patch.yml`（设置了 `DSH_HOME` 时是 `$DSH_HOME/profiles/web/cordis.patch.yml`）。后一层会整段替换目标行的 `config`，不会按键合并，所以两个字段写在一起：

```yaml
- id: agentero-host
  config:
    vault: /绝对路径/到/Vault
    agenteroBin: /绝对路径/motif/target/debug/agentero-cli
```

`vault` 留空时，文献和 PDF 接口返回 503 `{ "error": "vault is not configured" }`。`agenteroBin` 也可以是 PATH 上的 `agentero`，写绝对路径更稳。

启动：

```sh
corepack pnpm dsh web --no-open
```

终端出现 `[agentero] plugin loaded` 后，用它打印的 `http://127.0.0.1:3080/?token=...` 打开。进入一个会话，右侧开始页有「文献」和「笔记」。点文献表里的一行打开 PDF。只看界面时不需要 DeepSeek API key。

卸下插件：

```sh
corepack pnpm dsh plugin --profile web remove agentero-dsh-plugin
```

profile 目录不属于任何一个 Git 仓库。

## 插件在仓库里的形态

根目录是组合包，不自己导出 `apply`。`cordis.patch.yml` 按包名插入四个 loader 行：

```yaml
- insert:
    - id: agentero-host
      name: agentero-dsh-host
    - id: agentero-library
      name: agentero-dsh-library
    - id: agentero-notes
      name: agentero-dsh-notes
    - id: agentero-pdf
      name: agentero-dsh-pdf
```

每个包的 Node 入口导出 `name` 与 `apply`。带界面的包另外声明 `dsh.client.platform: web`，`exports["./client"]` 指向 `lib/client.js`。这个文件以 `window.__ModuleLoader__.load` 开头，React 和 `@deepseek-ai/dsh-client-*` 保持为外部 `require()`。

Host 的 Node 插件名是 `agentero-host`。它读取可选配置 `vault`（默认 `""`）和 `agenteroBin`（默认 `"agentero"`），并在加载时打印 `[agentero] plugin loaded`。浏览器入口提供名为 `agentero` 的服务。Host 在 `/agentero/api` 下提供论文列表、PDF 字节、标注，以及 `<vault>/notes` 的笔记列表和文件读写。`PUT` 还可以写 `papers/<id>/NOTES.md`。文献面板列出论文。笔记面板列出并编辑 `notes/`，并填进 PDF 右侧的论文笔记槽。PDF 面板用 EmbedPDF / PDFium 阅读，划词后调用 `agentero mark add`。Host 另外提供 `GET /agentero/api/pdfium.wasm`。

生效配置从空根开始，按这个顺序叠层：

1. profile 的 `dsh.profile.bundles`，先是 `@deepseek-ai/dsh-base`，再是后安装的组合包。
2. profile 自己的 `cordis.patch.yml`。
3. `$DSH_HOME/cordis.patch.yml`。
4. 命令行上的每个 `--patch`。

后应用的层按行覆盖。patch 会替换目标行的整个 `config`，不会按键深度合并。

## 日常改代码

1. 改对应包的 `packages/<name>/src/`。
2. 在本仓库运行 `corepack pnpm build`。
3. 重启 `corepack pnpm dsh web --no-open`。

只改 profile 或 home 的 `cordis.patch.yml` 里已有行的 `config` 时，Cordis 会热替换该插件。组合包的安装和移除要重启进程后才生效。

临时用绝对路径加载 TypeScript、不经过 `lib/` 时，在本仓库写一份不提交的 `dev.patch.yml`：

```yaml
- insert:
    - id: agentero-host
      name: '/绝对路径/motif/agentero-dsh-plugin/packages/host/src/index.ts'
```

然后：

```sh
cd motif/deepseek-harness
corepack pnpm dsh web --patch ../agentero-dsh-plugin/dev.patch.yml --no-open
```

这条路径只用于冒烟。要安装、分发的仍然是声明了 `dsh.bundle` 的组合包。

## 从 Git 安装

用户可以执行：

```sh
dsh plugin --profile web add github:poco-ai/agentero-dsh-plugin
```

Git 安装拿到的是源码。`prepare` 会在安装后编译 `lib/`。编译用相对路径读取旁边的 `deepseek-harness` 类型，没有这份检出时 `prepare` 会失败。pnpm 10 及以上默认不跑 Git 依赖的构建脚本，第一次 `add` 可能失败。按 CLI 提示把包名写入该 profile 的 `pnpm-workspace.yaml`：

```yaml
allowBuilds:
  agentero-dsh-plugin: true
```

然后重新执行 `add`。这项授权会让本包的代码在安装时于本机执行。只对可信提交这样做，并用 `github:poco-ai/agentero-dsh-plugin#<commit>` 锁住版本。

## 提交时不要带上

- `node_modules/`
- `lib/`
- `dev.patch.yml`（里面是本机绝对路径）
- API key、`.env`、profile 目录

发布到 npm 或打 tarball 之前再构建，让 `cordis.patch.yml` 和四个包的 `lib/` 进入包内。
