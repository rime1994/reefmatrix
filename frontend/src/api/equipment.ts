// api/equipment.ts — 设备运行参数 API（DB-002 对应端点）
import client from './client'

// ── 响应类型 ──────────────────────────────────────────────────────────────────

export interface CalciumReactorState {
  id?: string
  tank_id?: string
  flow_rate: number | null
  target_ph: number | null
  outlet_kh: number | null
  updated_at?: string
}

export interface DosingPumpChannel {
  id?: string
  tank_id?: string
  channel_name: string
  dose_g_per_time: number   // g/次
  times_per_day: number     // 次/day
  daily_dose_g: number      // g/day = dose_g_per_time × times_per_day
  updated_at?: string
}

export interface EquipmentResponse {
  calcium_reactor: CalciumReactorState | null
  dosing_channels: DosingPumpChannel[]
}

export interface EquipmentTuningLog {
  id: string
  tank_id: string
  /** equipment = 本次调参汇总（新格式），calcium_reactor/dosing_pump = 旧格式兼容 */
  device_type: 'calcium_reactor' | 'dosing_pump' | 'equipment'
  param_name: string
  old_value: string | null
  new_value: string
  changed_at: string
}

export interface TuningLogsResponse {
  logs: EquipmentTuningLog[]
}

// ── 请求类型 ──────────────────────────────────────────────────────────────────

export interface UpdateEquipmentInput {
  calcium_reactor?: {
    flow_rate?: number | null
    target_ph?: number | null
    outlet_kh?: number | null
  }
  dosing_channels?: {
    channel_name: string
    dose_g_per_time: number
    times_per_day: number
  }[]
}

// ── API 方法 ──────────────────────────────────────────────────────────────────

export const equipmentApi = {
  /** 获取鱼缸设备当前运行参数（钙反 + 所有滴定通道） */
  getEquipment: (tankId: string) =>
    client.get<EquipmentResponse>(`/tanks/${tankId}/equipment`).then(r => r.data),

  /** 调参：UPSERT 钙反/滴定状态，自动写入调参日志 */
  updateEquipment: (tankId: string, input: UpdateEquipmentInput) =>
    client.put<EquipmentResponse>(`/tanks/${tankId}/equipment`, input).then(r => r.data),

  /** 获取调参历史日志，按 changed_at 倒序 */
  getTuningLogs: (tankId: string, limit = 200) =>
    client.get<TuningLogsResponse>(`/tanks/${tankId}/equipment/tuning-logs`, {
      params: { limit },
    }).then(r => r.data),

  /** 删除指定调参日志 */
  deleteTuningLog: (tankId: string, logId: string) =>
    client.delete(`/tanks/${tankId}/equipment/tuning-logs/${logId}`),
}
