# OneDish

[English](README.md) | **简体中文**

![OneDish：此刻最适合你的那一道](docs/assets/onedish-devpost-thumbnail.png)

**别再刷了，就吃这个。** OneDish 会结合你的预算、饮食限制、当下状态和近期用餐记录，从附近的餐食选项中给出一个可追溯的答案。

[在线体验](https://polarislight.github.io/onedish/) · [观看 2:08 演示视频](docs/demo/onedish-demo.mp4)

## 问题

吃什么本该是个小决定。可大多数餐饮应用只会给你一条看不到尽头的信息流，再让你自己逐个比较。当价格、过敏原、精力、口味和昨天吃过什么都要考虑时，这个决定只会更难。

OneDish 直接替你做出选择。它只返回一道菜，并清楚说明这个结果是怎么来的。

## OneDish 能做什么

- 只给一个最终选择，而不是另一份推荐列表。
- 将过敏原排除视为绝不能放宽的硬约束。
- 使用本次决策中保存的证据，解释每一轮淘汰过程。
- 在设备本地学习你接受、拒绝或标记为已吃的餐食。
- 将用餐历史变成可查看、可重置的交互式 Taste Orbit。
- 在你授权前，先说明位置、健康背景和口味数据会流向哪里。

默认演示不需要 API Key。它使用 10 家虚构餐厅和 90 道版本化演示菜品；首次加载后还可以离线使用。

## 一次决策如何产生

1. OneDish 读取你愿意提供的背景信息。缺失信息会保持“未知”，不会被当成 0。
2. 硬约束先排除不安全或不符合条件的菜品。
3. 确定性引擎根据预算、距离、营养估算、饮食多样性和口味信号为剩余菜品评分。
4. 动画开始前，OneDish 会先保存完整的决策记录。
5. 结果页展示最终菜品、它胜出的原因，以及点击 **Pick another** 时可用的受限备选项。

淘汰动画只是在解释一项已经完成的决策。它不会模拟模型思考，也不会伪造候选数量。

## AI 在哪里发挥作用

OpenAI Responses API 是可选能力，而且职责被刻意限制。它可以把“想吃热的、辣一点，但别太顶”这样的自然语言转换成经过校验的结构化字段，但不能选择最终菜品、修改评分或绕过过敏原规则。

最终决定始终由确定性代码负责。即使模型或网络不可用，本地浏览器引擎仍然可以正常工作。

## 架构

```text
React PWA + IndexedDB
  ├─ 本地设置、每日状态和用餐历史
  ├─ 确定性推荐引擎
  ├─ 版本化菜品目录、地点样例和决策规则
  └─ 可选 FastAPI 服务
       ├─ Foursquare 或样例地点发现
       ├─ OpenAI Responses 语义解析
       └─ 服务端确定性引擎
```

浏览器会把完整且不可变的决策会话保存在 IndexedDB 中。演示资源、食物图片和应用外壳会被预缓存；`/api` 请求始终只走网络。

## 本地运行

环境要求：Python 3.12+、Node.js 22+ 和 pnpm。

```bash
make install
make runtime-data
pnpm --dir web dev
```

打开 <http://127.0.0.1:5173>，点击 **Pick my meal**。

浏览器演示不依赖后端 API。如需启动可选服务：

```bash
backend/.venv/bin/uvicorn onedish_api.app:app --host 127.0.0.1 --port 8000
```

## 可选实时服务

复制 `.env.example` 为 `.env`，只配置你需要的服务：

```text
ONEDISH_MODE=live
ONEDISH_FOURSQUARE_API_KEY=...
ONEDISH_OPENAI_API_KEY=...
```

在 live 模式下，Foursquare 可以发现附近地点，但它不能证明配送范围，也不提供演示中的虚构菜单。浏览器中不会包含任何服务商密钥。

## 隐私与真实边界

偏好、每日状态、历史记录和决策记录都保存在本地 IndexedDB。OneDish 没有账号、广告标识符、第三方分析或后台同步。重置演示会删除全部四张本地数据表。

OneDish 不声称拥有实时菜单库存、配送可用性、购物车、支付或完整下单能力。搜索链接只会打开对应平台的搜索页面。食物图片、价格、热量、蛋白质和距离会在适当位置标明为演示数据或估算值。

只有在获得许可后，精确位置才会发送给地图或地点服务商。原始健康样本不在 API 接口允许的范围内。详细信息请阅读[隐私边界](docs/privacy.md)和[数据来源说明](docs/data-provenance.md)。

## 验证

```bash
make test
make lint
make build
backend/.venv/bin/python scripts/build_offline_demo.py --check
backend/.venv/bin/python scripts/validate_catalog.py
backend/.venv/bin/python scripts/verify_public_artifacts.py
```

仓库还包含[演示脚本](docs/demo-script.md)、字幕、旁白源文件，以及最终视频交付包的验证器。

## 技术栈

OpenAI Responses API、Codex、React、TypeScript、Dexie、Vite、FastAPI、Pydantic、Vitest、Playwright 和 vite-plugin-pwa。

## 许可证

[MIT](LICENSE)
