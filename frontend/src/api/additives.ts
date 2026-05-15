import client from './client'
import type { Additive } from '@/types'

export const additivesApi = {
  list: () => client.get<Additive[]>('/additives').then(r => r.data),

  create: (data: Partial<Additive>) =>
    client.post<Additive>('/additives', data).then(r => r.data),

  update: (id: string, data: Partial<Additive>) =>
    client.put<Additive>(`/additives/${id}`, data).then(r => r.data),

  delete: (id: string) => client.delete(`/additives/${id}`),
}
