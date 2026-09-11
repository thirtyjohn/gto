# 翻前 GTO 训练器

6-max 100BB 现金局的翻前范围训练器。36 个位置场景，先看范围表再开练，成绩存在手机本地。

线上地址：https://thirtyjohn.github.io/gto/

## 目录

| 路径 | 内容 |
|---|---|
| `src/range.js` | 范围记法解析器、组合数加权发牌、判定规则 |
| `src/app.js` | 界面与训练流程 |
| `src/app.html` | 页面骨架与样式，含 `<!--@include-->` 标记 |
| `data/ranges.js` | 36 套范围数据，唯一的真相来源 |
| `src/review.html` | 范围对照表的模板 |
| `tools/build.sh` | 把模板和脚本合成单文件 |
| `docs/` | 构建产物，GitHub Pages 的站点根目录 |

## 构建

没有 Node，没有构建依赖。改完 `src/` 或 `data/` 下的文件后跑：

```bash
bash tools/build.sh src/app.html docs/index.html
bash tools/build.sh src/review.html docs/ranges-review.html
```

`build.sh` 会把模板里的 `<!--@include 路径-->` 替换成对应文件的内容，产出可以直接双击打开的单文件页面。

## 改范围

范围写在 `data/ranges.js` 里，用的是这套记法：

```
77+           对子 77 到 AA
22-66         对子区间
A8s+          A8s 到 AKs
K9s-K5s       同一张高牌的连续区间
AKo           单个手牌
A5s:75        该动作频率 75%，省略为 100%
```

改完重新构建即可。`docs/ranges-review.html` 会校验每手牌的频率合计不超过 100%，并检查每个场景的入池率是否落在 `expect` 区间内，超出会在页面顶部标红。

## 部署

GitHub Pages 的站点来源设为 `main` 分支的 `/docs` 目录。`docs/sw.js` 会预缓存全部资源，装到主屏幕后断网可用。

## 文档

- 产品说明：`docs/prd.html`
- 范围对照表：`docs/ranges-review.html`
