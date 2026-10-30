# Agentero × dsh 插件：实现说明

这份文档给后续 Agent 用。它记录产品范围、已经写进仓库的代码、必须遵守的边界，以及还没做的步骤。不要把本目录提交进 Motif。插件自己的 Git 远程是 <https://github.com/poco-ai/agentero-dsh-plugin>。

宿主检出在旁边的 `motif/deepseek-harness`（开发时为 `0.2.2-alpha.2`）。本包 `engines.dsh` 是 `>=0.2.1-rc.5 <0.3.0`。

界面草图（可点的布局，不是实现）：`/Users/qychen/.cursor/projects/Users-qychen-01-Develop-motif/canvases/agentero-dsh-ui.canvas.tsx`。

## 产品

Agentero 作为 dsh 的组合包，提供三块互不运行时引用的界面：文献库、笔记库、PDF。数据和标注继续留在 Agentero Vault 里。dsh 负责会话。插件把「论文路径、页码、原文、笔记」交给当前仍选中的 dsh 会话。

目标场景：导师在会话里让用户调研一个方向，并和已有研究结合。

1. 模型用 Host 工具读已有文献、把短名单写入 Vault。
2. 文献表面列出这些论文。
3. 用户在 PDF 里阅读，笔记写在该论文的 `NOTES.md` 上；划词成为可点回的证据。
4. 独立想法进 `notes/`。
5. 会话拿这些笔记和出处整理汇报。飞书写入不属于本插件。

不做：双链解析与跳转、图谱、写作工程、把 Agentero 桌面阅读器（EmbedPDF / PDFium / Tauri）搬进浏览器。文献、笔记和 PDF 挂在会话右栏，不占左侧活动栏，也不替换中间的对话。

## 解耦

三个界面是三个 loader 插件。它们不 `import` 彼此的运行时模块。

| 允许 | 不允许 |
|---|---|
| 都调用 Host 的 HTTP 接口 | 界面包互相 import 组件、store、CSS |
| PDF 声明槽，笔记用 `ctx.slots.inject` 填进去 | 文献包直接渲染 PDF 或 Markdown |
| 通过浏览器服务 `agentero.open` 打开文档 | 组件函数接收 `ctx` |
| `import type` 共享槽位字段 | 为了编译去 import 另一个界面包 |

dsh 规则（`deepseek-harness/packages/client/AGENTS.md`、`docs/subsystems/slots.zh.md`、`docs/subsystems/web-client.zh.md`）：

- 功能插件之间不运行时导入对方的值。界面走槽，行为走 Cordis 服务。
- 注册写在 `apply` 里，用 `ctx.slots.inject(父槽, () => ctx.slots.register(...))`。父槽还没声明时，inject 回调不跑；父插件卸掉后回调撤销。
- 组件只吃推导出的 props：`PropsLocale`、inject face 里的回调。不要在 `.tsx` / 面板函数里读 `ctx`。
- 浏览器包声明 `dsh.client.platform: "web"`，`exports["./client"]` 指向构建后的 `lib/client.js`。
- `lib/client.js` 必须以 `window.__ModuleLoader__.load({ id: "<包名>", factory: (require) => {...} })` 开头。
- `react`、`react-dom`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-*`、`@deepseek-ai/dsh-api-*` 必须是 factory 里的 `require()`，不能打进 bundle。平台模块名单：`deepseek-harness/packages/client/web/src/platform.ts` 的 `PLATFORM_MODULES`。`@embedpdf/*` 打进 PDF 包。`pdfium.wasm` 不打进 bundle，由 Host `GET /agentero/api/pdfium.wasm` 提供。
- 对话留在中间。文献、笔记、PDF 是会话右栏的页：`ctx.sidebarRightTabs.register` 声明类型，正文注册在 `sidebar.right.pane.tab`。文献和笔记带 `guide`，出现在开始页，排在浏览器后面。PDF 没有卡片，文献行通过 `agentero.open` 调到 `sidebarRight.openTab('agentero.pdf', { params: { ref } })`。同一窗格再次打开聚焦已有的那一页。PDF 类型 `keepMounted: true`。论文路径跟这个 tab 的导航参数走，不放在全局快照里。论文笔记槽作用域是 `session`。加入对话写入这一页绑定的会话，不 `selectPanel`。参考：`deepseek-harness/packages/client/ui-sidebar-right/README.zh.md`。
- 文案走 `ctx.locale.register`，至少 en 和 zh。失败提示若要在面板关闭后还在，挂 `shell.overlay`。字重不超过 500。macOS 顶栏用页面自己的 padding 加上 `--dsh-frame-top-clearance`，不要改这个全局量。
- 树外插件进不了 harness 的 typert Remote 生成（`scripts/generate-typert.ts`）。不要新增 `@Remote`。浏览器访问 Vault 走 Host 在 `ctx.webServer` 上注册的本机 HTTP。

卸掉其中一个界面插件时，另外两个必须仍能加载。PDF 不在时，文献行点击得到 `open` 返回 false，面板内已有文案「PDF 插件未启用」。

## 仓库形态

根包 `agentero-dsh-plugin` 只做组合包：`dsh.bundle.patch` 指向 `cordis.patch.yml`，没有自己的 `apply`。

```text
agentero-dsh-plugin/
  cordis.patch.yml
  package.json              # file: 依赖下面四个包
  pnpm-workspace.yaml
  scripts/build-all.mjs
  scripts/build-client.mjs
  tsconfig.base.json
  tsconfig.client.base.json
  packages/host/            # agentero-dsh-host
  packages/library/         # agentero-dsh-library
  packages/notes/           # agentero-dsh-notes
  packages/pdf/             # agentero-dsh-pdf
```

`cordis.patch.yml`：

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

| loader id | npm 名 | Node `name` | 浏览器入口 | 主面板 key | 侧栏 order |
|---|---|---|---|---|---|
| `agentero-host` | `agentero-dsh-host` | `agentero-host` | 服务名 `agentero` | 无 | 无 |
| `agentero-library` | `agentero-dsh-library` | `agentero-library` | `agentero-library` | `agentero.library` | 30 |
| `agentero-notes` | `agentero-dsh-notes` | `agentero-notes` | `agentero-notes` | `agentero.notes` | 31 |
| `agentero-pdf` | `agentero-dsh-pdf` | `agentero-pdf` | `agentero-pdf` | `agentero.pdf` | 32 |

类型解析靠各包 `tsconfig.json` / `tsconfig.client.json` 的 `paths`，指向 `../../../deepseek-harness/...` 已构建的 `lib/types`。没有旁边这份 harness 检出时，`pnpm install` 的 `prepare` 会失败。不要把插件写进 harness 的 `pnpm-workspace.yaml`。

构建：

```sh
cd motif/agentero-dsh-plugin
corepack pnpm install
corepack pnpm build
```

`scripts/build-all.mjs` 对四个包依次：`tsc -p tsconfig.json`、`tsc -p tsconfig.client.json`、`node ../../scripts/build-client.mjs`、`node --check` Node 入口和 `lib/client.js`。`build-client.mjs` 用 esbuild 打 CJS，`packages: 'external'`，再套上 `__ModuleLoader__.load`。`lib/` 不提交。

安装进名为 `agentero` 的 profile（详见 `CONTRIBUTING.md`）：

```sh
cd motif/deepseek-harness
corepack pnpm dsh plugin --profile agentero add ../agentero-dsh-plugin
corepack pnpm dsh --profile agentero --dump-config
corepack pnpm dsh web --profile agentero --no-open
```

`--dump-config` 里应有 `# == agentero-dsh-plugin` 和上面四个 id。终端应打印 `[agentero] plugin loaded`。浏览器 `http://127.0.0.1:3080`。

**这一步还没有在正在运行的 dsh 里验证过。** 代码写完后没有执行 `dsh plugin add`，也没有用真实论文点过界面。

配置不能写进会提交的 `cordis.patch.yml`（那是机器路径）。装好之后，在 profile 自己的 `cordis.patch.yml`（`$DSH_HOME/profiles/agentero/cordis.patch.yml`，默认 `~/.dsh`）覆盖 host 行的整个 `config`。后一层会整行替换 `config`，不会按键合并。

```yaml
- id: agentero-host
  config:
    vault: /绝对路径/到/Vault
    agenteroBin: agentero
```

`agentero` 必须在 PATH 上，或把 `agenteroBin` 写成绝对路径。命令是参数数组，不要经 shell。

## 任务清单

状态：已完成 / 未做 / 未验证。

| ID | 事项 | 状态 |
|---|---|---|
| T1 | 根包改为组合包，四个 loader 包，侧栏三个空面板 | 已完成 |
| T2 | Host `GET /agentero/api/papers`，文献表面搜索和表格 | 已完成；真实 Vault 的列表与表头搜索已在 DSH 中验证 |
| T3 | Host 笔记文件接口，笔记表面列表、渲染、编辑保存 | 已完成，未在 dsh 里点过 |
| T4 | Host `GET /agentero/api/pdf`，PDF 表面用 EmbedPDF / PDFium 阅读，注册 `paper` 打开器 | 代码已完成。wasm 走 `GET /agentero/api/pdfium.wasm` |
| T5 | PDF 声明 `agentero.pdf.notes`；笔记插件填入该论文的 `NOTES.md` | 代码已完成，未在 dsh 里点过 |
| T6 | 划词：高亮、批注、翻译、复制、加入当前 dsh 会话、快速对话 | 代码已完成，未在 dsh 里点过 |
| T7 | 文献写操作：导入、标签、回收站删除、BibTeX、发现、补下载、已读 | 代码已完成。删除只进回收站。没有单独的元数据改写命令，CLI 没有就不做 |
| T8 | Host 注册给模型用的工具（列论文、导入、读笔记、搜索笔记、发现） | 代码已完成 |
| T9 | 把插件装进 profile，配 Vault，用真实论文走通 | 已在 `web` profile 上走通文献列表、笔记渲染、PDF 翻页和论文笔记槽。标签增删已用接口验证并复原。BibTeX 导出和 arXiv 发现因 CLI 访问外网失败返回 502。卸插件和划词加入会话还没点 |
| T10 | 版面侧栏、区域批注、全文翻译、书签写回、导出带批注 PDF | 未做，排在 T6 之后 |
| T11 | Library 与 Agentero 桌面视觉对齐：紧凑表格、按需表单与标签编辑、菜单、错误 Toast | 已完成；在本机 DSH 验证搜索、空结果、排序、刷新保留滚动位置、菜单切换、标签输入焦点和已有 PDF 打开；本轮未执行导入、删除、标签写入等 Vault 数据变更 |
| T12 | Library 选择知识库：原生选目录、手动路径、最近列表、持久化与旧来源保护 | 已实现；按用户要求不做额外验证 |

## 已实现的行为

### Host Node

文件：`packages/host/src/index.ts`、`packages/host/src/notes-files.ts`。

- `inject = ['webServer', 'agents', 'tools', 'settings']`；目录选择器通过可选的 `ctx.directoryPicker` 复用。
- Host 导出 Harness 提供的 Schemastery `Config`，由 DSH 原生 settings 写入 profile；类型从旁边的 Harness 检出解析，不额外安装一份 schema 框架。`vault` 默认 `""`，`agenteroBin` 默认 `"agentero"`，`recentVaults` 默认 `[]`。
- `ctx.webServer.register({ kind: 'prefix', path: '/agentero/api', handler })`，卸载时 dispose，并杀掉尚未退出的 `paper list` 子进程。
- 请求的 `Host` 必须是 `127.0.0.1`、`localhost` 或 `::1`，否则 403，没有正文。
- `vault === ""` 时业务路由返回 503 `{ "error": "vault is not configured" }`。
- 未匹配的 pathname 返回 404。

`GET /agentero/api/vault`、`PUT /agentero/api/vault`、`POST /agentero/api/vault/pick`

- GET 返回当前知识库的 `path`、`name`、`scope`、最近 8 个目录，以及是否支持原生目录选择。选择器取消返回 `path: null`，不改变当前配置。
- PUT 接收 `{ path }`，只接受绝对路径且必须是已有 Agentero Vault：包含 `.agentero/catalog.sqlite`，或同时包含 `.agentero/`、`papers/`、`notes/`。与 CLI 的识别规则一致；不会初始化普通目录。
- 选择通过 DSH `settings.mutate('agentero-host', ...)` 一起保存 `vault` 与 `recentVaults`，保留 `agenteroBin` 和 profile 其它字段，重启后仍生效。当前作用域为整个 DSH profile，所有会话使用同一知识库。
- 目录选择与切换要求 JSON 请求及同源 Origin；无原生选择器时仍可输入目录路径。
- Host 浏览器服务提供 `getVault` 和带来源标识的 `request`。Library、Notes、PDF 的 IO 都通过该服务；`X-Agentero-Vault` 与当前来源不一致时返回 409，旧页面不会静默访问或写入新知识库。来源指纹用于一致性，不代替身份认证。PDFium WASM 不依赖知识库，仍可直接加载。
- 确认切换前提示保存笔记；成功后重载页面，统一清除旧文献列表、PDF 缓冲和笔记编辑状态。其它旧页面必须刷新后继续操作。

`GET /agentero/api/papers`

- 只接受 GET，否则 405 且 `Allow: GET`。
- `spawn(agenteroBin, ['--vault', vault, '--json', 'paper', 'list', '--fields', 'year,authors,tags,date'], { shell: false, windowsHide: true })`。
- 超时 20 秒后 `child.kill()`，502 `{ "error": "agentero paper list timed out" }`。
- 退出码不是 0、spawn 失败、或 stdout 不是 JSON：502 `{ "error": "..." }`，stderr 优先。
- 成功时把 stdout 原样写回，`content-type: application/json`。

CLI 在 `--json` 下的 stdout 形状（实现按这个解析，也兼容数组和 `items`）：

```json
{"ok":true,"data":[{"id":"1706.03762","path":"papers/1706.03762","title":"…","year":2017,"authors":["Vaswani"],"tags":["ml",{"name":"review","color":"blue"}],"date":"2017-06"}]}
```

每条固定有 `id`、`path`、`title`。`year` 是数字，可能省略。`authors` 是字符串数组。`tags` 无颜色时是字符串，有颜色时是 `{ name, color }`。`date` 是 `YYYY`、`YYYY-MM` 或 `YYYY-MM-DD`，可能省略。`path` 是 Vault 相对的论文目录，不是 PDF 文件。

`GET /agentero/api/notes`

- 只接受 GET。
- 递归 `<vault>/notes` 下的 `.md`。跳过符号链接和点开头的目录。最多 500 条。目录不存在则 `{ "notes": [] }`，不是 404。
- 标题是围栏代码块之外的第一条 ATX 标题；没有则用文件名。
- 响应 `{ "notes": [{ "path": "notes/a.md", "title": "…" }] }`，`path` 用 `/`。

`GET /agentero/api/notes/file?path=`

- 只接受相对路径。拒绝空段、`.`、`..`、绝对路径、盘符、控制字符。
- `realpath` 之后必须仍在 Vault 目录内。符号链接的目标也必须留在 Vault 内。
- 200 `{ "path", "text" }`。路径不合法 400 `{ "error": "invalid path" }`。不存在 404 `{ "error": "not found" }`。
- 读接口不限制必须在 `notes/` 下，因此以后读 `papers/<id>/NOTES.md` 可以复用它。写接口不可以。

`PUT /agentero/api/notes/file?path=`

- 只接受写到 `notes/` 下面。正文是 JSON `{ "text": string }`，最大 8 MiB。
- 只在 `<vault>/notes` 内创建父目录。覆盖已有普通文件；新建用 `wx`。
- 200 `{ "path" }`。坏路径或坏 JSON 为 400 `{ "error": "invalid path" }` 或 `{ "error": "invalid body" }`。

### Host 浏览器服务

文件：`packages/host/src/client/index.ts`。

`ctx.provide('agentero', …)`。Cordis `inject` 为空，不依赖别的服务。

```ts
registerOpener(kind: 'paper' | 'note', opener: (id: string) => void): () => void
open(kind, id): boolean
```

同一 kind 再次注册会替换上一个。`open` 在没有 opener 时返回 false，不抛错。目前没有任何插件调用 `registerOpener`。

界面包不要 inject 这个服务名来挡住自己的面板注册。文献面板用 `ctx.get('agentero')`，服务不在时 `openPaper` 返回 false。

### 文献表面

文件：`packages/library/src/client/index.ts`。Node 入口 `packages/library/src/index.ts` 的 `apply` 是空的。

- `inject = ['slots', 'layout', 'locale']`。
- 语言包 `agentero.library`，中文标题「文献」。
- 顶部显示当前知识库名，点击可从最近列表切换、调用 DSH 原生文件夹选择器或输入路径；未配置知识库时也显示这个入口。
- 挂载后面板 `fetch('/agentero/api/papers', { cache: 'no-store' })`。
- 表格列：标题、作者、年份、标签。年份没有时用 `date`。筛选框只匹配标题和作者，在浏览器里做。
- 与 Agentero 桌面库对齐：表头内搜索、单行截断、细分隔线、轻量悬停；列表单独滚动，表头 sticky，底部显示总数或筛选数。表格最小宽度 `38rem`，更窄的侧栏横向滚动。
- 表头 `+` 按需展开 arXiv / DOI / URL 导入；更多菜单保留刷新、发现、BibTeX 导入与导出。输入草稿留在操作组件，输入不会触发所有论文行重绘。发现结果可关闭。
- 标签默认仅展示首个 chip 与剩余数量；点击打开完整标签列表及增删控件，焦点落在输入框，Escape 关闭弹层，长名称不会撑高行。标签输入草稿继续保存在该行，写入失败时保留。
- 行尾更多菜单在悬停、键盘焦点或触屏下可见，提供打开、补下载、删除；删除仍确认并只进回收站。单击行或在聚焦行按 Enter / Space 打开。
- 行点击把 `path`（空则用 `id`）交给 `agentero.open('paper', id)`。返回 false 时经 `notifyError` 显示「PDF 插件未启用」，不切走。
- 503 且 error 为 `vault is not configured` 时显示「尚未配置 Vault」。
- 样式经 Tailwind 构建并限定在 `.agentero-library` 内，复用 Agentero 色彩与字号；控件圆角和字重在 Library 内明确设置，字重不超过 500。Radix 弹层携带相同作用域，不改 DSH 外壳或另两个界面包。
- 操作失败与后台刷新错误经 `notifyError` 使用 DSH 原生 Toast，注册在 `shell.overlay`，关闭 Library 后仍可读到；不在表头挂常驻错误条。首屏加载失败保留就地刷新入口。
- 后台刷新保留已挂载的表格、搜索和滚动位置；论文行继续 memo，操作回调保持稳定。
- 组件 `LibraryPanel` 不接收 `ctx`。`loadPapers` 和 `openPaper` 在 `apply` 里注入。
- 类型 `agentero.library`，id `agentero-dsh-library`。开始页卡片 order 40。

后续仍未实现：列宽调整与显隐、自定义属性、阅读热力图、行右键菜单和虚拟滚动；本次只对齐现有 Library 的视觉与操作层级，不复制桌面库全部能力。

### 笔记表面

文件：`packages/notes/src/client/index.ts`。

- 同样三个 inject。语言包 `agentero.notes`，中文标题「笔记」。
- 正文在左，笔记列表在右，默认收起。格式条常驻在顶部，列表开关在右上角。打开就是 Plate，没有单独的阅读/编辑切换。磁盘仍是 Markdown：打开时反序列化，改动停顿后序列化再 `PUT`。`[[...]]` 原样显示，不解析。
- 节点包括段落、标题、行内样式、列表、引用、分隔线、围栏代码、链接、表格和公式。公式用 KaTeX 的 MathML，不打包字体。光标在正文里时，底部浮出格式条。查找用 Cmd/Ctrl+F，不占常驻一行。
- 只覆盖 `notes/`。论文 `NOTES.md` 走同一个编辑器，入口在 PDF 页的笔记槽。

### PDF 表面

文件：`packages/pdf/src/client/index.ts`。

- `inject` 含 `agentero`、`sidebarRight`、`sidebarRightTabs`。打开器调用 `sidebarRight.openTab('agentero.pdf', { params: { ref } })`。正文用 `useTabInfo().tab.navigation.params` 读论文路径。
- `GET /agentero/api/pdf?ref=` 拉字节。`ref` 以 `.pdf` 结尾时读该文件；否则把它当论文目录，优先 `<目录名>.pdf`，否则取直接子文件里按文件名排序的第一个 `.pdf`。
- 阅读引擎是 EmbedPDF / PDFium，和桌面端同一套：先 worker，失败再 direct。`fontFallback` 为 `null`（桌面端的 CJK 回退走 Tauri）。wasm 从 `GET /agentero/api/pdfium.wasm` 取，绝对 URL 交给 worker。插件注册沿用文档、视口、单页 spread、纵向滚动、渲染、分块、适应宽度缩放、交互和文本选择。底栏、划词菜单、批注卡片和纸色仍用原来的界面。
- 还没有路径时显示「从文献库打开一篇论文」。
- 声明 child `agentero.pdf.notes`。槽里没有内容时 PDF 占满宽度。
- 划词菜单：复制、高亮、批注、翻译、加入对话、快速对话。选区来自 EmbedPDF selection。高亮和批注走 `POST /agentero/api/marks`（`agentero mark add --quote --page`）。高亮矩形来自 `marks/annotations.json` 的页点坐标，再用页面 `size` 换回 0–1。翻译和提问的矩形是标注文件里的 0–1。
- 加入对话使用这一页的 `sessionId`，`POST /agentero/api/context`。对话留在中间，不切换主面板。没有会话时在面板里提示。这条消息进模型上下文，不自动唤醒会话。

### 论文笔记槽

笔记包 `slots.inject('agentero.pdf.notes')`。读写 `papers/<id>/NOTES.md`。文件不存在时当成空笔记，保存会创建它。论文目录必须已经存在。笔记库列表仍然只列 `notes/`。

## 待办

T4 到 T8 的代码已经在仓库里，`corepack pnpm build` 通过。T9 用 `dsh plugin --profile web add` 装进 `~/.dsh/profiles/web`，patch 写了 Vault `/Users/qychen/03-Knowledge/agentero-dsh` 和 `target/debug/agentero-cli`。`dsh web --no-open` 打印了 `[agentero] plugin loaded`。`desktop` 这个名字被 CLI 留给 Electron，不能拿来 `dsh web`。

已点过：文献表列出 RM-R1，点开后 PDF 出字，右侧是该篇 NOTES.md，笔记库三篇独立笔记能渲染标题。`POST /agentero/api/papers/tags` 加上再删掉 `dsh-smoke`，列表回到空标签。`GET /agentero/api/pdf` 返回 PDF 字节。

还没做：从 patch 拿掉一行再启动的解耦冒烟、划词高亮和加入会话、模型工具在真实会话里被调用。导出 BibTeX 和 `discover arxiv` 的路由通了，CLI 连不上 `translation-server.agentero.app` 和 `export.arxiv.org`，返回 502。T10 仍然排在后面。下面各节是当时的实现说明，不要按「未做」重写阅读器。

### T4 PDF 能打开

Host 增加 `GET /agentero/api/pdf?ref=`。

- 沿用 loopback、空 Vault 503、路径检查（可抽 `notes-files.ts` 里的相对路径和 realpath 判断，不要放宽 `..`）。
- `ref` 以 `.pdf` 结尾：读这个普通文件。
- 否则把 `ref` 当成论文目录（文献行传来的就是这种 `path`）。只看该目录的直接子文件，不进 `source/`、`marks/`。优先 `<目录名>.pdf`，否则按文件名排序取第一个 `.pdf`。没有则 404。
- 响应 `content-type: application/pdf`，正文是字节，不要 base64。

PDF 包：

- `inject` 增加 `'agentero'`，这样 opener 注册发生在服务就绪之后。面板注册仍然放在 `slots.inject` 里，不要因为服务缺失就跳过侧栏。
- `apply` 里 `ctx.effect(() => ctx.agentero.registerOpener('paper', id => { 记下 id; ctx.layout.selectPanel('agentero.pdf') }))`。
- 当前论文 id 放在 `apply` 闭包里的 snapshot（`getSnapshot` / `subscribe`），经 inject face 交给面板。不要用模块级单例 store。若使用 `@deepseek-ai/dsh-client-store`，必须 external require，不要打进 bundle。
- 面板对记住的 id `fetch('/agentero/api/pdf?ref=' + encodeURIComponent(id))`，用 `arrayBuffer`。
- 阅读用 EmbedPDF / PDFium（`@embedpdf/*` 2.14.4，只加在 `packages/pdf`）。Host 依赖 `@embedpdf/pdfium` 并提供 `GET /agentero/api/pdfium.wasm`。默认适应宽度，底栏改页和缩放。
- Worker 起不来就退回 direct engine，并在面板里显示错误文本。不要改成只抽纯文本。
- 还没有 id 时显示「从文献库打开一篇论文」。
- 这一步不要声明子槽，不要改笔记包。

验收：配好 Vault 后，文献表点一行，主区域变成这篇 PDF 的页面。卸掉 `agentero-pdf` 那一行再启动，文献和笔记仍在，点击行只显示「PDF 插件未启用」。

### T5 论文笔记槽

槽位类型写在 host 的浏览器入口（或一个没有界面的类型模块），用 `declare module '@deepseek-ai/dsh-client-ui-slots'` 增加：

```ts
'agentero.pdf.notes': {
  // single, root
  // owner props: { paperPath: string }
}
```

PDF 注册 `main` 时声明 child：

```ts
children: {
  'agentero.pdf.notes': { kind: 'single', scope: 'root' },
}
```

面板在 PDF 右侧 `renderSlot('agentero.pdf.notes', { paperPath })`。槽空着就只画 PDF。

笔记包 `ctx.slots.inject('agentero.pdf.notes', () => register(...))`。组件用笔记包里的 Plate 编辑器和读写回调。读：`GET /agentero/api/notes/file?path=` + `paperPath + '/NOTES.md'`（注意 path 已含 `papers/...`，不要再加前缀；拼接前规范化斜杠）。写：现有 PUT 拒绝 `notes/` 以外的路径。要保存论文笔记，必须给 PUT 增加一条允许：Vault 相对路径匹配 `papers/<单段>/NOTES.md`，仍然禁止 `..` 和跑出 Vault。不要把任意文件的写权限放开。

笔记库列表仍然只列 `notes/`，不要把每篇论文的 `NOTES.md` 再列进去。

验收：打开论文时右侧是该篇 `NOTES.md`。卸掉笔记插件，PDF 仍能翻页。卸掉 PDF 插件，笔记库自己的面板仍能编辑 `notes/`。

### T6 划词

浏览器不要自己算标注坐标。选中文字和页码交给 CLI，由 PDFium 写 `marks/`，再按返回的 0–1 矩形描到 canvas 上。

命令（参数数组，已有 `--vault` 和 `--json`）：

```text
agentero mark add <paper-ref> --kind highlight --quote "<text>" --page <n> --json
agentero mark add <paper-ref> --kind highlight --quote "<text>" --page <n> --comment "<text>" --json
agentero mark add <paper-ref> --kind translate --quote "<text>" --page <n> --to zh-CN --json
agentero mark add <paper-ref> --kind ask --quote "<text>" --page <n> --question "<text>" --json
agentero mark list <paper-ref> --json
```

实现在 `cli/src/commands/mark.rs`。`--quote` 按页定位，不接受外部传入的矩形。跨页句子定位会失败，界面要显示 CLI 的错误，不要发明矩形。

Host 增加例如 `POST /agentero/api/marks` 和 `GET /agentero/api/marks?ref=`，内部转这些子命令。超时和 502 形状与论文列表一致。

PDF 选区菜单：

| 动作 | 行为 |
|---|---|
| 复制 | 剪贴板 |
| 高亮 | `mark add --kind highlight`，然后重新 `mark list` 并绘制 |
| 批注 | 同上，加 `--comment` |
| 翻译 | `--kind translate`，译文显示在选区旁 |
| 加入对话 | 见下 |
| 快速对话 | 把选区作为当前会话的一条用户消息发出，并 `mark add --kind ask` |

加入对话：

- 面板在全局 `main` 上，不在 `SessionProvider` 里。用所有 scope 都有的 `useSessions`（`ui-session`）读取当前仍选中的会话 id。不要为了这个去改会话选中项，直到用户明确要跳回会话。
- Host Node 需要 `agents` 服务。对应该会话调用 `agent.inject`（`deepseek-harness/packages/core/agent/src/runtime-types.ts`）。注入内容是用户角色消息：论文题名、`ref`、页码、原文。这是模型下一轮能看见的上下文，不会自动出现在输入框。
- 同时把同一段引用写进该会话的输入草稿（先查 dsh 现有草稿写入入口，例如 `ui-workspace` 的 draft 选项）。找不到草稿 API 时，在输入区上方用本插件自己的一条引用条，发送时再 `followup`。
- 然后 `ctx.layout.selectPanel(null)` 回到会话。

不要调用 Agentero 桌面端的侧栏 Agent，也不要启动 BYOA。

有 `{paper}/source/layout-index.json` 时可以 `agentero layout list <ref> --json` 做侧栏，这是 T10，不要挡 T6。

### T7 文献写操作

仍走 CLI，不要在 TypeScript 里重写 Catalog。优先顺序：

1. `agentero import`（arXiv / DOI / URL）。文献表面一个导入框，成功后重新拉列表。
2. `agentero paper tag` 的 list / add / rm。
3. 元数据修改。先读 `cli/src/commands/paper.rs` 里实际有的子命令，没有的不要在 HTTP 层假装有。
4. 删除到回收站。确认 CLI 是移入 `.agentero/.trash` 而不是直接删文件。
5. BibTeX 导入导出、`discover`、补下载、盘上补录、阅读进度。这些可以分批，但都从 CLI 转，不复制 SQLite。

拖入 PDF、Zotero、EasyScholar 可以后做。列宽动画和滚动时藏表头不做。

### T8 模型工具

Host 用 `ctx.tools.register`（见 `deepseek-harness/docs/cookbook/adding-a-tool.zh.md`）暴露和 HTTP 同一套能力：列论文、按标识符导入、读 `NOTES.md`、在 `notes/` 里搜索或读文件。工具和界面写同一份 Vault。工具描述里写明路径必须是 Vault 相对路径。不要把 PDF 全文默认塞进工具结果；需要页文本时再单开一个有页码和长度上限的工具。

### T9 端到端

1. `corepack pnpm build`。
2. `dsh plugin --profile agentero add` 本仓库。`dump-config` 能看到四行。
3. profile 的 patch 写上真实 `vault` 和 `agenteroBin`。
4. `dsh web --profile agentero --no-open`。终端有 `[agentero] plugin loaded`。
5. 侧栏能打开文献、笔记、PDF。文献表有该 Vault 的论文。点一篇能翻页。右侧能改 `NOTES.md` 并且磁盘上变了。划一句高亮，`marks/` 里出现记录，刷新页面后高亮还在。加入对话后回到原来的会话，下一轮模型能看见这句和页码。
6. 从 patch 里临时拿掉 `agentero-pdf` 再启动：文献和笔记仍在。拿掉笔记插件：PDF 仍能翻页。

测试用的论文用 Vault 里已经有的，或 `agentero import` 两三篇 arXiv。不要把 PDF 二进制提交进 git。

### T10 以后再做

- 版面侧栏（图、表、公式）和 `mark add --region <layout-id>`。
- 任意框选。CLI 目前不接受调用方传入的矩形。要等 `agentero mark add` 能接收归一化矩形，或确认写出的 `marks/<id>.json` 与桌面阅读器同一 schema 之后再做。在那之前不要在浏览器里另写一套标注格式。
- 全文翻译、书签写回原 PDF、导出带批注的 PDF。
- 远程没有本地 `marks/` 的预览：只保留复制、加入对话、快速对话。

## 下一个 Agent 不要做的事

- 不要改 `deepseek-harness` 的源码来迁就插件。
- 不要把 `agentero-dsh-plugin` 加进 Motif 的 git。
- 不要提交 `lib/`、`node_modules/`、带本机绝对路径的 `dev.patch.yml`、Vault 路径、API key。
- 不要把三个界面合并回一个 React 应用。
- 不要用 schemastery，除非它能不依赖 harness 的 `workspace:` 协议安装。
- 不要把论文列表再解析进一套自建数据库。Catalog 的权威是 Vault 里的 `.agentero/catalog.sqlite`，通过 CLI 读写。
- 用户没有明确要求时不要 git commit。
