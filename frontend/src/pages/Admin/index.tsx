// Admin/index.tsx 管理后台：用户管理 + API 密钥管理 + AI 提示词配置 + 题库管理 + 邀请关系
import { useState } from 'react'
import {
  Card, Tabs, Table, Button, Tag, Space, Popconfirm, Modal, Form,
  Input, Select, message, Typography, Badge, Switch, Tooltip, Tree,
} from 'antd'
import {
  DeleteOutlined, KeyOutlined, UserOutlined, ReloadOutlined, RobotOutlined,
  BookOutlined, TeamOutlined, EditOutlined, PlusOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { adminApi } from '@/api/admin'
import { useAuthStore } from '@/stores/authStore'
import type { User, ApiKey, ReefQuestion } from '@/types'

const { Text } = Typography

export default function AdminPage() {
  return (
    <div>
      <div style={{ marginBottom: 24, fontSize: 18, fontWeight: 700 }}>管理后台</div>
      <Tabs
        items={[
          { key: 'users',    label: <><UserOutlined /> 用户管理</>,   children: <UsersTab /> },
          { key: 'apikeys',  label: <><KeyOutlined />  API 密钥</>,   children: <ApiKeysTab /> },
          { key: 'prompt',   label: <><RobotOutlined /> AI 提示词</>, children: <PromptTab /> },
          { key: 'questions',label: <><BookOutlined /> 题库管理</>,   children: <QuestionsTab /> },
          { key: 'invites',  label: <><TeamOutlined /> 邀请关系</>,   children: <InviteTab /> },
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
const DEFAULT_SYSTEM_MESSAGE = '你是一位专业的海水珊瑚缸水质顾问，擅长分析水质数据并给出实用、精准的补充建议。'
const DEFAULT_INSTRUCTIONS = `请根据以上数据，用中文提供：
1. 当前水质状态综合评估（2-3句）
2. 需要重点关注的问题（如有，列出具体参数和原因）
3. 具体补充建议（品种和大致用量参考）
4. 建议下次检测时间
请简明扼要，重点突出，不要重复数据。`

function PromptTab() {
  const qc = useQueryClient()

  const { data: config } = useQuery({
    queryKey: ['admin', 'prompt-config'],
    queryFn: adminApi.getPromptConfig,
    retry: 0,                 // 失败不重试，避免 isLoading 卡住
    staleTime: 30_000,
  })

  // draft 只在用户主动编辑后才有值，否则直接展示 config；API 失败时回落到硬编码默认值
  const [draft, setDraft] = useState<{ system_message: string; instructions: string } | null>(null)

  const saveMutation = useMutation({
    mutationFn: () => adminApi.updatePromptConfig(draft!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'prompt-config'] })
      setDraft(null)
      message.success('提示词配置已保存')
    },
    onError: (err: any) => {
      const status = err.response?.status
      const detail = err.response?.data?.error ?? err.response?.data ?? err.message ?? '保存失败'
      message.error(`保存失败 (${status ?? 'network'}): ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
    },
  })

  const systemMessage = draft?.system_message
    ?? (config?.system_message || DEFAULT_SYSTEM_MESSAGE)
  const instructions  = draft?.instructions
    ?? (config?.instructions  || DEFAULT_INSTRUCTIONS)

  const handleChange = (field: 'system_message' | 'instructions', value: string) => {
    setDraft(prev => ({
      system_message: prev?.system_message ?? systemMessage,
      instructions:   prev?.instructions   ?? instructions,
      [field]: value,
    }))
  }

  return (
    <Card
      extra={
        <Button
          type="primary"
          disabled={!draft}
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
            onChange={e => handleChange('system_message', e.target.value)}
            autoSize={{ minRows: 3, maxRows: 6 }}
          />
        </Form.Item>

        <Form.Item
          label="分析指令（拼接在水质数据之后）"
          extra="告诉 AI 需要输出哪些内容、格式要求等"
        >
          <Input.TextArea
            value={instructions}
            onChange={e => handleChange('instructions', e.target.value)}
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

// ── 题库管理 Tab ──────────────────────────────────────────────────────────────

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: 'green', medium: 'orange', hard: 'red',
}
const DIFFICULTY_LABEL: Record<string, string> = {
  easy: '简单', medium: '中等', hard: '困难',
}
const CATEGORY_LABEL: Record<string, string> = {
  chemistry: '化学', biology: '生物', equipment: '设备', husbandry: '饲育',
}

function QuestionsTab() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ReefQuestion | null>(null)
  const [form] = Form.useForm()

  const { data: questions, isLoading } = useQuery({
    queryKey: ['admin', 'questions'],
    queryFn: adminApi.listQuestions,
  })

  const createMutation = useMutation({
    mutationFn: adminApi.createQuestion,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'questions'] })
      setModalOpen(false)
      form.resetFields()
      message.success('题目已添加')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '添加失败'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updateQuestion(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'questions'] })
      setModalOpen(false)
      setEditing(null)
      form.resetFields()
      message.success('题目已更新')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '更新失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: adminApi.deleteQuestion,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'questions'] }); message.success('已删除') },
    onError: (err: any) => message.error(err.response?.data?.error ?? '删除失败'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      adminApi.updateQuestion(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'questions'] }),
  })

  const openEdit = (q: ReefQuestion) => {
    setEditing(q)
    form.setFieldsValue({
      ...q,
      options: Array.isArray(q.options) ? q.options.join('\n') : q.options,
    })
    setModalOpen(true)
  }

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const handleOk = () => {
    form.validateFields().then(values => {
      const optionsArr = values.options
        .split('\n')
        .map((s: string) => s.trim())
        .filter(Boolean)
      const payload = { ...values, options: optionsArr }
      if (editing) {
        updateMutation.mutate({ id: editing.id, data: payload })
      } else {
        createMutation.mutate(payload)
      }
    }).catch(() => {})
  }

  const columns = [
    {
      title: '题目',
      dataIndex: 'question',
      key: 'question',
      ellipsis: true,
      render: (v: string) => <Tooltip title={v}><span>{v}</span></Tooltip>,
    },
    {
      title: '答案',
      dataIndex: 'answer',
      key: 'answer',
      width: 60,
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: '难度',
      dataIndex: 'difficulty',
      key: 'difficulty',
      width: 80,
      render: (v: string) => <Tag color={DIFFICULTY_COLOR[v] ?? 'default'}>{DIFFICULTY_LABEL[v] ?? v}</Tag>,
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 80,
      render: (v?: string) => v ? <Tag>{CATEGORY_LABEL[v] ?? v}</Tag> : '—',
    },
    {
      title: '启用',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 70,
      render: (v: boolean, record: ReefQuestion) => (
        <Switch
          checked={v}
          size="small"
          loading={toggleMutation.isPending}
          onChange={checked => toggleMutation.mutate({ id: record.id, is_active: checked })}
        />
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 110,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: any, record: ReefQuestion) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm
            title="确认删除此题目？"
            okText="删除" okButtonProps={{ danger: true }} cancelText="取消"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography.Text type="secondary">
          共 {questions?.length ?? 0} 道题，其中启用 {questions?.filter(q => q.is_active).length ?? 0} 道
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>添加题目</Button>
      </div>

      <Table
        dataSource={questions}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="middle"
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title={editing ? '编辑题目' : '添加题目'}
        open={modalOpen}
        onOk={handleOk}
        onCancel={() => { setModalOpen(false); setEditing(null); form.resetFields() }}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        okText={editing ? '保存' : '添加'} cancelText="取消"
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ difficulty: 'medium', is_active: true }}>
          <Form.Item name="question" label="题目内容" rules={[{ required: true, message: '请输入题目' }]}>
            <Input.TextArea rows={3} placeholder="输入题目内容" />
          </Form.Item>
          <Form.Item
            name="options"
            label="选项（每行一个，依次为A/B/C/D）"
            rules={[{ required: true, message: '请输入选项' }]}
            extra="每行对应一个选项，顺序即A、B、C、D"
          >
            <Input.TextArea rows={4} placeholder={'选项A内容\n选项B内容\n选项C内容\n选项D内容'} />
          </Form.Item>
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item name="answer" label="正确答案" rules={[{ required: true }]} style={{ width: 120 }}>
              <Select options={['A','B','C','D'].map(v => ({ value: v, label: v }))} />
            </Form.Item>
            <Form.Item name="difficulty" label="难度" style={{ width: 120 }}>
              <Select options={[
                { value: 'easy', label: '简单' },
                { value: 'medium', label: '中等' },
                { value: 'hard', label: '困难' },
              ]} />
            </Form.Item>
            <Form.Item name="category" label="分类" style={{ width: 120 }}>
              <Select allowClear placeholder="不限" options={[
                { value: 'chemistry', label: '化学' },
                { value: 'biology',   label: '生物' },
                { value: 'equipment', label: '设备' },
                { value: 'husbandry', label: '饲育' },
              ]} />
            </Form.Item>
            <Form.Item name="is_active" label="启用" valuePropName="checked" style={{ width: 80 }}>
              <Switch />
            </Form.Item>
          </Space>
          <Form.Item name="explanation" label="解析（可选）">
            <Input.TextArea rows={3} placeholder="答题后展示给用户的解析说明" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

// ── 邀请关系 Tab ──────────────────────────────────────────────────────────────

function InviteTab() {
  const { data: users, isLoading } = useQuery({
    queryKey: ['admin', 'invite-relations'],
    queryFn: adminApi.listInviteRelations,
  })

  // 构建树形结构：以 my_invite_code 为 key，invited_by（UUID）为父节点
  const buildTree = (users: User[]) => {
    const idMap = new Map<string, User>()
    users.forEach(u => idMap.set(u.id, u))

    // 没有 invited_by 的是根节点
    const roots: User[] = []
    const childrenMap = new Map<string, User[]>()
    users.forEach(u => {
      if (!u.invited_by) {
        roots.push(u)
      } else {
        const arr = childrenMap.get(u.invited_by) ?? []
        arr.push(u)
        childrenMap.set(u.invited_by, arr)
      }
    })

    const toTreeNode = (u: User): any => ({
      key: u.id,
      title: (
        <Space size={4}>
          <span style={{ fontWeight: 500 }}>{u.nickname || '—'}</span>
          {u.email && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{u.email}</Typography.Text>}
          {u.phone && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{u.phone}</Typography.Text>}
          {u.my_invite_code && <Tag style={{ fontSize: 11, marginLeft: 4 }}>{u.my_invite_code}</Tag>}
          {u.registration_path && (
            <Tag color={u.registration_path === 'invite' ? 'blue' : u.registration_path === 'quiz' ? 'purple' : 'default'} style={{ fontSize: 11 }}>
              {u.registration_path === 'invite' ? '邀请' : u.registration_path === 'quiz' ? '问答' : u.registration_path}
            </Tag>
          )}
          {u.role === 'admin' && <Tag color="gold" style={{ fontSize: 11 }}>管理员</Tag>}
        </Space>
      ),
      children: (childrenMap.get(u.id) ?? []).map(toTreeNode),
    })

    return roots.map(toTreeNode)
  }

  const treeData = users ? buildTree(users) : []

  const columns = [
    {
      title: '昵称',
      dataIndex: 'nickname',
      key: 'nickname',
      render: (v: string) => v || '—',
    },
    {
      title: '邮箱 / 手机',
      key: 'contact',
      render: (_: any, r: User) => r.email || r.phone || '—',
    },
    {
      title: '注册方式',
      dataIndex: 'registration_path',
      key: 'registration_path',
      render: (v?: string) => v ? (
        <Tag color={v === 'invite' ? 'blue' : v === 'quiz' ? 'purple' : 'default'}>
          {v === 'invite' ? '邀请码' : v === 'quiz' ? '知识问答' : v}
        </Tag>
      ) : '—',
    },
    {
      title: '我的邀请码',
      dataIndex: 'my_invite_code',
      key: 'my_invite_code',
      render: (v?: string) => v ? <Tag>{v}</Tag> : '—',
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
  ]

  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        共 {users?.length ?? 0} 名用户。树状视图展示邀请链，表格视图展示详细信息。
      </Typography.Paragraph>

      <Tabs
        size="small"
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'tree',
            label: '邀请树',
            children: isLoading ? (
              <div style={{ padding: 24, color: '#999' }}>加载中…</div>
            ) : (
              <Tree
                treeData={treeData}
                defaultExpandAll
                showLine={{ showLeafIcon: false }}
                style={{ background: '#fafafa', borderRadius: 8, padding: 16 }}
              />
            ),
          },
          {
            key: 'table',
            label: '用户列表',
            children: (
              <Table
                dataSource={users}
                columns={columns}
                rowKey="id"
                loading={isLoading}
                size="middle"
                pagination={{ pageSize: 20 }}
              />
            ),
          },
        ]}
      />
    </div>
  )
}
