// App.tsx 是前端应用根组件，负责：
//   1. 注册 TanStack Query 客户端（全局数据请求缓存）
//   2. 配置 Ant Design 主题和中文语言包
//   3. 定义路由结构（公开路由 + 需要登录的私有路由）
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import AppLayout from '@/components/Layout/AppLayout'
import LoginPage from '@/pages/Login'
import DashboardPage from '@/pages/Dashboard'
import CalculatorPage from '@/pages/Calculator'
import AssetsPage from '@/pages/Assets'
import RemindersPage from '@/pages/Reminders'
import SettingsPage from '@/pages/Settings'
import AdminPage from '@/pages/Admin'
import { useAuthStore } from '@/stores/authStore'

// 设置 dayjs 全局中文语言，影响所有日期格式化
dayjs.locale('zh-cn')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,         // 请求失败后重试 1 次，避免网络抖动导致页面空白
      staleTime: 30_000, // 数据 30 秒内视为新鲜，避免切换页面时重复请求
    },
  },
})

// PrivateRoute 路由守卫：未登录时重定向到 /login
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuthStore()
  return isLoggedIn() ? <>{children}</> : <Navigate to="/login" replace />
}

// AdminRoute 管理员守卫：非管理员重定向到首页
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  return user?.role === 'admin' ? <>{children}</> : <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={zhCN}
        theme={{ token: { colorPrimary: '#1677ff', borderRadius: 8 } }}
      >
        {/* future flags 消除 React Router v6 升级警告 */}
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            {/* 公开路由 */}
            <Route path="/login" element={<LoginPage />} />

            {/* 私有路由：AppLayout 提供侧边栏导航，各页面通过 <Outlet /> 渲染 */}
            <Route path="/" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard"  element={<DashboardPage />} />
              <Route path="calculator" element={<CalculatorPage />} />
              <Route path="assets"     element={<AssetsPage />} />
              <Route path="reminders"  element={<RemindersPage />} />
              <Route path="settings"   element={<SettingsPage />} />
              <Route path="admin"     element={<AdminRoute><AdminPage /></AdminRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  )
}
