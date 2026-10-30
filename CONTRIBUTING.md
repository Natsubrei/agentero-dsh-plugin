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
2. 在本地 profile 里确认插件能加载。
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

## 准备宿主

宿主使用旁边的源码检出，不把插件写进 Harness 仓库。

```sh
cd motif/deepseek-harness
corepack pnpm install
corepack pnpm run build
```

`pnpm run build` 生成仓库产物。之后 `pnpm dsh` 直接使用这些产物。已经构建过就可以跳过。

确认 CLI 能起来：

```sh
corepack pnpm dsh web --no-open
```

默认地址是 `http://127.0.0.1:3080`。页面能打开后停掉这个进程。

## 安装并构建插件

```sh
cd motif/agentero-dsh-plugin
corepack pnpm install
```

`prepare` 会执行 `tsc`，生成 `lib/`。`lib/` 和 `node_modules/` 不提交。需要单独重建时运行 `corepack pnpm build`；只做类型检查时运行 `corepack pnpm typecheck`。

和宿主共用实例的包同时放在 `peerDependencies` 与 `devDependencies`，目前是 `@deepseek-ai/cordis`。插件自己的运行时依赖才放进 `dependencies`。

## 链接到 profile

在 Harness 根目录把本仓库链接进名为 `agentero` 的 profile。第一次会初始化 profile，并把本包追加进 `dsh.profile.bundles`。

```sh
cd motif/deepseek-harness
corepack pnpm dsh plugin --profile agentero add ../agentero-dsh-plugin
corepack pnpm dsh --profile agentero --dump-config
```

`--dump-config` 里应能看到一层 `# == agentero-dsh-plugin`。然后启动 Web UI：

```sh
corepack pnpm dsh web --profile agentero --no-open
```

终端出现 `[agentero] plugin loaded` 即表示组合包已被加载。浏览器打开 `http://127.0.0.1:3080`。

卸下插件：

```sh
corepack pnpm dsh plugin --profile agentero remove agentero-dsh-plugin
```

profile 数据在 `$DSH_HOME/profiles/agentero`（未设置 `DSH_HOME` 时是 `~/.dsh`）。这个目录不属于任何一个 Git 仓库。

## 插件在仓库里的形态

```text
agentero-dsh-plugin/
├── package.json       # dsh.bundle 指向 patch
├── cordis.patch.yml   # 按包名插入插件行
├── src/index.ts       # 导出 name 与 apply
├── tsconfig.json
└── lib/               # tsc 产物，不提交
```

`cordis.patch.yml` 用包名引用入口，让 Node 解析已安装的代码：

```yaml
- insert:
    - id: agentero
      name: agentero-dsh-plugin
```

入口是一个导出 `apply` 的模块。框架加载时调用它，并通过 `ctx` 注册能力。`ctx.effect()` 的返回函数会在插件卸载时执行。

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'agentero'

export function apply(ctx: Context) {
  ctx.effect(() => {
    console.log('[agentero] plugin loaded')
    return () => {
      console.log('[agentero] plugin unloaded')
    }
  })
}
```

生效配置从空根开始，按这个顺序叠层：

1. profile 的 `dsh.profile.bundles`，先是 `@deepseek-ai/dsh-base`，再是后安装的组合包。
2. profile 自己的 `cordis.patch.yml`。
3. `$DSH_HOME/cordis.patch.yml`。
4. 命令行上的每个 `--patch`。

后应用的层按行覆盖。patch 会替换目标行的整个 `config`，不会按键深度合并。

## 日常改代码

1. 改 `src/`。
2. 在本仓库运行 `corepack pnpm build`。
3. 重启 `corepack pnpm dsh web --profile agentero`。

只改 profile 或 home 的 `cordis.patch.yml` 里已有行的 `config` 时，Cordis 会热替换该插件。组合包的安装和移除要重启进程后才生效。

临时用绝对路径加载 TypeScript、不经过 `lib/` 时，在本仓库写一份不提交的 `dev.patch.yml`：

```yaml
- insert:
    - id: agentero
      name: '/绝对路径/motif/agentero-dsh-plugin/src/index.ts'
```

然后：

```sh
cd motif/deepseek-harness
corepack pnpm dsh web --profile agentero --patch ../agentero-dsh-plugin/dev.patch.yml --no-open
```

这条路径只用于冒烟。要安装、分发的仍然是声明了 `dsh.bundle` 的组合包。

## 从 Git 安装

用户可以执行：

```sh
dsh plugin --profile agentero add github:poco-ai/agentero-dsh-plugin
```

Git 安装拿到的是源码。`prepare` 会在安装后编译 `lib/`。pnpm 10 及以上默认不跑 Git 依赖的构建脚本，第一次 `add` 可能失败。按 CLI 提示把包名写入该 profile 的 `pnpm-workspace.yaml`：

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

发布到 npm 或打 tarball 之前再构建，让 `files` 里列出的 `lib/index.js`、`lib/index.d.ts` 和 `cordis.patch.yml` 进入包内。
