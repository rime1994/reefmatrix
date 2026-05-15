import client from './client'
import type { Asset, EquipmentLog, BioMeasurement } from '@/types'

export const assetsApi = {
  list: (tankId: string, params?: { category?: string; status?: string }) =>
    client.get<Asset[]>(`/tanks/${tankId}/assets`, { params }).then(r => r.data),

  create: (tankId: string, data: Partial<Asset>) =>
    client.post<Asset>(`/tanks/${tankId}/assets`, data).then(r => r.data),

  update: (id: string, data: Partial<Asset>) =>
    client.put<Asset>(`/assets/${id}`, data).then(r => r.data),

  delete: (id: string) => client.delete(`/assets/${id}`),
}

export const equipmentLogsApi = {
  list: (assetId: string) =>
    client.get<EquipmentLog[]>(`/assets/${assetId}/equipment-logs`).then(r => r.data),

  create: (assetId: string, data: { recorded_at?: string; params: Record<string, unknown>; notes?: string }) =>
    client.post<EquipmentLog>(`/assets/${assetId}/equipment-logs`, data).then(r => r.data),

  delete: (id: string) => client.delete(`/equipment-logs/${id}`),
}

export const bioMeasurementsApi = {
  list: (assetId: string) =>
    client.get<BioMeasurement[]>(`/assets/${assetId}/bio-measurements`).then(r => r.data),

  create: (assetId: string, data: { recorded_at?: string; size_cm?: number; growth_points?: number; notes?: string }) =>
    client.post<BioMeasurement>(`/assets/${assetId}/bio-measurements`, data).then(r => r.data),

  delete: (id: string) => client.delete(`/bio-measurements/${id}`),
}
