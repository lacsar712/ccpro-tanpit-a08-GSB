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

- 坑不可标「已放液」，除非最近一次浸液酸碱度在 **3.5～5.0**。规则在 `backend/pits/rules.py`。
- 排液渠渠况按日插旗：**畅通** 或 **淤塞**，含场地、巡渠日、巡渠人；可作废（作废栏允许空白）。
- 同一场地、同一日最多一面**未作废**旗——由数据库部分唯一索引兜底，两名巡渠人并发抢插也只留一面。
- 仅**管理员**可巡渠（新建旗）与作废；巡坑工只能查看。
- 只有坑在**鞣制中**、点「注液」改回注液时读取**当日畅通旗**：当日无旗或旗为淤塞一律挡住。
- 渠旗不拦「已放液」、不拦登记酸碱度；从「已放液」拨回「注液」也不读渠旗。

## 快速启动

```bash
cd TanPit/TanPit-01
docker compose up --build
```
