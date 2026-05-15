import client from './client'
import type { User, ApiKey } from '@/types'

export const adminApi = {
  // 用户管理
  listUsers: () =>
    client.get<User[]>('/admin/users').then(r => r.data),
  deleteUser: (id: string) =>
    client.delete(`/admin/users/${id}`),
  resetPassword: (id: string, newPassword: string) =>
    client.put(`/admin/users/${id}/password`, { new_password: newPassword }),

  // API 密钥管理
  listApiKeys: () =>
    client.get<ApiKey[]>('/admin/api-keys').then(r => r.data),
  createApiKey: (data: { name: string; provider: string; key_value: string }) =>
    client.post<ApiKey>('/admin/api-keys', data).then(r => r.data),
  deleteApiKey: (id: string) =>
    client.delete(`/admin/api-keys/${id}`),
  toggleApiKey: (id: string) =>
    client.put<ApiKey>(`/admin/api-keys/${id}/toggle`).then(r => r.data),

  testApiKey: (id: string) =>
    client.post<{ ok: boolean; message: string }>(`/admin/api-keys/${id}/test`).then(r => r.data),

  // 提示词配置
  getPromptConfig: () =>
    client.get<PromptConfig>('/admin/prompt-config').then(r => r.data),
  updatePromptConfig: (data: { system_message: string; instructions: string }) =>
    client.put<PromptConfig>('/admin/prompt-config', data).then(r => r.data),
}

export interface PromptConfig {
  id?: string
  system_message: string
  instructions: string
  updated_at?: string
}
