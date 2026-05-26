# ReefMatrix 架构重构 TODO

> 来源：improve-codebase-architecture 分析报告（2026-05-25）
> 原则：垂直切片，步子小，每片可独立 review / 合并。
> S5（fake adapter + 单元测试）已明确跳过，等系统稳定后再补。

---

## S1 — ParameterRepo：引入水质记录 Repository 接口 ✅ DONE

**目标：** handler/parameter.go 不再直持 `*gorm.DB`，所有 DB 操作通过 `ParameterRepo` 接口调用。

**涉及文件：**
- `backend/internal/repository/parameter.go`（新建）
- `backend/internal/handler/parameter.go`（修改）
- `backend/cmd/server/main.go`（修改，更新 DI 注入）

**验收标准：**
- [ ] `ParameterRepo` 接口在 `repository` 包中定义
- [ ] `pgParameterRepo` PG adapter 实现所有接口方法
- [ ] `ParameterHandler` struct 改为持有 `ParameterRepo`（db 仅保留用于 ownsTank，见 S4）
- [ ] `main.go` 中注入 `NewPgParameterRepo(db)`
- [ ] 编译通过，现有 API 行为不变

---

## S2 — TankRepo：引入鱼缸 Repository 接口 + 修复 N+1 ✅ DONE

**目标：** handler/tank.go 通过 `TankRepo` 接口操作数据；List 方法用单条 JOIN 替换循环查询。

**涉及文件：**
- `backend/internal/repository/tank.go`（新建）
- `backend/internal/handler/tank.go`（修改）
- `backend/cmd/server/main.go`（修改）

**验收标准：**
- [ ] `TankRepo` 接口定义 `List / Get / Create / Update / Archive / Restore / Purge / LatestParam`
- [ ] `List` 实现用 LEFT JOIN 单次查询返回鱼缸 + 最新水质，消除 N+1
- [ ] `TankHandler` struct 改为持有 `TankRepo`（db 仅保留用于 ownsTank，见 S4）
- [ ] `main.go` 更新 DI
- [ ] 编译通过，List 返回结构与现有一致

**依赖：** 无（可与 S1 并行）

---

## S3 — AssetRepo：引入资产 Repository 接口 ✅ DONE

**目标：** handler/asset.go 通过 `AssetRepo` 接口操作数据。

**涉及文件：**
- `backend/internal/repository/asset.go`（新建）
- `backend/internal/handler/asset.go`（修改）
- `backend/cmd/server/main.go`（修改）

**验收标准：**
- [ ] `AssetRepo` 接口定义 `List / Create / FindByID / Update / Delete`
- [ ] `AssetHandler` struct 改为持有 `AssetRepo`（db 仅保留用于 ownsTank，见 S4）
- [ ] `main.go` 更新 DI
- [ ] 编译通过，现有 API 行为不变

**依赖：** 无（可与 S1/S2 并行）

---

## S4 — TankAuthz：提取 ownsTank，消除三处重复 ✅ DONE

**目标：** `ownsTank()` 在 parameter / asset / tank 三处各一份，统一提取为 `repository.TankAuthz` 接口或 middleware，S1/S2/S3 遗留的 `db *gorm.DB` 一并清除。

**涉及文件：**
- `backend/internal/repository/tank_authz.go`（新建）
- `backend/internal/handler/parameter.go`（修改）
- `backend/internal/handler/tank.go`（修改）
- `backend/internal/handler/asset.go`（修改）
- `backend/cmd/server/main.go`（修改）

**验收标准：**
- [ ] `TankAuthz` 接口定义 `OwnsTank(userID, tankID uuid.UUID) bool`
- [ ] 三个 handler 全部改用 `TankAuthz`，不再持有 `*gorm.DB`
- [ ] 编译通过，鉴权行为不变

**依赖：** S1 + S2 + S3 全部完成后开始

---

> 注：Candidate 6（提醒调度器）待后续评估。

---

# 大版本迭代 — 双引擎注册策略

> 设计文档：frontend/src/pages/Prototype/NOTES.md
> 依赖顺序：DB-001 → AUTH-001 → {LAND/REG/SET} → PROTO-001
>            DB-001 → ADM-001 → REG-002

## DB-001 — Schema 迁移：users 扩展 + reef_questions + quiz_sessions ✅ DONE

**涉及文件：**
- `backend/migrations/008_v2_user_and_quiz.up.sql`（新建）
- `backend/migrations/008_v2_user_and_quiz.down.sql`（新建）
- `backend/internal/models/user.go`（修改）
- `backend/internal/models/reef_question.go`（新建）
- `backend/internal/models/quiz_session.go`（新建）

**验收标准：**
- [ ] users 表新增：email / username / my_invite_code / invited_by / registration_path / timezone / salinity_unit / temp_unit / theme
- [ ] users.phone 改为可空（DROP NOT NULL）
- [ ] reef_questions 表创建，含 options(JSONB) / answer / explanation / category / is_active
- [ ] quiz_sessions 表创建，含 ip_hash / quiz_token / passed / expires_at + 防刷索引
- [ ] Go model 同步更新
- [ ] `go build ./...` 编译通过

---

## AUTH-001 — 邮箱登录 + 路由重构 ✅ DONE

**依赖：** DB-001

---

## LAND-001 — LandingPage 正式实现（B 极客数据风格） ✅ DONE

**依赖：** AUTH-001

---

## REG-001 — Web 注册页 Shell + 邀请码路径 ✅ DONE

**依赖：** AUTH-001

---

## REG-002 — Web 知识问答注册路径 ✅ DONE

**依赖：** REG-001 + ADM-001

---

## REG-003 — 小程序 wx-bind 路径 ⬜

**依赖：** AUTH-001

---

## SET-001 — Settings 扩展（账户 + 偏好 + 邀请码 + 删除账号） ✅ DONE

**依赖：** AUTH-001

---

## ADM-001 — Admin 题库管理（reef_questions CRUD + 邀请关系） ✅ DONE

**依赖：** DB-001

---

## PROTO-001 — 原型清理（删除 /prototype/* + App.tsx 路由） ✅ DONE

**依赖：** LAND-001 + REG-001

---

# 硬件运行参数追踪模块（HardwareParametersTracking）

> 原型选型：变体 B（图表注释联动），见 `frontend/src/pages/Dashboard/NOTES.md`
> 图表库：Recharts（项目现有，非 ECharts），使用 ReferenceLine + 自定义 HwTooltip
> 依赖顺序：DB-002 → FE-001（可并行）→ FE-002

---

## DB-002 — 设备参数表 + 调参日志 + REST API ✅ DONE

**目标：** 建立钙反状态表、滴定通道表、调参日志表，提供读写设备参数的 REST API。

**涉及文件：**
- `backend/migrations/010_equipment_tracking.up.sql`（新建）
- `backend/migrations/010_equipment_tracking.down.sql`（新建）
- `backend/internal/models/equipment.go`（新建）
- `backend/internal/repository/equipment.go`（新建）
- `backend/internal/service/equipment.go`（新建）
- `backend/internal/handler/equipment.go`（新建）
- `backend/cmd/server/main.go`（修改，注入路由）

**数据模型（三张表）：**
```sql
-- 钙反当前状态（每缸1行 UPSERT）
calcium_reactor_states(tank_id UNIQUE, flow_rate, target_ph, outlet_kh, updated_at)
-- 滴定通道当前状态（每通道1行 UPSERT）
dosing_pump_channels(tank_id, channel_name, daily_dose_g, updated_at, UNIQUE(tank_id,channel_name))
-- 调参日志（只追加）
equipment_tuning_logs(tank_id, device_type, param_name, old_value, new_value, changed_at)
```

**API：**
- `GET  /api/tanks/:id/equipment`          — 返回钙反状态 + 所有滴定通道
- `PUT  /api/tanks/:id/equipment`          — UPSERT 钙反/滴定参数，自动写入日志
- `GET  /api/tanks/:id/equipment/tuning-logs` — 返回该缸调参日志（按 changed_at DESC）

**验收标准：**
- [ ] 三张表 migration 可 up/down 无误
- [ ] Go model 同步，`go build ./...` 通过
- [ ] `GET /api/tanks/:id/equipment` 返回结构含 `calcium_reactor` + `dosing_channels[]`
- [ ] `PUT` 调参后状态表更新，同时插入 tuning_log 记录
- [ ] `GET tuning-logs` 返回按时间倒序的日志列表
- [ ] 鱼缸权限校验：非 owner 返回 403

**依赖：** 无，可立即开始

---

## FE-001 — Dashboard 设备参数区静态布局 ✅ DONE

**目标：** 在 Dashboard 新增设备运行参数大卡片，重构下方事件区布局，全程使用 Mock 数据。

**涉及文件：**
- `frontend/src/pages/Dashboard/index.tsx`（修改）

**布局结构：**
```
[水质快览 8列卡片]

[设备运行参数卡]
  左列：钙反（出水流速 ml/min / 目标pH / 出水KH dKH）
  右列：滴定泵（channel_name + daily_dose g/day，无进度条）
  顶部右侧：[调参] / [保存] 按钮，全卡 input 编辑态

[事件与操作日志区（左右分栏）]
  左：调参时间轴（竖线引导线 + 圆点，钙反琥珀/滴定蓝）
  右：近期操作记录（从现有独立卡片迁移，保持原有逻辑）

[KH/Ca 折线图（暂不改动）]
```

**验收标准：**
- [ ] 设备运行参数卡正确渲染（Mock 数据）
- [ ] 调参按钮切换编辑态，钙反 input / 滴定行 input 均可交互
- [ ] 事件区左侧调参时间轴有竖线引导线和颜色圆点
- [ ] 事件区右侧正确显示原有近期操作记录内容
- [ ] 原独立操作记录卡片从 Dashboard 移除，不重复显示
- [ ] `npx tsc --noEmit` 无报错

**依赖：** DB-002（可并行开发，此阶段用 Mock 数据）

---

## FE-002 — 图表联动与 API 数据接入 ✅ DONE

**目标：** 打通前后端，在 KH/Ca 折线图上叠加调参竖线，hover 时 tooltip 展示调参详情。

**涉及文件：**
- `frontend/src/api/equipment.ts`（新建）
- `frontend/src/pages/Dashboard/index.tsx`（修改）

**图表方案（Recharts，原型已验证）：**
```tsx
// 调参竖线：只画虚线，无浮动标注
<ReferenceLine x={xKey} stroke={crColor | doseColor} strokeDasharray="4 3" strokeWidth={1.5} opacity={0.65} />

// 自定义 tooltip：普通数据 + 调参追加区
function HwTooltip({ active, payload, label }) {
  const anno = tuningMap[label]  // xKey → tuning_log 记录
  return anno ? (
    <div>...常规值... + <调参详情 device/param/from→to /></div>
  ) : <常规tooltip />
}

// 调参事件数据点放大
dot={(props) => isAnnotated ? <circle r={4.5} /> : <circle r={2.5} />}
```

**验收标准：**
- [ ] `GET /tanks/:id/equipment` 数据正确填充设备参数卡（替换 Mock）
- [ ] `PUT` 调参保存后，tuning-logs 刷新，图表竖线更新
- [ ] KH / Ca 图表在调参日期显示彩色虚线
- [ ] hover 调参竖线日期时，tooltip 追加调参详情（设备+参数+前后值）
- [ ] 调参日期数据点视觉放大（r=4.5）
- [ ] `npx tsc --noEmit` 无报错

**依赖：** FE-001（UI 骨架）+ DB-002（API）

---

## F1 — authStore + axios：token 单一真相来源 ✅ DONE

**目标：** 删除 `rm_token` 冗余写入，axios 改读 Zustand store，401 handler 改调 `logout()`。

**涉及文件：**
- `frontend/src/stores/authStore.ts`（修改）
- `frontend/src/api/client.ts`（修改）

**验收标准：**
- [ ] `setAuth` 不再写 `localStorage.setItem('rm_token', ...)`
- [ ] `logout` 不再写 `localStorage.removeItem('rm_token')`
- [ ] 请求拦截器改为 `useAuthStore.getState().token`
- [ ] 401 响应拦截器改为调 `useAuthStore.getState().logout()`
- [ ] DevTools localStorage 只剩 `reefmatrix-auth`，`rm_token` 消失
