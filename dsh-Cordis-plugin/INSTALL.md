# 安装

**简体中文**

把 `@dsh-external/dsh-ui-grokbot` 装进 DSH 的 Web profile。前置条件：

- DSH 已可运行 `dsh web`（本机 DSH 检出 `D:\yyt_code\github_repos\deepseek-harness-master`，`@deepseek-ai/dsh@0.0.1-rc.5` 或同形态版本）；
- 本插件已构建：`lib/{index,invariant,client}.js` 存在（仓库自带构建产物；改源码后先 `pnpm build`）。

## 1. 装进 web profile

```sh
dsh plugin --profile web add link:D:/yyt_code/github_repos/Just_Vibe_Coding/dsh-Cordis-plugin
```

> 等价于在 `$DSH_HOME/profiles/web` 目录下执行 `pnpm add link:...`。请把路径换成你机器上的实际绝对路径（Windows 上用正斜杠即可）。

## 2. 加配置行

编辑 `$DSH_HOME/profiles/web/cordis.patch.yml`（不存在则创建），加入：

```yaml
- insert:
    - id: dsh-ui-grokbot
      name: '@dsh-external/dsh-ui-grokbot'
```

> 若该文件已存在其他 patch，把上面的 `- insert:` 块合并进去，不要覆盖原文件。
> 配置行热重载；插件集合变更按「重启生效」纪律，稳妥起见重启一次 `dsh web`。

## 3. 验证

1. 重启 `dsh web`（Ctrl+C 后重新启动）；
2. 打开 `http://127.0.0.1:3080`，**会话标题栏右侧**出现 GrokBot 头像：
   - 空闲时缓慢换表情 + 偶尔眨眼；
   - 发送消息后：思考中（reasoning）→ 思考表情池快速切换；工具运行时 → 工作表情池；
   - 回合完成 → 庆祝表情 2.6 秒；
   - 连续空闲 10 秒 → 入睡（闭眼表情、不眨眼）；
   - 鼠标悬停视线跟随，点击转一整圈。
3. 启动日志 / 浏览器控制台无 `@dsh-external/dsh-ui-grokbot` 相关报错；`window.__DSH_BOOT__` 清单包含该包名，`/plugins/@dsh-external/dsh-ui-grokbot/client.js` 返回 200。

## 卸载 / 禁用

- 从 `cordis.patch.yml` 删除 `dsh-ui-grokbot` 行（热重载生效）；
- 彻底移除：`dsh plugin --profile web remove @dsh-external/dsh-ui-grokbot`。

## 故障排查

| 现象 | 检查 |
| --- | --- |
| 标题栏没有头像 | ① `window.__DSH_BOOT__` 是否含包名；② `/plugins/@dsh-external/dsh-ui-grokbot/client.js` 是否 200；③ profile 的 `package.json` 是否含该依赖；④ 配置行 id/name 是否正确 |
| 启动报 `ClientPackageCompositionError` | 本插件 `lib/client.js` 缺失——先 `pnpm build` |
| 浏览器报 `require` 相关错误 | 构建产物过旧 / DSH 版本与 `dsh.client` 元数据形态不匹配——用本仓库当前版本重新 build |
| 表情不动 | 会话快照未更新（未在会话内发消息）；或浏览器禁用了 rAF 的标签页会自然暂停动画 |

## 本地开发预览（无需安装）

```sh
cd D:/yyt_code/github_repos/Just_Vibe_Coding/dsh-Cordis-plugin
pnpm install && pnpm build
# 浏览器直接打开 demo/index.html
```
