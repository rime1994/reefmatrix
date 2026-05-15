// api/client.ts 封装 axios 实例，统一处理认证 token 注入和 401 跳转
import axios from 'axios'

const client = axios.create({
  baseURL: '/api',   // vite.config.ts 中已配置 dev server proxy → http://localhost:8080
  timeout: 10000,
})

// 请求拦截器：从 localStorage 读取 JWT token 并注入 Authorization 头
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('rm_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 响应拦截器：token 过期或失效时（401）自动清除登录态并跳转到登录页
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('rm_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client
