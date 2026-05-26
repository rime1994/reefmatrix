// App.tsx — 路由结构（v2：双引擎注册策略）
//
// 路由守卫：
//   PublicOnlyRoute — 已登录则跳 /dashboard（适用 /、/login、/register）
//   PrivateRoute    — 未登录则跳 /login?from=路径
//   AdminRoute      — 非 admin 角色跳 /dashboard
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import AppLayout from '@/components/Layout/AppLayout'
import LandingPage  from '@/pages/Landing'
import LoginPage    from '@/pages/Login'
import RegisterPage from '@/pages/Register'
import DashboardPage  from '@/pages/Dashboard'
import CalculatorPage from '@/pages/Calculator'
import AssetsPage     from '@/pages/Assets'
import RemindersPage  from '@/pages/Reminders'
import SettingsPage   from '@/pages/Settings'
import AdminPage      from '@/pages/Admin'
import { useAuthStore } from '@/stores/authStore'

dayjs.locale('zh-cn')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

/** PublicOnlyRoute：已登录用户访问时自动跳走，避免重复登录 */
function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuthStore()
  return isLoggedIn() ? <Navigate to="/dashboard" replace /> : <>{children}</>
}

/** PrivateRoute：携带 returnUrl，登录后回到原页面 */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuthStore()
  const location = useLocation()
  if (isLoggedIn()) return <>{children}</>
  return <Navigate to={`/login?from=${encodeURIComponent(location.pathname)}`} replace />
}

/** AdminRoute：仅 admin 角色可访问 */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  return user?.role === 'admin' ? <>{children}</> : <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={zhCN}
        theme={{ token: { colorPrimary: '#0ea5e9', borderRadius: 8 } }}
      >
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            {/* ── 公开专用路由（已登录自动跳走）── */}
            <Route path="/" element={<PublicOnlyRoute><LandingPage /></PublicOnlyRoute>} />
            <Route path="/login"    element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
            <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />

            {/* ── 私有路由：AppLayout 提供侧边栏导航 ── */}
            <Route path="/" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
              <Route path="dashboard"  element={<DashboardPage />} />
              {/* ⚠️ PROTOTYPE — 删除时机：方案选型确认后 */}
              <Route path="calculator" element={<CalculatorPage />} />
              <Route path="assets"     element={<AssetsPage />} />
              <Route path="reminders"  element={<RemindersPage />} />
              <Route path="settings"   element={<SettingsPage />} />
              <Route path="admin"      element={<AdminRoute><AdminPage /></AdminRoute>} />
            </Route>

            {/* 兜底 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  )
}
