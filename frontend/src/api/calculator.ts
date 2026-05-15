import client from './client'
import type { DoseResult } from '@/types'

export const calculatorApi = {
  suggest: (tankId: string) =>
    client.get<DoseResult[]>(`/tanks/${tankId}/calculator/suggest`).then(r => r.data),

  calcDose: (payload: {
    tank_id: string
    additive_id: string
    current_value: number
    target_value: number
    volume_liters?: number
  }) => client.post<DoseResult>('/calculator/dose', payload).then(r => r.data),
}
