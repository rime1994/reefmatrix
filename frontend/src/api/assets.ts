import client from './client'
import type { Asset } from '@/types'

export const assetsApi = {
  list: (tankId: string, params?: { category?: string; status?: string }) =>
    client.get<Asset[]>(`/tanks/${tankId}/assets`, { params }).then(r => r.data),

  create: (tankId: string, data: Partial<Asset>) =>
    client.post<Asset>(`/tanks/${tankId}/assets`, data).then(r => r.data),

  update: (id: string, data: Partial<Asset>) =>
    client.put<Asset>(`/assets/${id}`, data).then(r => r.data),

  delete: (id: string) => client.delete(`/assets/${id}`),
}
