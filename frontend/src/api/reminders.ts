import client from './client'
import type { Reminder } from '@/types'

export const remindersApi = {
  list: (params?: { tank_id?: string }) =>
    client.get<Reminder[]>('/reminders', { params }).then(r => r.data),

  due: () => client.get<Reminder[]>('/reminders/due').then(r => r.data),

  create: (data: Partial<Reminder>) =>
    client.post<Reminder>('/reminders', data).then(r => r.data),

  update: (id: string, data: Partial<Reminder>) =>
    client.put<Reminder>(`/reminders/${id}`, data).then(r => r.data),

  delete: (id: string) => client.delete(`/reminders/${id}`),
}
