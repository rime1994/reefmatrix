import client from './client'
import type { User, ApiKey, ReefQuestion } from '@/types'

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

  // 题库管理（ADM-001）
  listQuestions: () =>
    client.get<ReefQuestion[]>('/admin/questions').then(r => r.data),
  createQuestion: (data: Omit<ReefQuestion, 'id' | 'created_at' | 'updated_at'>) =>
    client.post<ReefQuestion>('/admin/questions', data).then(r => r.data),
  updateQuestion: (id: string, data: Partial<Omit<ReefQuestion, 'id' | 'created_at' | 'updated_at'>>) =>
    client.put<ReefQuestion>(`/admin/questions/${id}`, data).then(r => r.data),
  deleteQuestion: (id: string) =>
    client.delete(`/admin/questions/${id}`),

  // 邀请关系（ADM-001）
  listInviteRelations: () =>
    client.get<User[]>('/admin/invite-relations').then(r => r.data),
}

export interface PromptConfig {
  id?: string
  system_message: string
  instructions: string
  updated_at?: string
}
