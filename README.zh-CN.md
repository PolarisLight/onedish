# OneDish

[English](README.md) | **简体中文**

![OneDish：一家真实的附近餐厅](docs/assets/onedish-devpost-thumbnail.png)

**别再刷了，就去这里。** OneDish 把你周围——或者你选定的地标附近——的餐厅变成一个有真实依据的选择。

[使用地图优先正式版](https://onedish.cyhao.space/) | [打开静态离线演示](https://polarislight.github.io/onedish/)

VPS 正式版使用实时 FastAPI 与高德集成；GitHub Pages 保留基于固定数据的 90 道菜离线展示，作为稳定的备用入口。

## 地图优先的餐厅流程

1. **看看吃什么**是最快路径：先说明用途，再请求一次设备定位。
2. **选择其他地点**会打开高德地图。搜索车站、公园、学校、商场等真实 POI，选择标记或结果后确认。
3. OneDish 依次搜索 **2 公里**、**3 公里**和 **5 公里**，在第一个出现合格餐厅的范围停止，最远不超过 5 公里。
4. 所选分类是硬性 OR 条件：每个结果至少符合其中一项。已知价格最多只允许 `预算 + min(25%, ¥30/$5)` 的上探；超过则排除，缺失价格则明确标注为未核实。
5. 通过硬性条件后，使用固定评分：评分 55%、距离 35%、近期意图多样性 10%。缺失证据会按中性或未核实处理，不会编造事实。
6. 受控随机只从领先者 8 分以内、最多 5 家餐厅中不放回抽取，让结果有变化，但绝不跨越用户明确条件。
7. **换一家**会轮换完整的当前内存记录——餐厅、事实和候选专属理由一起更换——不会再次请求地点服务。Restaurant V2 的决策不调用 AI 模型。

原有的 90 道菜确定性流程保留在 `/demo`，并明确标注为离线演示。

## 部署拓扑

- **GitHub Pages：**使用 `VITE_RESTAURANT_FIRST=0` 构建的静态离线演示，不声称能够请求真实餐厅。
- **地图优先产品：**`onedish.cyhao.space` 同源提供 FastAPI 与 PWA，`/api` 在服务器本地转发，`/_AMapService` 由下文所述的同源安全代理处理。

## 架构

```text
同意后的当前定位，或已确认的高德 POI
      │
      ▼
FastAPI 餐厅推荐服务
  ├─ 高德实时结果（只用于当前请求，不缓存、不保存）
  └─ Overture 本地点位（开放许可 + 来源署名）
      │
      ▼
2 公里 → 3 公里 → 5 公里发现 → 硬性资格规则
      │
      ▼
固定 55/35/10 证据评分 → 最多 5 家优质候选
      │
      ▼
受控随机不放回排序
      │
      ▼
React 内存会话 → 真实筛选数字 → 一家餐厅
```

## 本地运行

需要 Python 3.12+、Node.js 22+ 和 pnpm。

```bash
make install
cp .env.example .env.local
```

服务端餐厅发现和浏览器地图需分别配置。在 `.env.local` 填写：

```text
AMAP_WEB_KEY=你的服务端Key
VITE_AMAP_JS_KEY=你的浏览器JS_Key
VITE_AMAP_SECURITY_CODE=仅本地开发使用的安全密钥
VITE_RESTAURANT_FIRST=1
```

- `AMAP_WEB_KEY` 只供 FastAPI 调用高德 Web 服务发现餐厅，不得暴露给浏览器。
- `VITE_AMAP_JS_KEY` 用于加载高德 JavaScript API 2.0、展示地图、搜索 POI 和选择标记；请在高德后台限制允许的域名。
- `VITE_AMAP_SECURITY_CODE` 只适用于本地开发。所有 `VITE_` 值都会被编译到浏览器资源，因此公开生产构建不得使用该模式。

生产环境应移除 `VITE_AMAP_SECURITY_CODE`，改用同源安全代理：

```text
VITE_AMAP_JS_KEY=已限制域名的浏览器JS_Key
VITE_AMAP_SERVICE_HOST=/_AMapService
```

service host 必须与页面同源，并使用 `/_AMapService` 路径；请按高德安全配置部署代理。security code 只留在代理侧，不得提交、打印或返回浏览器。

在仓库根目录打开两个终端，分别启动后端与网页：

```bash
make dev-api
make dev-web
```

两个命令都会读取仓库根目录的同一个 `.env.local`：FastAPI 使用仓库绝对路径，Vite 则把仓库根目录设为 `envDir`，无需手动 `export`。Vite 会在开发环境把 `/api` 代理到后端。打开 <http://127.0.0.1:5173>，可使用当前定位，也可点击**选择其他地点**。设置 `VITE_RESTAURANT_FIRST=0` 可让离线演示成为首页；`/demo` 始终可访问。

如果从已安装的 wheel、容器镜像或其他不含源码仓库标志的目录启动，必须设置 `ONEDISH_ROOT_PATH`，指向包含 `data/`、`web/public/`，以及在 FastAPI 托管生产前端时所需 `web/dist/` 的运行时资源根目录。部署密钥应由平台环境变量或密钥管理服务提供。安装版不会搜索虚拟环境的上级目录，也不会自动读取附近的 `.env.local`。嵌入式启动也可显式传入 `Settings(root_path=...)`。

## 开放餐厅数据

`data/restaurants.xiamen.v1.json` 是本地开放地点文件。使用 Overture Places Parquet 重新生成：

```bash
backend/.venv/bin/python scripts/build_xiamen_restaurants.py \
  --input /path/to/overture-places.parquet \
  --output data/restaurants.xiamen.v1.json
```

必须保留每条记录的上游署名。高德单源开发时允许文件为空，但此时没有开放数据降级能力。

## 隐私与能力边界

- 设备坐标、已选 POI 和高德观测数据只用于当前请求。OneDish 不保存、不缓存、不分析、不记录其 ID、名称、地址、坐标或供应商原始返回。
- 餐厅候选会话只存在 JavaScript 内存中，刷新即消失。
- 符合许可的开放地点记录可以连同署名保存。
- 本地餐厅历史只包含 `{id, occurred_at, action, selected_tags, budget_band_minor}`。这些由用户产生的意图字段用于让今后的结果更有变化，不包含餐厅、POI、地址、坐标、评分、价格、图片或导航字段。
- 拖动地图只改变视野。OneDish 只接受真实 POI 标记或地图搜索结果，不接受任意坐标。
- 如果当前数据没有证据，OneDish 不会声称菜单库存、配送、下单、营养、营业状态、价格、评分或过敏原安全。

进一步阅读[隐私边界](docs/privacy.md)、[运行手册](docs/runbook.md)、[餐厅决策 V2](docs/superpowers/specs/2026-07-20-restaurant-decision-v2-design.md)和[地图选点设计](docs/superpowers/specs/2026-07-19-restaurant-map-cold-start-design.md)。

## 验证

```bash
make test
make lint
make build
pnpm --dir web e2e
```

## 技术栈

React、TypeScript、Vite、Motion、FastAPI、Pydantic、httpx、高德、Overture Maps、Vitest 和 Playwright。黑客松时期的离线演示仍保留 OpenAI 生成的原创美术资产；Restaurant V2 本身不调用模型。

## 许可证

[MIT](LICENSE)
