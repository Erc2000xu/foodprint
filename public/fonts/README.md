# 食迹字体资产

V1.4 的字体均本地托管，运行时不依赖字体 CDN。

| 文件 | 用途 | 来源与版本 | 许可证 |
| --- | --- | --- | --- |
| `source-han-sans-sc-v2.005.woff2` | 全站功能字体 `--font-ui` | Adobe Source Han Sans 2.005R；由官方 `SubsetOTF/CN/SourceHanSansCN-Regular.otf` 转为 WOFF2 | [LICENSE-Source-Han-Sans.txt](./LICENSE-Source-Han-Sans.txt) |
| `zcool-xiaowei-v15-subset.woff2` | 创意标题 `--font-display` | Google Fonts 站酷小薇体 webfont revision `v15`；只保留 V1.4 四条创意标题所需字形 | [OFL-ZCOOL-XiaoWei.txt](./OFL-ZCOOL-XiaoWei.txt) |

官方来源：

- [Adobe Source Han Sans releases](https://github.com/adobe-fonts/source-han-sans/releases/tag/2.005R)
- [Google Fonts ZCOOL XiaoWei source](https://github.com/google/fonts/tree/main/ofl/zcoolxiaowei)

生成说明：思源黑体文件从官方简体中文子集转换为 WOFF2；站酷小薇体使用 Google Fonts 的 `text=` 子集接口生成，避免把创意字体用于动态用户内容。字体元数据、版本和 OFL 文本随文件保留。
