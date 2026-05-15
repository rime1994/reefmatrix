// AppLayout.tsx 应用主框架：左侧导航 + 顶部用户信息栏 + 内容区域
// 在 iPad 竖屏时侧边栏自动收起（antd Sider breakpoint="lg"）
import { useEffect } from 'react'
import { Layout, Menu, Badge, Avatar, Dropdown } from 'antd'
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

const { Header, Sider, Content } = Layout

const NAV_ITEMS = [
  { key: '/dashboard',  icon: <DashboardOutlined />,  label: '水质看板' },
  { key: '/calculator', icon: <ExperimentOutlined />, label: '计算器' },
  { key: '/assets',     icon: <ShopOutlined />,       label: '资产追踪' },
  { key: '/reminders',  icon: <BellOutlined />,       label: '提醒' },
  { key: '/settings',   icon: <SettingOutlined />,    label: '设置' },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, token, setAuth } = useAuthStore()

  // 每次加载时刷新用户信息（确保 role 字段是最新的）
  const { data: freshUser } = useQuery({
    queryKey: ['me', user?.id],  // 按用户 ID 隔离缓存，防止不同用户共用缓存
    queryFn: authApi.getMe,
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
  useEffect(() => {
    if (freshUser && token) setAuth(freshUser, token)
  }, [freshUser])

  // 每分钟轮询一次到期提醒，在导航栏"提醒"上显示徽标数量
  const { data: dueReminders } = useQuery({
    queryKey: ['reminders', 'due'],
    queryFn: remindersApi.due,
    refetchInterval: 60_000,
  })

  const { logout } = useAuthStore()

  // 顶部用户下拉菜单
  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => { logout(); navigate('/login') },
    },
  ]

  // 管理员额外显示"管理后台"导航项
  const navItems = user?.role === 'admin'
    ? [...NAV_ITEMS, { key: '/admin', icon: <CrownOutlined />, label: '管理后台' }]
    : NAV_ITEMS

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 左侧导航栏：lg 以下断点自动折叠（iPad 竖屏友好） */}
      <Sider
        breakpoint="lg"
        collapsedWidth={0}
        style={{ background: '#fff', borderRight: '1px solid #f0f0f0' }}
      >
        <div style={{ padding: '16px 24px', fontWeight: 700, fontSize: 16, color: '#1677ff' }}>
          🪸 造礁矩阵
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={navItems.map(item => ({
            ...item,
            // 提醒菜单项上叠加到期数量角标
            label: item.key === '/reminders'
              ? <Badge count={dueReminders?.length} offset={[8, 0]}>{item.label}</Badge>
              : item.label,
          }))}
          onClick={({ key }) => navigate(key)}
          style={{ border: 'none' }}
        />
      </Sider>

      <Layout>
        {/* 顶部栏：右侧显示用户昵称，点击展开退出菜单 */}
        <Header style={{
          background: '#fff',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          borderBottom: '1px solid #f0f0f0',
        }}>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar icon={<UserOutlined />} size="small" />
              <span>{user?.nickname || user?.phone}</span>
            </div>
          </Dropdown>
        </Header>

        {/* 主内容区：<Outlet /> 渲染当前路由对应的页面组件 */}
        <Content style={{ padding: 24, background: '#f5f5f5', overflowY: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
