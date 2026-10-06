# TanPit-01 · 南冈鞣场

鞣坑场地图作业台。登录后是按行列铺开的坑位，点坑登记浸液酸碱度并改状态。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Web API | Django 5 · Django Ninja（不是 DRF 视图集） |
| 结构 | Django app `pits`：models / rules / api 分文件 |
| 数据 | Django ORM · PostgreSQL 15 |
| 前端 | Lit 3 Web Component · Vite |
| 部署 | Docker Compose |

## 路径与端口

- 前端：http://localhost:4770
- API：http://localhost:8770
- PostgreSQL：localhost:6170

## 演示账号

`admin` / `123456`，`worker` / `123456`

## 业务规则

坑不可标「已放液」，除非最近一次浸液酸碱度在 **3.5～5.0**。规则在 `backend/pits/rules.py`。

排液渠渠况旗（`DitchFlag`）：

- 顶栏两个页面：**坑位场地图** 与 **排液渠**。渠况页按日新建「畅通 / 淤塞」旗、可作废，列表可按巡渠日、渠况、效力筛选。
- 渠旗含：场、巡渠日、渠况、巡渠人；作废栏（作废人/作废时间）允许空白。**同一场同一日最多一面有效旗**（数据库部分唯一约束兜底，并发抢插只留一面，其余 409）。
- 仅 **admin** 可新建渠旗与作废；worker 只能查看列表。
- 坑当前为「鞣制中」改「注液」时读取**当日有效渠旗**：无旗或淤塞都挡住；当日畅通旗才放行。渠旗不拦「已放液」、不拦登记酸碱度，「已放液 → 注液」也不读渠旗。
- 种子数据：恰好一坑「鞣制中」（东-1），另有一面**当日淤塞旗**（巡渠人 admin）。

## 快速启动

```bash
cd TanPit/TanPit-01
docker compose up --build
```
