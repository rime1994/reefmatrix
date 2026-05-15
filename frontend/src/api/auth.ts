import client from './client'
import type { User } from '@/types'

interface AuthResponse { user: User; token: string }

export const authApi = {
  login: (phone: string, password: string) =>
    client.post<AuthResponse>('/auth/login', { phone, password }).then(r => r.data),

  register: (phone: string, password: string, nickname: string) =>
    client.post<AuthResponse>('/auth/register', { phone, password, nickname }).then(r => r.data),

  getMe: () =>
    client.get<User>('/auth/me').then(r => r.data),

  changePassword: (oldPassword: string, newPassword: string) =>
    client.put('/auth/password', { old_password: oldPassword, new_password: newPassword }),
}
