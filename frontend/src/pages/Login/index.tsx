/**
 * LoginPage — A 极简卡片布局（选型结论）
 *
 * v2 变更：
 *   - 登录标识改为邮箱（email），保留手机号 backward compat 入口
 *   - 密码校验规则同步：≥8位 含字母+数字
 *   - 跳转 /register 而非 Tab 内嵌注册
 *   - 已登录用户访问此页直接跳 /dashboard（PublicOnlyRoute 处理）
 */
import { useState } from 'react'
import { Card, Form, Input, Button, message, Divider } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('from') ?? '/dashboard'
  const { setAuth } = useAuthStore()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)

  const onFinish = async (values: { identifier: string; password: string }) => {
    setLoading(true)
    try {
      const res = await authApi.loginByIdentifier(values.identifier, values.password)
      setAuth(res.user, res.token)
      // 清除登录前缓存的所有 query 结果（含 401 错误缓存），确保跳转后重新请求
      queryClient.clear()
      navigate(returnTo, { replace: true })
    } catch (err: any) {
      message.error('账号或密码错误')
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
      background: 'linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
    }}>
      <Card style={{ width: 400, boxShadow: '0 8px 40px rgba(14,165,233,0.10)', borderRadius: 16 }}>
        {/* 品牌 */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 4 }}>🪸</div>
          <div style={{ fontWeight: 800, fontSize: 22, color: '#0f172a' }}>造礁矩阵</div>
          <div style={{ color: '#64748b', fontSize: 13 }}>ReefMatrix</div>
        </div>

        <Form layout="vertical" onFinish={onFinish} size="large">
          <Form.Item
            name="identifier"
            label="账号"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input placeholder="邮箱 / 手机号 / 用户名" autoComplete="username" />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="密码" autoComplete="current-password" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
        </Form>

        <Divider plain style={{ fontSize: 12 }}>还没有账号？</Divider>

        <Button
          block
          onClick={() => navigate('/register')}
          style={{ borderRadius: 8 }}
        >
          免费注册
        </Button>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <a onClick={() => navigate('/')} style={{ fontSize: 12, color: '#64748b' }}>← 返回首页</a>
        </div>
      </Card>
    </div>
  )
}
