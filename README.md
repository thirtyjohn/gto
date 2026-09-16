# 德州扑克 GTO 训练器

两个应用共用一套代码：翻前的起手牌范围训练，翻后的翻牌圈决策训练。
都是纯静态单文件页面，装到手机主屏后断网可用。

- 翻前：https://thirtyjohn.github.io/gto/
- 翻牌圈：https://thirtyjohn.github.io/gto/flop/

## 目录

| 路径 | 内容 | 归属 |
|---|---|---|
| `src/ui.js` | 元素构造、确认框、热力图着色、本机存储与错题本 | 共用 |
| `src/range.js` | 范围记法解析器、组合数加权发牌、判定规则 | 共用 |
| `src/table.js` | 牌桌渲染与自适应尺寸 | 共用 |
| `src/app.js` · `src/app.html` | 翻前的界面与训练流程 | 翻前 |
| `data/ranges.js` | 36 套翻前范围，唯一的真相来源 | 翻前 |
| `src/review.html` | 范围对照表的模板 | 翻前 |
| `src/cards.js` | 底牌与公共牌的成牌、听牌、八类牌力 | 翻后 |
| `src/board.js` | 牌面结构分类，七种结构 × 三种花色轴 | 翻后 |
| `src/equity.js` | 牌力评估、范围展开、双向阶梯、出张、续战范围、阻断 | 翻后 |
| `src/strategy.js` | 分区模型与三道闸，把胜率变成动作建议 | 翻后 |
| `src/flop.js` · `src/flop.html` | 翻牌圈的界面与训练流程 | 翻后 |
| `data/flop-scenarios.js` | 八个翻牌圈场景与对手预设 | 翻后 |
| `src/equity-review.html` · `src/strategy-review.html` | 两份自校验页的模板 | 翻后 |
| `tools/build.sh` | 把模板和脚本合成单文件 | 共用 |
| `docs/` | 构建产物，GitHub Pages 的站点根目录 | 共用 |

共用模块挂在三个全局对象上：`UI`、`Range`、`Table`。翻后另挂 `Cards`、`Board`、`Equity`、`Strategy`。
翻后的双方范围全部取自 `data/ranges.js`，没有另造任何范围数据。

### 修改共用模块的规矩

`ui.js`、`range.js`、`table.js` 被两个应用引用，改动前先跑回归。方法是把 `Math.random` 换成定值序列，走一遍固定操作，抓下每屏的渲染结果，改动前后两份快照必须完全一致。F1 抽取就是这么验的。

`equity.js` 与 `strategy.js` 改动后，把两份校验页打开跑一遍，用例必须全绿。
它们不依赖任何外部计算器：单挑胜率用精确枚举 990 种转牌河牌当真值，其余靠数学恒等式卡住。

## 构建

没有 Node，没有构建依赖。改完 `src/` 或 `data/` 下的文件后跑：

```bash
bash tools/build.sh src/app.html docs/index.html
bash tools/build.sh src/review.html docs/ranges-review.html
bash tools/build.sh src/flop.html docs/flop/index.html
bash tools/build.sh src/equity-review.html docs/flop-equity.html
bash tools/build.sh src/strategy-review.html docs/flop-strategy.html
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

## 翻后模型的边界

模型里"我定的"只有两个常数，写在 `src/strategy.js` 顶部：进攻方价值区宽度、防守方加注区宽度。
其余全部由赔率与枚举导出：诈唬区宽度、最小防守频率、范围分位、对手续战范围、阻断、出张。

刻意没做的事：不推导下注总频率。四种推导方式都试过并失败，五张对照表记在 `docs/flop-strategy.html` 第一节。装上价值闸之后频率自己按牌面分化了（A 高 62%、低牌面 43%），但那是逐手筛选的结果，不是推导。

价值闸问的是**被跟之后打到河牌还剩多少胜率**，不是此刻领先多少。
这两件事差别很大：T♠6♦3♣ 上的 4♦4♣ 被跟之后此刻领先 61%，打完两张牌只剩 47%。

已知的近似，都写在对应函数的注释里：
- 被跟后胜率是外推的。45 张转牌逐一精确算，与当前领先率之差就是一条街的漂移，
  还要发两张所以乘二。精确枚举一个牌面要十几秒，做不到。
  校验页把它与枚举真值逐手对照，实测误差 6 个百分点以内，听牌会被略微高估。
- 出张只看一张转牌，后门听牌记 0 张。这个数字只出现在界面上，不再参与决策。
- 诈唬排队时，过牌那一侧只按当前摊牌领先率计，不计过牌之后还能改进。
  一条街的模型算不出过牌的实现率，与其塞一个实现率参数，不如把过牌这边算保守。
- 对手的续战范围取"预估胜率最高的那部分，取到最小防守频率为止"，这是构造，不是解出来的。

## 部署

GitHub Pages 的站点来源设为 `main` 分支的 `/docs` 目录。
`docs/sw.js` 与 `docs/flop/sw.js` 各自预缓存本应用的资源，装到主屏幕后断网可用。

## 文档

- 翻前产品说明：`docs/prd.html`
- 翻前范围对照表：`docs/ranges-review.html`
- 翻后产品说明：`docs/flop-prd.html`
- 翻后分类器校验：`docs/flop-review.html`
- 胜率引擎校验：`docs/flop-equity.html`
- 分区模型校验：`docs/flop-strategy.html`
- 界面设计：`docs/flop-screens.html`
