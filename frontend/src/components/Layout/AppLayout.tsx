// AppLayout.tsx — 顶部 pill 导航布局
//
// 结构：TopNav（sticky）+ Content + AppFooter
// TopNav 行为：
//   - 默认：白底 + 底部 1px 分隔线
//   - 滚动 > 20px：毛玻璃背景（rgba + blur）+ 轻阴影
//   - 活跃项：蓝色 pill 胶囊（background:#e0f2fe, border-radius:20px）
//   - 窄屏（< 640px）：导航文字隐藏，仅保留图标 + pill 背景
import { useEffect, useState } from 'react'
import { Layout, Badge, Avatar, Dropdown, Tooltip } from 'antd'
import {
  DashboardOutlined,
  ExperimentOutlined,
  ShopOutlined,
  BellOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  CrownOutlined,
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useQuery } from '@tanstack/react-query'
import { remindersApi } from '@/api/reminders'
import { authApi } from '@/api/auth'
import AppFooter from '@/components/Footer/AppFooter'

const { Content } = Layout

const NAV_ITEMS = [
  { key: '/dashboard',  icon: <DashboardOutlined />,  label: '水质看板' },
  { key: '/calculator', icon: <ExperimentOutlined />, label: '计算器' },
  { key: '/assets',     icon: <ShopOutlined />,       label: '资产追踪' },
  { key: '/reminders',  icon: <BellOutlined />,       label: '提醒' },
  { key: '/settings',   icon: <SettingOutlined />,    label: '设置' },
]

export default function AppLayout() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { user, token, setAuth, logout } = useAuthStore()

  // 滚动检测 → 毛玻璃效果
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // 窄屏检测 → 隐藏导航文字
  const [narrow, setNarrow] = useState(window.innerWidth < 640)
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 刷新用户信息（确保 role 最新）
  const { data: freshUser } = useQuery({
    queryKey: ['me', user?.id],
    queryFn: authApi.getMe,
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
  useEffect(() => {
    if (freshUser && token) setAuth(freshUser, token)
  }, [freshUser])

  // 提醒角标
  const { data: dueReminders } = useQuery({
    queryKey: ['reminders', 'due'],
    queryFn: remindersApi.due,
    refetchInterval: 60_000,
  })

  const navItems = user?.role === 'admin'
    ? [...NAV_ITEMS, { key: '/admin', icon: <CrownOutlined />, label: '管理后台' }]
    : NAV_ITEMS

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => { logout(); navigate('/login') },
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>

      {/* ── 顶部导航栏 ─────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        height: 56,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 4,
        transition: 'background 0.25s, box-shadow 0.25s',
        background: scrolled ? 'rgba(255,255,255,0.85)' : '#ffffff',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
        boxShadow: scrolled
          ? '0 2px 16px rgba(0,0,0,0.08)'
          : '0 1px 0 #f0f0f0',
      }}>

        {/* Logo */}
        <div style={{
          fontWeight: 700, fontSize: 15, color: '#0c4a6e',
          marginRight: 12, whiteSpace: 'nowrap', flexShrink: 0,
          letterSpacing: 0.3,
        }}>
          🪸 {!narrow && <span>造礁矩阵</span>}
        </div>

        {/* 导航 pills */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
          {navItems.map(item => {
            const isActive = location.pathname === item.key
            const isDue    = item.key === '/reminders' && !!dueReminders?.length
            const icon = isDue
              ? <Badge count={dueReminders!.length} size="small">{item.icon}</Badge>
              : item.icon

            return (
              <Tooltip key={item.key} title={narrow ? item.label : ''} placement="bottom">
                <button
                  onClick={() => navigate(item.key)}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f1f5f9' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: narrow ? 0 : 6,
                    padding: narrow ? '7px 10px' : '6px 14px',
                    border: 'none', borderRadius: 20, cursor: 'pointer',
                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#0369a1' : '#64748b',
                    background: isActive ? '#e0f2fe' : 'transparent',
                    transition: 'background 0.15s, color 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ fontSize: 15, lineHeight: 1, display: 'flex' }}>{icon}</span>
                  {!narrow && <span>{item.label}</span>}
                </button>
              </Tooltip>
            )
          })}
        </nav>

        {/* 用户区 */}
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <div style={{
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            gap: 7, flexShrink: 0, padding: '4px 8px',
            borderRadius: 20, transition: 'background 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Avatar
              icon={<UserOutlined />} size={26}
              style={{ background: '#bae6fd', color: '#0369a1', flexShrink: 0 }}
            />
            {!narrow && (
              <span style={{ fontSize: 13, color: '#475569', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.nickname || user?.phone}
              </span>
            )}
          </div>
        </Dropdown>
      </header>

      {/* ── 主内容区 ────────────────────────────────────────────────────────── */}
      <Content style={{ padding: narrow ? 12 : 24, background: '#f5f5f5' }}>
        <Outlet />
      </Content>

      {/* ── 全局页脚 ────────────────────────────────────────────────────────── */}
      <AppFooter />

    </Layout>
  )
}
