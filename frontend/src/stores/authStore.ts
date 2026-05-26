// authStore.ts 使用 Zustand 管理登录态，并通过 persist 中间件持久化到 localStorage
// 页面刷新后自动恢复登录状态，无需重新登录
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  token: string | null
  // 登录/注册成功后调用，更新 store（persist 中间件自动同步到 localStorage）
  setAuth: (user: User, token: string) => void
  // 退出登录，清除所有认证状态（persist 中间件自动清除 localStorage）
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
        // 持久化由 persist 中间件统一负责（key: reefmatrix-auth），不再手动写 rm_token
        set({ user, token })
      },
      logout: () => {
        // persist 中间件会自动将 null 状态同步到 localStorage，无需手动 removeItem
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
