# HardwareParametersTracking — 架构原型笔记

> 原型位于：`HardwareParamsProto.tsx`（throwaway）
> 访问路径：`/dashboard/hardware-proto?variant=A|B|C`（默认 B）
> 问题：硬件运行参数追踪模块——数据库怎么设计、放在 Dashboard 哪里、图表能否联动？

---

## 1. 数据库 Schema 选型

### 结论：独立关系表（3 张表）✅

| 方案 | 结论 |
|------|------|
| EAV | ❌ 类型丢失，查询复杂 |
| JSONB | ❌ 历史需额外表，子字段不可索引 |
| **独立关系表** | ✅ 类型安全，历史天然分离，索引清晰 |

```sql
-- 当前状态（每缸每设备只有 1 行，UPSERT 更新）
CREATE TABLE calcium_reactor_states (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_id     UUID NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  flow_rate   NUMERIC(6,2),   -- ml/min
  target_ph   NUMERIC(4,2),
  outlet_kh   NUMERIC(5,1),   -- dKH
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tank_id)
);

CREATE TABLE dosing_pump_channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_id     UUID NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  channel     VARCHAR(64) NOT NULL,   -- "Ca补充", "Alk补充", "Mg补充"
  daily_dose  NUMERIC(7,2) NOT NULL,  -- ml/day 或 g/day
  dose_unit   VARCHAR(16) NOT NULL DEFAULT 'ml/day',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tank_id, channel)
);

-- 历史变更日志（不可变，INSERT ONLY）
CREATE TABLE hw_param_changes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_id     UUID NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  device_type VARCHAR(32) NOT NULL,   -- 'calcium_reactor' | 'dosing_pump'
  param_name  VARCHAR(64) NOT NULL,
  old_value   TEXT,
  new_value   TEXT NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON hw_param_changes(tank_id, changed_at DESC);
```

**设计要点：**
- "当前状态"与"历史记录"分离：前者支持快速读取，后者只追加不修改
- UPSERT 语义：每次调参用 `ON CONFLICT(tank_id) DO UPDATE` 更新状态表，同时 INSERT 一条变更日志
- `hw_param_changes.changed_at` 与 `water_parameters.recorded_at` 共用时间轴，可在前端联动

---

## 2. Dashboard UI 布局方向

### 选定方向：变体 B（图表注释联动）

经原型反馈第二轮优化，变体 B 最终形态：

#### 布局结构

```
[水质快览 8 列卡片]

[硬件参数卡（单卡）]
  ┌─────────────────────────────────────────────────┐
  │  设备运行参数                      [调参] [保存] │
  │                                                 │
  │  🟡 钙反              │  🔵 滴定泵              │
  │  出水流速: 35 ml/min  │  Ca 补充  ████── 50ml  │
  │  目标 pH : 6.6        │  Alk 补充 ███─── 35ml  │
  │  出水 KH : 48 dKH     │  Mg 补充  ██──── 20ml  │
  │                       │                         │
  │  ── 调参记录 ──────────────────────────────────  │
  │  05-22  [钙反] 出水流速  15 ml/min → 35 ml/min │
  │  05-19  [钙反] 目标 pH   6.5 → 6.6             │
  │  05-15  [滴定] Ca 通道   40 ml/day → 50 ml/day │
  │  05-10  [钙反] 出水 KH   42 dKH → 48 dKH      │
  └─────────────────────────────────────────────────┘

[KH 折线图]   [Ca 折线图]
  调参虚线↑     调参虚线↑
  hover tooltip 显示调参详情
```

#### 硬件参数卡设计要点

1. **单卡合并**：设备运行参数 + 调参时间轴在同一张卡内，避免碎片化
2. **顶部编辑按钮**：`[调参]` 按钮触发全卡编辑态，钙反参数变为 input，滴定通道数值可修改；点击`[保存]`退出编辑态（保存时写 UPSERT + 追加日志，原型中只更新本地 state）
3. **内联时间轴**：调参记录用竖线 + 圆点时间轴样式，嵌在卡片底部，不单独占一张卡

#### 折线图标注实现

- **只画虚线，不贴 SVG label**（避免标注密集时图表混乱）
- 调参事件竖线颜色：钙反 → 琥珀色（`#f59e0b`），滴定 → 蓝色（`#0ea5e9`）
- **hover tooltip 增强**：自定义 `<ReTooltip content={<HwTooltip />} />`，当鼠标悬停在有调参事件的 x 位置时，tooltip 底部追加调参详情区域
- 调参事件对应的数据点用更大的圆点标注（r=4.5 vs 普通 r=2.5），提示用户"这里有事件"

#### 技术可行性（Recharts）✅

```tsx
// 折线图中的竖线（无 label）
{HW_HISTORY.map((h, i) => (
  <ReferenceLine
    key={i}
    x={h.xKey}                                      // 匹配 XAxis dataKey 格式 "MM-DD"
    stroke={h.device === '钙反' ? '#f59e0b' : '#0ea5e9'}
    strokeDasharray="4 3"
    strokeWidth={1.5}
    opacity={0.65}
  />
))}

// 增强 tooltip：普通值 + 调参事件（若有）
function HwTooltip({ active, payload, label }) {
  const anno = ANNO_MAP[label]  // ANNO_MAP: xKey → hw_param_changes 记录
  return (
    <div>
      {/* 常规参数值 */}
      {payload.map(p => <div>{p.name}: {p.value}</div>)}
      {/* 调参追加区 */}
      {anno && (
        <div style={{ borderTop: '...', background: anno.device === '钙反' ? '#fffbeb' : '#eff6ff' }}>
          {anno.device} 调参：{anno.param} {anno.from} → {anno.to}{anno.unit}
        </div>
      )}
    </div>
  )
}
```

---

## 3. 待决策

- [ ] **方案确认**：以变体 B 为正式实现方向？
- [ ] **移动端降级**：调参卡两列布局在手机上如何处理（上下堆叠？）
- [ ] **调参触发时机**：用户点「保存」立即写入，还是要输入原因（`change_reason` 字段）？
- [ ] **历史条数**：时间轴默认显示最近几条？是否要分页？

---

*选型确认后：删除 `HardwareParamsProto.tsx` + App.tsx 中的路由，按 `HWPARAM-001` issue 正式实现。*
