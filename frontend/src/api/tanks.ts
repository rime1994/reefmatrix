import client from './client'
import type { Tank } from '@/types'

export const tanksApi = {
  list:           ()                          => client.get<Tank[]>('/tanks').then(r => r.data),
  listArchived:   ()                          => client.get<Tank[]>('/tanks/archived').then(r => r.data),
  get:            (id: string)                => client.get<Tank>(`/tanks/${id}`).then(r => r.data),
  create:         (data: Partial<Tank>)       => client.post<Tank>('/tanks', data).then(r => r.data),
  update:         (id: string, data: Partial<Tank>) => client.put<Tank>(`/tanks/${id}`, data).then(r => r.data),
  archive:        (id: string)                => client.delete(`/tanks/${id}`),
  restore:        (id: string)                => client.put<Tank>(`/tanks/${id}/restore`),
  purge:          (id: string)                => client.delete(`/tanks/${id}/purge`),
}
