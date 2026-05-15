// authStore.ts 使用 Zustand 管理登录态，并通过 persist 中间件持久化到 localStorage
// 页面刷新后自动恢复登录状态，无需重新登录
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  token: string | null
  // 登录/注册成功后调用，同时更新 store 和 localStorage 中的 token
  setAuth: (user: User, token: string) => void
  // 退出登录，清除所有认证状态
  logout: () => void
  // 判断当前是否已登录（用于路由守卫）
  isLoggedIn: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        // localStorage 中的 rm_token 同时供 axios 拦截器读取
        localStorage.setItem('rm_token', token)
        set({ user, token })
      },
      logout: () => {
        localStorage.removeItem('rm_token')
        set({ user: null, token: null })
      },
      isLoggedIn: () => !!get().token,
    }),
    {
      name: 'reefmatrix-auth',
      // 只持久化 user 和 token，避免持久化函数导致序列化错误
      partialize: (s) => ({ user: s.user, token: s.token }),
    }
  )
)
