// types/index.ts 全项目共享的 TypeScript 类型，与后端 models 包字段保持一致

// ── 用户 ──────────────────────────────────────────────────────────────────────
export interface User {
  id: string
  phone: string
  nickname: string
  avatar_url?: string
  role: 'user' | 'admin'
  created_at: string
}

export interface ApiKey {
  id: string
  name: string
  provider: string
  key_masked: string
  is_active: boolean
  created_by?: string
  created_at: string
}

// ── 鱼缸 ──────────────────────────────────────────────────────────────────────
export type TankType = 'sps' | 'lps' | 'nps'

export const TANK_TYPE_LABEL: Record<TankType, string> = {
  sps: 'SPS（小水螅体）',
  lps: 'LPS（大水螅体）',
  nps: 'NPS（无光合）',
}

export interface Tank {
  id: string
  user_id: string
  name: string
  tank_type: TankType
  volume_liters: number
  setup_date?: string
  description?: string
  status: 'active' | 'archived'
  created_at: string
  updated_at: string
  latest_parameters?: WaterParameter
  asset_summary?: { total_items: number; total_value: number }
}

// ── 水质记录 ──────────────────────────────────────────────────────────────────
export interface WaterParameter {
  id: string
  tank_id: string
  recorded_at: string
  salinity?: number    // 比重 SG，如 1.025
  temperature?: number // 水温 °C
  ph?: number          // 酸碱度
  kh?: number          // 碱度 dKH
  ca?: number          // 钙离子 ppm
  mg?: number          // 镁离子 ppm
  no3?: number         // 硝酸盐 ppm
  po4?: number         // 磷酸盐 ppm
  notes?: string
  created_at: string
}

// 参数键名，顺序影响卡片和表格展示顺序
export type ParameterKey = 'salinity' | 'temperature' | 'ph' | 'kh' | 'ca' | 'mg' | 'no3' | 'po4'

// 每个参数的展示配置
export const PARAMETER_META: Record<ParameterKey, { label: string; unit: string; color: string; step: number }> = {
  salinity:    { label: '比重',  unit: 'SG',   color: '#1677ff', step: 0.001  },
  temperature: { label: '温度',  unit: '°C',   color: '#ff7a45', step: 0.1    },
  ph:          { label: 'pH',   unit: '',     color: '#13c2c2', step: 0.01   },
  kh:          { label: 'KH',   unit: 'dKH',  color: '#52c41a', step: 0.1    },
  ca:          { label: 'Ca',   unit: 'ppm',  color: '#722ed1', step: 1      },
  mg:          { label: 'Mg',   unit: 'ppm',  color: '#eb2f96', step: 1      },
  no3:         { label: 'NO₃',  unit: 'ppm',  color: '#fa8c16', step: 0.1    },
  po4:         { label: 'PO₄',  unit: 'ppm',  color: '#f5222d', step: 0.001  },
}

// 各缸型的水质安全区间，与后端 models.TankTypeRanges 保持一致
export const TANK_TYPE_RANGES: Record<TankType, Record<ParameterKey, [number, number]>> = {
  sps: {
    salinity:    [1.025, 1.026],
    temperature: [25.5,  26.5],
    ph:          [8.2,   8.4],
    kh:          [7.5,   8.5],
    ca:          [420,   440],
    mg:          [1350,  1400],
    no3:         [1.0,   5.0],
    po4:         [0.02,  0.05],
  },
  lps: {
    salinity:    [1.025, 1.026],
    temperature: [25.0,  26.5],
    ph:          [8.0,   8.3],
    kh:          [8.0,   9.5],
    ca:          [400,   450],
    mg:          [1300,  1400],
    no3:         [5.0,   15.0],
    po4:         [0.05,  0.15],
  },
  nps: {
    salinity:    [1.025, 1.026],
    temperature: [23.0,  25.0],
    ph:          [7.9,   8.2],
    kh:          [7.5,   9.0],
    ca:          [400,   450],
    mg:          [1300,  1400],
    no3:         [10.0,  30.0],
    po4:         [0.10,  0.50],
  },
}

// ── 添加剂 ────────────────────────────────────────────────────────────────────
export type AdditiveElement = 'kh' | 'ca' | 'mg' | 'no3' | 'po4' | 'other'

export interface Additive {
  id: string
  user_id: string
  name: string
  brand?: string
  element: AdditiveElement
  dose_per_unit: number
  dose_unit: 'ml' | 'g'
  concentration?: number
  notes?: string
  is_active: boolean
}

// ── 计算器结果 ────────────────────────────────────────────────────────────────
export interface DoseResult {
  additive_id: string
  additive_name: string
  element: string
  dose_unit: string
  required_dose: number
  delta: number
  target_value: number
  volume_liters: number
}

// ── 资产 ──────────────────────────────────────────────────────────────────────
export type AssetCategory = 'fish' | 'coral' | 'invertebrate' | 'equipment' | 'other'
export type AssetStatus = 'healthy' | 'sick' | 'sold' | 'dead' | 'transferred'

export interface Asset {
  id: string
  tank_id: string
  category: AssetCategory
  name: string
  species?: string
  quantity: number
  purchase_price?: number
  current_value?: number
  purchase_date?: string
  status: AssetStatus
  notes?: string
  image_url?: string
  created_at: string
  updated_at: string
}

// ── 提醒 ──────────────────────────────────────────────────────────────────────
export interface Reminder {
  id: string
  user_id: string
  tank_id?: string
  title: string
  description?: string
  is_recurring: boolean
  cron_expr?: string
  remind_at?: string
  next_remind_at?: string
  is_active: boolean
  tank?: Tank
}
