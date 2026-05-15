// Admin/index.tsx 管理后台：用户管理 + API 密钥管理 + AI 提示词配置
import { useState, useEffect } from 'react'
import {
  Card, Tabs, Table, Button, Tag, Space, Popconfirm, Modal, Form,
  Input, Select, message, Typography, Badge,
} from 'antd'
import {
  DeleteOutlined, KeyOutlined, UserOutlined, ReloadOutlined, RobotOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { adminApi } from '@/api/admin'
import { useAuthStore } from '@/stores/authStore'
import type { User, ApiKey } from '@/types'

const { Text } = Typography

export default function AdminPage() {
  return (
    <div>
      <div style={{ marginBottom: 24, fontSize: 18, fontWeight: 700 }}>管理后台</div>
      <Tabs
        items={[
          { key: 'users',   label: <><UserOutlined /> 用户管理</>,   children: <UsersTab /> },
          { key: 'apikeys', label: <><KeyOutlined />  API 密钥</>,   children: <ApiKeysTab /> },
          { key: 'prompt',  label: <><RobotOutlined /> AI 提示词</>, children: <PromptTab /> },
        ]}
      />
    </div>
  )
}

// ── 用户管理 Tab ──────────────────────────────────────────────────────────────
function UsersTab() {
  const qc = useQueryClient()
  const { user: self } = useAuthStore()
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [resetForm] = Form.useForm()

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: adminApi.listUsers,
  })

  const deleteMutation = useMutation({
    mutationFn: adminApi.deleteUser,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); message.success('用户已删除') },
    onError: (err: any) => message.error(err.response?.data?.error ?? '删除失败'),
  })

  const resetMutation = useMutation({
    mutationFn: ({ id, pwd }: { id: string; pwd: string }) => adminApi.resetPassword(id, pwd),
    onSuccess: () => { setResetTarget(null); resetForm.resetFields(); message.success('密码已重置') },
    onError: (err: any) => message.error(err.response?.data?.error ?? '重置失败'),
  })

  const columns = [
    {
      title: '手机号 / 账号',
      dataIndex: 'phone',
      key: 'phone',
      render: (v: string, r: User) => (
        <Space>
          <span>{v}</span>
          {r.id === self?.id && <Tag color="blue">当前账号</Tag>}
        </Space>
      ),
    },
    { title: '昵称', dataIndex: 'nickname', key: 'nickname' },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (v: string) => v === 'admin'
        ? <Tag color="gold">管理员</Tag>
        : <Tag>普通用户</Tag>,
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: User) => (
        <Space>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => setResetTarget(record)}
          >
            重置密码
          </Button>
          <Popconfirm
            title={`确认删除用户「${record.nickname || record.phone}」？`}
            description="该用户的所有数据将被保留，仅删除账号。"
            okText="删除" okButtonProps={{ danger: true }}
            cancelText="取消"
            disabled={record.id === self?.id}
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={record.id === self?.id}
              loading={deleteMutation.isPending && deleteMutation.variables === record.id}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="middle"
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title={`重置密码：${resetTarget?.nickname || resetTarget?.phone}`}
        open={!!resetTarget}
        onOk={() =>
          resetForm.validateFields().then(v =>
            resetMutation.mutate({ id: resetTarget!.id, pwd: v.new_password })
          ).catch(() => {})
        }
        onCancel={() => { setResetTarget(null); resetForm.resetFields() }}
        confirmLoading={resetMutation.isPending}
        okText="确认重置" cancelText="取消"
        destroyOnClose
      >
        <Form form={resetForm} layout="vertical">
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[{ required: true, min: 6, message: '密码不少于6位' }]}
          >
            <Input.Password placeholder="请输入新密码（最少6位）" />
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
            <Input.Password placeholder="再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

// ── API 密钥 Tab ──────────────────────────────────────────────────────────────
function ApiKeysTab() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm] = Form.useForm()
  // 每个 key 的测试结果单独存储：id → { ok, message }
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [testingId, setTestingId] = useState<string | null>(null)

  const { data: keys, isLoading } = useQuery({
    queryKey: ['admin', 'apikeys'],
    queryFn: adminApi.listApiKeys,
  })

  const createMutation = useMutation({
    mutationFn: adminApi.createApiKey,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'apikeys'] })
      setCreateOpen(false)
      createForm.resetFields()
      message.success('API 密钥已添加')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '添加失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: adminApi.deleteApiKey,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'apikeys'] }); message.success('已删除') },
    onError: (err: any) => message.error(err.response?.data?.error ?? '删除失败'),
  })

  const toggleMutation = useMutation({
    mutationFn: adminApi.toggleApiKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'apikeys'] }),
    onError: (err: any) => message.error(err.response?.data?.error ?? '操作失败'),
  })

  const handleTest = async (id: string) => {
    setTestingId(id)
    try {
      const res = await adminApi.testApiKey(id)
      setTestResults(prev => ({ ...prev, [id]: res }))
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [id]: { ok: false, message: err.response?.data?.error ?? '请求失败' } }))
    } finally {
      setTestingId(null)
    }
  }

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '服务商',
      dataIndex: 'provider',
      key: 'provider',
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: 'API Key',
      dataIndex: 'key_masked',
      key: 'key',
      render: (v: string) => <Text code>{v}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'status',
      render: (v: boolean) => v
        ? <Badge status="success" text="启用" />
        : <Badge status="default" text="禁用" />,
    },
    {
      title: '添加时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '连通测试',
      key: 'test',
      width: 160,
      render: (_: any, record: ApiKey) => {
        const result = testResults[record.id]
        return (
          <Space>
            <Button
              size="small"
              loading={testingId === record.id}
              onClick={() => handleTest(record.id)}
            >
              测试
            </Button>
            {result && (
              <Tag color={result.ok ? 'success' : 'error'}>
                {result.ok ? '✓ ' : '✗ '}{result.message}
              </Tag>
            )}
          </Space>
        )
      },
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: ApiKey) => (
        <Space>
          <Button
            size="small"
            onClick={() => toggleMutation.mutate(record.id)}
            loading={toggleMutation.isPending && toggleMutation.variables === record.id}
          >
            {record.is_active ? '禁用' : '启用'}
          </Button>
          <Popconfirm
            title="确认删除此 API 密钥？"
            okText="删除" okButtonProps={{ danger: true }} cancelText="取消"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}
              loading={deleteMutation.isPending && deleteMutation.variables === record.id}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Button type="primary" icon={<KeyOutlined />} onClick={() => setCreateOpen(true)}>
          添加 API 密钥
        </Button>
      </div>

      <Table
        dataSource={keys}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="middle"
        pagination={false}
      />

      <Modal
        title="添加 API 密钥"
        open={createOpen}
        onOk={() =>
          createForm.validateFields().then(v => createMutation.mutate(v)).catch(() => {})
        }
        onCancel={() => { setCreateOpen(false); createForm.resetFields() }}
        confirmLoading={createMutation.isPending}
        okText="添加" cancelText="取消"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例：DeepSeek 生产环境" />
          </Form.Item>
          <Form.Item name="provider" label="服务商" initialValue="deepseek" rules={[{ required: true }]}>
            <Select options={[
              { value: 'deepseek', label: 'DeepSeek' },
              { value: 'openai',   label: 'OpenAI' },
              { value: 'other',    label: '其他' },
            ]} />
          </Form.Item>
          <Form.Item name="key_value" label="API Key" rules={[{ required: true, message: '请输入 API Key' }]}>
            <Input.Password placeholder="sk-..." />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

// ── AI 提示词配置 Tab ─────────────────────────────────────────────────────────
function PromptTab() {
  const qc = useQueryClient()
  const [systemMessage, setSystemMessage] = useState('')
  const [instructions, setInstructions] = useState('')

  const { data: config, isLoading } = useQuery({
    queryKey: ['admin', 'prompt-config'],
    queryFn: adminApi.getPromptConfig,
  })

  // 配置加载完成后填入编辑框
  useEffect(() => {
    if (config) {
      setSystemMessage(config.system_message)
      setInstructions(config.instructions)
    }
  }, [config])

  const saveMutation = useMutation({
    mutationFn: () => adminApi.updatePromptConfig({ system_message: systemMessage, instructions }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'prompt-config'] })
      message.success('提示词配置已保存')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '保存失败'),
  })

  return (
    <Card
      loading={isLoading}
      extra={
        <Button
          type="primary"
          loading={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          保存
        </Button>
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        以下配置影响所有用户的 AI 水质分析。数据采集部分（缸信息、水质记录、参数状态、消耗速率、生物资产）由系统自动生成，不可编辑。
      </Typography.Paragraph>

      <Form layout="vertical">
        <Form.Item
          label="系统角色消息（System Message）"
          extra="发送给 AI 的系统人设，定义 AI 的角色和能力边界"
        >
          <Input.TextArea
            value={systemMessage}
            onChange={e => setSystemMessage(e.target.value)}
            autoSize={{ minRows: 3, maxRows: 6 }}
          />
        </Form.Item>

        <Form.Item
          label="分析指令（拼接在水质数据之后）"
          extra="告诉 AI 需要输出哪些内容、格式要求等"
        >
          <Input.TextArea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            autoSize={{ minRows: 8, maxRows: 20 }}
          />
        </Form.Item>
      </Form>

      {config?.updated_at && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          上次保存：{dayjs(config.updated_at).format('YYYY-MM-DD HH:mm')}
        </Typography.Text>
      )}
    </Card>
  )
}
