// api/client.ts 封装 axios 实例，统一处理认证 token 注入和 401 跳转
// token 单一真相来源：从 Zustand authStore 读取，不再直接操作 localStorage
import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'

const client = axios.create({
  baseURL: '/api',   // vite.config.ts 中已配置 dev server proxy → http://localhost:8080
  timeout: 90000, // AI 分析接口需要较长时间，设为 90s
})

// 请求拦截器：从 Zustand store 读取 JWT token 并注入 Authorization 头
// getState() 在拦截器（非 React 组件）中安全调用，localStorage persist 为同步，刷新后立即可用
client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 响应拦截器：token 过期或失效时（401）调用 store.logout() 清除全部认证状态并跳转
// 修复原有 bug：原代码只删 rm_token，Zustand state 中的 token 未被清除
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client
