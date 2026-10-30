# PDF 页面内翻译

点 PDF 右上角「全文翻译」，当前页先翻译，随后处理其余页。完成的段落直接覆盖原位置，保留图片、公式和版面坐标；再次点击「显示原文」可恢复原文。失败的区域保留原文，点击「重试」只补未完成区域。关闭翻译、切页或关闭文档会取消当前请求；已完成区域在当前文档组件生命周期内缓存。

## 使用 DeepSeek

插件 Host 通过 Harness 的 `llm.prepareCall()` 调用模型。默认读取 `agentDefaultModel.currentSelection()`；在 Harness 中把默认模型设为已配置的 DeepSeek 模型即可。凭据、端点和实际传输协议由 Harness provider 管理，插件不接收或保存 API key，不创建聊天会话，也不传入工具。

要单独指定翻译模型，在本机 profile 的 `cordis.patch.yml` 配置：

```yaml
- id: agentero-host
  config:
    vault: /你的知识库
    agenteroBin: /你的/agentero-cli
    translationProvider: deepseek
    translationModel: <Harness 中该 provider 实际提供的模型 ID>
    translationSystemPrompt: 翻译得自然一点，术语保持一致
```

`translationProvider` 和 `translationModel` 必须一起填写；两项都留空时跟随默认模型。provider 名必须是 Harness 注册的路由。patch 会替换该插件的整个 config，所以保留原有 vault、CLI 等设置。模型未配置或鉴权失败时明确报错，不静默切回免费机器翻译。

采样温度为 0.2；模型提供 reasoning 档位时选其声明的最低档，具体参数由适配器转换。单次模型输出上限 8192 tokens、单次请求限时 90 秒、一次文本翻译总限时 5 分钟。每个入口最多接受 20000 字符。

## 从 motif 迁移的逻辑

- `translation/prompt.ts`：引擎规则、学术风格、短语/词典模式、编号约束。`translationSystemPrompt` 的简短偏好追加到规则，较长模板仅替换风格块；`translationUserPrompt` 可用 `{{text}}`、`{{sourceLang}}`、`{{targetLang}}`。引擎保护规则始终保留。
- Host 的 `translation/`：公式、引用、链接和样式占位保护；连字与断词修复；分句；4500 字符预算的编号批量翻译，长句按 2200 字符分块；校验编号、丢失/重复/虚构占位符；编号异常逐句回退，截断响应拆分重试。保护校验失败先单句重试，再用字母别名，最后固定占位符只翻译中间正文。认证等服务错误交给 Harness，不在插件里盲目重复请求。
- PDF 的 `translation/extract.ts`、`coverage.ts`、`reading-order.ts`：按原始字符索引提取正文、字体、强调样式、公式岛和基线；字符覆盖检查、分栏/分行、表格文字和不可见/旋转字符处理。
- PDF 的 `translation/layout.ts`：保留公式宽高和基线；中西文混排、标点避头尾、优先不拆英文单词；逐步缩放，已知布局下避让障碍物，协调段落字号。无法排下的区域保持原文。
- PDF 的 `translation/translate-paragraph.ts`：检查公式及样式标记的唯一性、成对关系。模型改变标记顺序时，固定源标记，只翻译间隔正文，修复 `Translation changed formula or style markers`。

迁移文件保留 MIT 版权声明。插件没有 Tauri 运行时，字体度量改用浏览器 Canvas；公式用原 PDF 裁图保留，显示层用 DOM 按重排坐标绘制。它不是下载一个新 PDF 再覆盖源文件。

## 布局与边界

优先读取论文目录的 `source/layout.json`，使用 motif 的区域分类。没有缓存时用 PDFium rich text runs 做基线分组、列间隔拆分和段落合并，再交给字符级提取；这一路只在原框内排版，不借用可能属于图表的空白。复杂扫描件需要先在 motif 做 OCR/布局分析；本插件没有迁入布局检测模型、OCR 或译文 PDF 导出。

译文支持浏览器原生选中与复制。原文链接/高亮坐标仍属于原 PDF，尚未迁移到重排后的译文字形；需要原文注释或链接交互时切回原文。译文缓存是内存缓存，重新打开文档会重新翻译。无布局缓存时，对复杂表格、跨栏标题和彩色背景的识别不等同于 motif 的布局模型结果。

## 验证

```sh
node scripts/test-translation.mjs
```

测试覆盖模型调用边界、取消、截断、占位符修复、编号回退、标注持久化、双栏提取、公式与样式标记修复和排版缩放。浏览器可视验证使用真实 PDFium 和本地固定译文，检查原位覆盖、图片保留、公式裁片、深色、缩放、原文切换及缓存复用；这不代表真实模型翻译质量测试。
