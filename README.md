# dsh-lingo-pet（外语桌宠）

一只住在 DSH 页面里、**说日语**的小东西。

它不教你，也不考你。它只是隔一会儿说一句日语；你看不懂就把鼠标放上去，想查哪个词就点哪个词。过几天，它会换个句子把那个词再说一遍。

> 现在是最小可用版（M1）：会说、会躲、会记账。还不会自适应难度，也没有独立窗口。

---

## 它做什么

- 按"每日句数 ÷ 剩余时段"自动摊平开口频率，不会上午说完下午装死
- 安静时段、最小间隔、你在输入框打字时，它闭嘴
- 悬停气泡显示中文译文；点任意标出来的词，显示读音和释义
- 拖到任意位置（位置会记住）；右键静音 1 小时；双击静音 4 小时
- 点过的词 = 不认识，复习间隔打回 1 天，过几天优先出现在别的句子里
- 连续三次出现没人理，当天预算减半；再来三次，当天收工
- 设置页有「试一句」：不看时段、不计预算，当场让它说一句

## 不是什么

不纠错、不测验、不打卡、不推送系统通知、不接 LLM。语料是手写 + 校验过的，运行时零模型调用、零联网。

---

## 装（本地开发版）

```bash
dsh plugin --profile desktop add link:D:\大肥鱼\jpl-pet
```

然后**重启一次 DSH**。重启后：

- 页面右下角出现宠物；
- 设置 → **外语桌宠** 里能改每日句数、时段、译文显示。

卸载：

```bash
dsh plugin --profile desktop remove dsh-lingo-pet
```

> 手动装也可以：把本目录放到 `%USERPROFILE%\.dsh\profiles\<profile>\node_modules\dsh-lingo-pet`，
> 在 profile 的 `package.json` 的 `dsh.profile.bundles` 里加 `dsh-lingo-pet`。
> 改 `package.json` 一律存 **UTF-8 无 BOM**。

---

## 数据在哪

| 文件 | 内容 |
|---|---|
| `~/.dsh/lingo-pet/config.json` | 设置 |
| `~/.dsh/lingo-pet/state.json` | 词账本、今天说了几句、位置 |
| `~/.dsh/lingo-pet/diag.log` | 加载与定时器诊断（出问题先看它） |

卸载插件不会删这两个文件。

---

## 语料

`assets/corpus/ja.jsonl` 由 `ja.a2.tsv` 生成，规则见 [SPEC.md](SPEC.md)。

```bash
node tools/corpus.mjs ja.a2.tsv --out dist/ja.jsonl
node tools/lemmatize.mjs ja.a2.tsv ja.a2.lemma.tsv   # 补辞书形
```

改完语料，把 `dist/ja.jsonl` 复制到 `assets/corpus/ja.jsonl`，**一分钟内自动生效，不用重启**。

---

## 开发

```bash
node --test                     # 调度 / 选句 / 插件启动冒烟
node tools/corpus.mjs demo-9.tsv
```

目录：

```
lib/index.js      宿主：配置、路由、注入、定时器
lib/scheduler.js  预算平滑（纯函数）
lib/selector.js   选句 + 词账本（纯函数）
assets/widget.js  页面里的宠物（纯 DOM）
client.js         设置页
assets/pet.svg    形象（占位，可换）
```

`inject` 只要 `webServer`，不依赖任何其他插件，也没有 npm 依赖。

## 许可

MIT。角色图是占位图，换成你自己的之前请确认授权。
