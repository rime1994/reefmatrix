// Settings/index.tsx — 设置页（SET-001）
//
// Tab：
//   账号信息  — 昵称/用户名修改、邮箱(只读)、我的邀请码展示
//   偏好设置  — 主题/温度单位/盐度单位/时区
//   修改密码  — 旧密码 + 新密码 + 确认
//   已归档鱼缸 — 恢复 / 彻底删除（原有功能）
//   危险区域  — 注销账号
import { useState, useEffect } from 'react'
import {
  Card, Tabs, Form, Input, Button, Select, Space, Table, Tag, Popconfirm,
  Typography, Empty, message, Modal, Badge,
} from 'antd'
import {
  UserOutlined, SettingOutlined, LockOutlined, DatabaseOutlined,
  WarningOutlined, CopyOutlined, ReloadOutlined, DeleteOutlined, GiftOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { tanksApi } from '@/api/tanks'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'
import { TANK_TYPE_LABEL } from '@/types'
import type { Tank, TankType } from '@/types'
import { useNavigate } from 'react-router-dom'

const { Title, Text, Paragraph } = Typography

// ── 时区列表（常用）────────────────────────────────────────────────────────────
const TIMEZONES = [
  { value: 'Asia/Shanghai',    label: '中国标准时间 (UTC+8)' },
  { value: 'Asia/Hong_Kong',   label: '香港 (UTC+8)' },
  { value: 'Asia/Taipei',      label: '台北 (UTC+8)' },
  { value: 'Asia/Singapore',   label: '新加坡 (UTC+8)' },
  { value: 'Asia/Tokyo',       label: '日本 (UTC+9)' },
  { value: 'America/New_York', label: '纽约 (UTC-5/-4)' },
  { value: 'America/Los_Angeles', label: '洛杉矶 (UTC-8/-7)' },
  { value: 'Europe/London',    label: '伦敦 (UTC+0/+1)' },
  { value: 'UTC',              label: 'UTC' },
]

export default function SettingsPage() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>设置</Title>
      <Tabs
        items={[
          { key: 'account',     label: <><UserOutlined /> 账号信息</>,     children: <AccountTab /> },
          { key: 'preferences', label: <><SettingOutlined /> 偏好设置</>,  children: <PreferencesTab /> },
          { key: 'password',    label: <><LockOutlined /> 修改密码</>,     children: <PasswordTab /> },
          { key: 'archived',    label: <><DatabaseOutlined /> 已归档鱼缸</>, children: <ArchivedTab /> },
          { key: 'danger',      label: <><WarningOutlined /> 危险区域</>,  children: <DangerTab /> },
        ]}
      />
    </div>
  )
}

// ── 账号信息 Tab ──────────────────────────────────────────────────────────────
function AccountTab() {
  const qc = useQueryClient()
  const { user: storeUser, token, setAuth } = useAuthStore()
  const [form] = Form.useForm()

  const { data: user } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.getMe,
    staleTime: 10_000,
  })

  // 初始化表单
  useEffect(() => {
    if (user) {
      form.setFieldsValue({
        nickname: user.nickname,
        username: user.username ?? '',
      })
    }
  }, [user, form])

  const updateMutation = useMutation({
    mutationFn: (data: { nickname?: string; username?: string }) => authApi.updateProfile(data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['auth', 'me'] })
      // 同步 authStore 中的 user（保持 token 不变）
      if (storeUser && token) {
        setAuth({ ...storeUser, ...updated }, token)
      }
      message.success('资料已保存')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '保存失败'),
  })

  const currentUser = user ?? storeUser

  return (
    <div style={{ maxWidth: 480 }}>
      {/* 邀请码展示 */}
      {currentUser?.my_invite_code && (
        <Card
          style={{ marginBottom: 24, background: '#f0f9ff', border: '1px solid #bae6fd' }}
          bodyStyle={{ padding: '16px 20px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <GiftOutlined style={{ fontSize: 24, color: '#0ea5e9' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>我的专属邀请码</div>
              <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 800, letterSpacing: 3, color: '#0f172a' }}>
                {currentUser.my_invite_code}
              </div>
            </div>
            <Space direction="vertical" size={4}>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => {
                  navigator.clipboard.writeText(currentUser.my_invite_code!)
                  message.success('已复制')
                }}
              >
                复制
              </Button>
              <Button
                size="small"
                type="link"
                style={{ fontSize: 11, padding: 0 }}
                onClick={() => {
                  const text = `我在造礁矩阵管理我的海缸，用我的邀请码 ${currentUser.my_invite_code} 可免试注册`
                  navigator.clipboard.writeText(text)
                  message.success('分享文案已复制')
                }}
              >
                复制分享文案
              </Button>
            </Space>
          </div>
        </Card>
      )}

      <Form form={form} layout="vertical" onFinish={(v) => updateMutation.mutate(v)}>
        {/* 邮箱只读 */}
        <Form.Item label="邮箱">
          <Input
            value={currentUser?.email ?? '未绑定'}
            disabled
            suffix={<Badge status={currentUser?.email ? 'success' : 'default'} text={currentUser?.email ? '已验证' : '未绑定'} />}
          />
        </Form.Item>

        <Form.Item
          name="nickname"
          label="昵称"
          rules={[{ required: true, message: '昵称不能为空' }, { max: 30, message: '昵称不超过30字' }]}
        >
          <Input placeholder="你的显示名称" maxLength={30} />
        </Form.Item>

        <Form.Item
          name="username"
          label="用户名（可选）"
          extra="设置后可用用户名登录，只能包含字母、数字、下划线"
          rules={[
            { pattern: /^[A-Za-z0-9_]*$/, message: '只能包含字母、数字、下划线' },
            { max: 30, message: '用户名不超过30字' },
          ]}
        >
          <Input placeholder="例：reef_master（可留空）" maxLength={30} />
        </Form.Item>

        {/* 注册方式 */}
        {currentUser?.registration_path && (
          <Form.Item label="注册方式">
            <Tag color={currentUser.registration_path === 'invite' ? 'blue' : currentUser.registration_path === 'quiz' ? 'purple' : 'default'}>
              {currentUser.registration_path === 'invite' ? '🎟️ 邀请码' :
               currentUser.registration_path === 'quiz' ? '🧪 知识问答' :
               currentUser.registration_path === 'wechat' ? '💬 微信' : currentUser.registration_path}
            </Tag>
          </Form.Item>
        )}

        <Button type="primary" htmlType="submit" loading={updateMutation.isPending}>
          保存
        </Button>
      </Form>
    </div>
  )
}

// ── 偏好设置 Tab ──────────────────────────────────────────────────────────────
function PreferencesTab() {
  const qc = useQueryClient()
  const [form] = Form.useForm()

  const { data: user } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.getMe,
    staleTime: 10_000,
  })

  useEffect(() => {
    if (user) {
      form.setFieldsValue({
        timezone:     user.timezone || 'Asia/Shanghai',
        temp_unit:    user.temp_unit || 'celsius',
        salinity_unit: user.salinity_unit || 'sg',
        theme:        user.theme || 'light',
      })
    }
  }, [user, form])

  const updateMutation = useMutation({
    mutationFn: (data: {
      timezone?: string
      temp_unit?: string
      salinity_unit?: string
      theme?: string
    }) => authApi.updateProfile(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'me'] })
      message.success('偏好已保存')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '保存失败'),
  })

  return (
    <div style={{ maxWidth: 480 }}>
      <Form form={form} layout="vertical" onFinish={(v) => updateMutation.mutate(v)}>
        <Form.Item name="theme" label="界面主题">
          <Select options={[
            { value: 'light', label: '☀️ 浅色' },
            { value: 'dark',  label: '🌙 深色（开发中）' },
          ]} />
        </Form.Item>

        <Form.Item name="temp_unit" label="温度单位">
          <Select options={[
            { value: 'celsius',    label: '°C（摄氏度）' },
            { value: 'fahrenheit', label: '°F（华氏度）' },
          ]} />
        </Form.Item>

        <Form.Item name="salinity_unit" label="盐度单位">
          <Select options={[
            { value: 'sg',  label: 'SG（比重，如 1.025）' },
            { value: 'ppt', label: 'ppt（千分之几，如 33.5）' },
          ]} />
        </Form.Item>

        <Form.Item name="timezone" label="时区">
          <Select
            showSearch
            filterOption={(input, option) =>
              (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
            }
            options={TIMEZONES}
          />
        </Form.Item>

        <Button type="primary" htmlType="submit" loading={updateMutation.isPending}>
          保存偏好
        </Button>
      </Form>
    </div>
  )
}

// ── 修改密码 Tab ──────────────────────────────────────────────────────────────
function PasswordTab() {
  const [form] = Form.useForm()

  const changePwdMutation = useMutation({
    mutationFn: ({ old_password, new_password }: { old_password: string; new_password: string }) =>
      authApi.changePassword(old_password, new_password),
    onSuccess: () => { form.resetFields(); message.success('密码已修改') },
    onError: (err: any) => message.error(err.response?.data?.error ?? '修改失败'),
  })

  return (
    <div style={{ maxWidth: 400 }}>
      <Form
        form={form}
        layout="vertical"
        onFinish={(v) => changePwdMutation.mutate({ old_password: v.old_password, new_password: v.new_password })}
      >
        <Form.Item name="old_password" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          name="new_password"
          label="新密码"
          extra="至少 8 位，需同时包含字母和数字"
          rules={[
            { required: true, message: '请设置新密码' },
            { pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/, message: '至少 8 位，需同时包含字母和数字' },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="确认新密码"
          dependencies={['new_password']}
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('new_password') === value) return Promise.resolve()
                return Promise.reject('两次输入的密码不一致')
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={changePwdMutation.isPending}>
          修改密码
        </Button>
      </Form>
    </div>
  )
}

// ── 已归档鱼缸 Tab ────────────────────────────────────────────────────────────
function ArchivedTab() {
  const qc = useQueryClient()

  const { data: archivedTanks, isLoading } = useQuery({
    queryKey: ['tanks', 'archived'],
    queryFn: tanksApi.listArchived,
  })

  const restoreMutation = useMutation({
    mutationFn: (id: string) => tanksApi.restore(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tanks'] }); message.success('鱼缸已恢复') },
    onError: (err: any) => message.error(err.response?.data?.error ?? '操作失败'),
  })

  const purgeMutation = useMutation({
    mutationFn: (id: string) => tanksApi.purge(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tanks'] }); message.success('已彻底删除') },
    onError: (err: any) => message.error(err.response?.data?.error ?? '删除失败'),
  })

  const columns = [
    { title: '鱼缸名称', dataIndex: 'name', key: 'name' },
    {
      title: '缸型', dataIndex: 'tank_type', key: 'tank_type',
      render: (v: TankType) => <Tag>{TANK_TYPE_LABEL[v] ?? v}</Tag>,
    },
    {
      title: '净水量', dataIndex: 'volume_liters', key: 'volume',
      render: (v: number) => `${v} L`,
    },
    {
      title: '归档时间', dataIndex: 'updated_at', key: 'archived_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '操作', key: 'actions',
      render: (_: any, record: Tank) => (
        <Space>
          <Popconfirm
            title="恢复后该缸将重新出现在主界面"
            okText="恢复" cancelText="取消"
            onConfirm={() => restoreMutation.mutate(record.id)}
          >
            <Button icon={<ReloadOutlined />} size="small"
              loading={restoreMutation.isPending && restoreMutation.variables === record.id}>
              恢复
            </Button>
          </Popconfirm>
          <Popconfirm
            title={<span>彻底删除「{record.name}」？<br /><Text type="danger">所有水质记录和资产数据将永久丢失，无法恢复。</Text></span>}
            okText="确认删除" okButtonProps={{ danger: true }} cancelText="取消"
            onConfirm={() => purgeMutation.mutate(record.id)}
          >
            <Button danger icon={<DeleteOutlined />} size="small"
              loading={purgeMutation.isPending && purgeMutation.variables === record.id}>
              彻底删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        归档的鱼缸不再显示在主界面，但数据完整保留。可随时恢复，或彻底删除以释放空间。
      </Paragraph>
      {archivedTanks?.length === 0 ? (
        <Empty description="暂无已归档的鱼缸" />
      ) : (
        <Table
          dataSource={archivedTanks}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={false}
        />
      )}
    </div>
  )
}

// ── 危险区域 Tab ──────────────────────────────────────────────────────────────
function DangerTab() {
  const navigate = useNavigate()
  const { logout } = useAuthStore()
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const deleteMutation = useMutation({
    mutationFn: authApi.deleteAccount,
    onSuccess: () => {
      logout()
      message.success('账号已注销，感谢使用造礁矩阵')
      navigate('/', { replace: true })
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '注销失败，请重试'),
  })

  return (
    <div style={{ maxWidth: 560 }}>
      <Card
        style={{ border: '1px solid #fca5a5', background: '#fff7f7' }}
        title={<span style={{ color: '#dc2626' }}><WarningOutlined /> 注销账号</span>}
      >
        <Paragraph style={{ marginBottom: 16 }}>
          注销账号将<strong>永久删除</strong>你的所有数据，包括：
        </Paragraph>
        <ul style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>
          <li>所有鱼缸及水质记录</li>
          <li>所有资产（生物 / 设备）及历史记录</li>
          <li>所有提醒、添加剂配置</li>
          <li>账号信息及邀请关系</li>
        </ul>
        <Paragraph type="danger" style={{ fontWeight: 600, marginBottom: 20 }}>
          此操作不可撤销，请谨慎操作。
        </Paragraph>
        <Button
          danger
          icon={<WarningOutlined />}
          onClick={() => { setDeleteModalOpen(true); setConfirmText('') }}
        >
          申请注销账号
        </Button>
      </Card>

      <Modal
        title={<span style={{ color: '#dc2626' }}>⚠️ 确认注销账号</span>}
        open={deleteModalOpen}
        onCancel={() => setDeleteModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Paragraph style={{ marginBottom: 16 }}>
          这将<strong>永久删除你的所有数据</strong>，且无法恢复。<br />
          请输入 <code>注销账号</code> 以确认操作：
        </Paragraph>
        <Input
          placeholder="注销账号"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          style={{ marginBottom: 16 }}
        />
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={() => setDeleteModalOpen(false)}>取消</Button>
          <Button
            danger
            type="primary"
            disabled={confirmText !== '注销账号'}
            loading={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            确认注销
          </Button>
        </Space>
      </Modal>
    </div>
  )
}
