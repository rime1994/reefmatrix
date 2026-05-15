import client from './client'
import type { WaterParameter } from '@/types'

export const parametersApi = {
  list: (tankId: string, params?: { from?: string; to?: string }) =>
    client.get<WaterParameter[]>(`/tanks/${tankId}/parameters`, { params }).then(r => r.data),

  create: (tankId: string, data: Partial<WaterParameter>) =>
    client.post<WaterParameter>(`/tanks/${tankId}/parameters`, data).then(r => r.data),

  delete: (id: string) => client.delete(`/parameters/${id}`),
}
