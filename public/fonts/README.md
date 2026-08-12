# 食迹字体资产

V1.4 的字体均本地托管，运行时不依赖字体 CDN。

| 文件 | 用途 | 来源与版本 | 许可证 |
| --- | --- | --- | --- |
| `source-han-sans-sc-ui-v2-2.woff2` | 首屏固定 UI 字体 `--font-ui`；动态文字回退系统字体 | Adobe Source Han Sans 2.005R；由全量源文件按 `scripts/generate-ui-font-subset.mjs` 子集化，目标不超过 300KiB | [LICENSE-Source-Han-Sans.txt](./LICENSE-Source-Han-Sans.txt) |
| `source-han-sans-sc-v2.005.woff2` | 生成输入与回滚资产；不在 CSS 首屏引用 | Adobe Source Han Sans 2.005R；由官方 `SubsetOTF/CN/SourceHanSansCN-Regular.otf` 转为 WOFF2 | [LICENSE-Source-Han-Sans.txt](./LICENSE-Source-Han-Sans.txt) |
| `zcool-xiaowei-v15-subset.woff2` | 创意标题 `--font-display` | Google Fonts 站酷小薇体 webfont revision `v15`；只保留 V1.4 四条创意标题所需字形 | [OFL-ZCOOL-XiaoWei.txt](./OFL-ZCOOL-XiaoWei.txt) |

官方来源：

- [Adobe Source Han Sans releases](https://github.com/adobe-fonts/source-han-sans/releases/tag/2.005R)
- [Google Fonts ZCOOL XiaoWei source](https://github.com/google/fonts/tree/main/ofl/zcoolxiaowei)

生成说明：在具备 `fontTools` 与 `brotli` 的环境运行 `npm run fonts:subset`。脚本扫描 `src` 中固定 UI 文案使用的字符，写出可审查的 `scripts/ui-font-glyphs.txt`，再从全量源文件生成 UI 子集；动态用户内容依赖系统回退字体，不能因子集缺字而截断。提交前运行 `npm run perf:resources`，确认子集不超过 300KiB 且 CSS 没有引用全量字库。站酷小薇体使用 Google Fonts 的 `text=` 子集接口生成，避免把创意字体用于动态用户内容。字体元数据、版本和许可证文本随文件保留。
