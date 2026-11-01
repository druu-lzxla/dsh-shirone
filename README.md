# dsh-lingo-pet（外语桌宠）

一只住在 DSH 页面里、**说日语**的小东西。

它不教你，也不考你。它只是隔一会儿说一句日语；你看不懂就把鼠标放上去，想查哪个词就点哪个词。过几天，它会换个句子把那个词再说一遍。

> 当前状态：M1 可用。语料 450 条（A2 280 / B1 100 / B2 70），词头 339。
> 还没有独立窗口，自动难度升降级也没启用（规则已定，等真实数据）。

---

## 它做什么

- 按"每日句数 ÷ 剩余时段"自动摊平开口频率，不会上午说完下午装死
- 安静时段、最小间隔、你在输入框打字时，它闭嘴
- 悬停气泡显示中文译文；点任意标出来的词，显示读音和释义
- 拖到任意位置（位置会记住）；右键静音 1 小时；双击静音 4 小时
- 点过的词 = 不认识，复习间隔打回 1 天；没点、到期了就按 1→2→4→8 天拉长
- 等级是"内容的天花板"：B2 用户仍然会听到 `おかえり` 这种寒暄（详见 [等级规则](docs/level-rules.md)）
- 连续三次出现没人理，当天预算减半；再来三次，当天收工
- 设置页有「试一句」：不看时段、不计预算，当场让它说一句

## 不是什么

不纠错、不测验、不打卡、不推送系统通知、不接 LLM。语料是手写 + 校验过的，运行时零模型调用、零联网。

---

## 装（本地开发版）

```bash
dsh plugin --profile desktop add link:D:\大肥鱼\jpl-pet
```

然后**重启一次 DSH**。重启后页面右下角出现宠物；设置 → **外语桌宠**。

卸载：

```bash
dsh plugin --profile desktop remove dsh-lingo-pet
```

> 手动装：把本目录放到 `%USERPROFILE%\.dsh\profiles\<profile>\node_modules\dsh-lingo-pet`，
> 在 profile 的 `package.json` 的 `dsh.profile.bundles` 里加 `dsh-lingo-pet`。
> 改 `package.json` 一律存 **UTF-8 无 BOM**。

---

## 语料

源文件在 `corpus/`，规则见 [corpus/SPEC.md](corpus/SPEC.md)。

```
corpus/
  ja.a2.tsv         A2 第一批（100）
  ja.a2.core.tsv    A2 核心 60 词（180）
  b1.tsv            B1（100）
  b2.tsv            B2（70）
  SPEC.md           格式与硬规则
  examples/         样张（不参与构建）
  planning/         core-60 词表、B2 复现词表
```

构建（合并、查重、查格式，写到运行时文件）：

```bash
npm run build:corpus
```

它等价于：

```bash
node tools/corpus.mjs corpus/ja.a2.tsv corpus/ja.a2.core.tsv corpus/b1.tsv corpus/b2.tsv \
  --out assets/corpus/ja.jsonl
```

`assets/corpus/ja.jsonl` 改完**一分钟内自动生效，不用重启**。

补辞书形（只在旧文件需要时用）：

```bash
node tools/lemmatize.mjs corpus/b1.tsv corpus/b1.out.tsv
```

---

## 数据在哪

| 文件 | 内容 |
|---|---|
| `~/.dsh/lingo-pet/config.json` | 设置 |
| `~/.dsh/lingo-pet/state.json` | 词账本、今天说了几句、位置 |
| `~/.dsh/lingo-pet/diag.log` | 加载与定时器诊断（出问题先看它） |

卸载插件不会删这些文件。

---

## 开发

```bash
node --test          # 调度 / 选句 / 插件启动冒烟
npm run build:corpus # 语料校验 + 构建
```

目录：

```
lib/index.js      宿主：配置、路由、注入、定时器
lib/scheduler.js  预算平滑（纯函数）
lib/selector.js   选句 / 三桶配额 / 词账本（纯函数）
assets/widget.js  页面里的宠物（纯 DOM）
assets/corpus/    运行时语料（由 corpus/ 构建）
client.js         设置页
assets/pet.svg    形象（占位，可换）
```

`inject` 只要 `webServer` 和 `timer`，不依赖任何其他插件，也没有 npm 依赖。

---

## 已知限制

- **有一部分 B2/B1 句子假定"它看得见"**（天气、你昨天几点睡、冰箱空了）。目前没有这些信息源，随机说出来可能不贴切。下一步要么给语料打 `grounding` 标签、默认不选这类，要么把它们改写成习惯句。
- 自动难度升降级规则已写进 [等级规则](docs/level-rules.md)，但**未启用**。
- 语音用系统 TTS（`speechSynthesis`），音质一般，默认关。
- 只有页面内宠物，没有浮在其他窗口上的独立窗口。

## 许可

MIT。角色图是占位图，换成自己的之前请确认授权。
