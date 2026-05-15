// Login/index.tsx 登录/注册页面
// 使用 Tab 切换两种模式，登录成功后跳转到仪表盘
import { useState } from 'react'
import { Card, Form, Input, Button, Tabs, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'login' | 'register'>('login')

  const onFinish = async (values: { phone: string; password: string; nickname?: string }) => {
    setLoading(true)
    try {
      const res = tab === 'login'
        ? await authApi.login(values.phone, values.password)
        : await authApi.register(values.phone, values.password, values.nickname ?? '')
      // 将 user 信息和 token 存入 store（同时写入 localStorage）
      setAuth(res.user, res.token)
      navigate('/dashboard')
    } catch (err: any) {
      message.error(err.response?.data?.error ?? '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 100%)', // 海水渐变背景
    }}>
      <Card style={{ width: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32 }}>🪸</div>
          <div style={{ fontWeight: 700, fontSize: 20, color: '#1677ff' }}>造礁矩阵</div>
          <div style={{ color: '#8c8c8c', fontSize: 13 }}>ReefMatrix</div>
        </div>

        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as typeof tab)}
          items={[
            { key: 'login', label: '登录' },
            { key: 'register', label: '注册' },
          ]}
        />

        <Form layout="vertical" onFinish={onFinish} size="large">
          <Form.Item name="phone" label="手机号 / 账号" rules={[{ required: true, message: '请输入手机号或账号' }]}>
            <Input placeholder="手机号 或 admin" />
          </Form.Item>

          {/* 注册时额外显示昵称字段 */}
          {tab === 'register' && (
            <Form.Item name="nickname" label="昵称">
              <Input placeholder="我的珊瑚缸" />
            </Form.Item>
          )}

          <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: '至少6位' }]}>
            <Input.Password placeholder="至少6位" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              {tab === 'login' ? '登录' : '注册'}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
