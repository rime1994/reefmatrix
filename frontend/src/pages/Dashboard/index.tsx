// Dashboard/index.tsx 水质趋势看板 + 鱼缸管理
import { useState, useEffect, useMemo } from 'react'
import {
  Select, Card, Row, Col, Spin, Empty, Tag, Button, Modal, Form,
  Input, InputNumber, DatePicker, message, Drawer, Table, Popconfirm,
  Tooltip, Space,
} from 'antd'
import {
  PlusOutlined, CheckCircleFilled, CloseCircleFilled, MinusCircleFilled,
  DeleteOutlined, UnorderedListOutlined, EditOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer,
} from 'recharts'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { tanksApi } from '@/api/tanks'
import { parametersApi } from '@/api/parameters'
import {
  PARAMETER_META, TANK_TYPE_RANGES, TANK_TYPE_LABEL,
  type ParameterKey, type WaterParameter, type Tank, type TankType,
} from '@/types'

dayjs.extend(relativeTime)

const PARAMS: ParameterKey[] = ['salinity', 'temperature', 'ph', 'kh', 'ca', 'mg', 'no3', 'po4']
const CONSUME_PARAMS: ParameterKey[] = ['ph', 'kh', 'ca', 'mg', 'no3', 'po4']

const rangeRule = (min: number, max: number) => ({
  validator(_: any, value: string | undefined | null) {
    if (value == null || value === '') return Promise.resolve()
    const num = Number(value)
    if (isNaN(num)) return Promise.reject('请输入数字')
    if (num < min || num > max) return Promise.reject(`请确认数值（${min}–${max}）`)
    return Promise.resolve()
  },
})

type ParamStatus = 'safe' | 'warn' | 'nodata'

function getStatus(key: ParameterKey, tankType: TankType, value?: number): ParamStatus {
  if (value == null) return 'nodata'
  const [min, max] = TANK_TYPE_RANGES[tankType][key]
  return value >= min && value <= max ? 'safe' : 'warn'
}

function StatusIcon({ status }: { status: ParamStatus }) {
  if (status === 'safe') return <CheckCircleFilled style={{ color: '#52c41a', fontSize: 14 }} />
  if (status === 'warn') return <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 14 }} />
  return <MinusCircleFilled style={{ color: '#d9d9d9', fontSize: 14 }} />
}

export default function DashboardPage() {
  const qc = useQueryClient()
  const [tankId, setTankId]             = useState<string>()
  const [range, setRange]               = useState<'7d' | '30d' | '90d'>('30d')
  const [selectedParams, setSelected]   = useState<ParameterKey[]>(['kh', 'ca', 'mg'])
  const [tankModalOpen, setTankModal]   = useState(false)
  const [editTank, setEditTank]         = useState<Tank | null>(null) // null=新建, 非null=编辑
  const [paramModalOpen, setParamModal] = useState(false)
  const [drawerOpen, setDrawerOpen]     = useState(false)
  const [tankForm]  = Form.useForm()
  const [paramForm] = Form.useForm()
  const [modal, contextHolder] = Modal.useModal()

  const { data: tanks, isLoading: tanksLoading } = useQuery({
    queryKey: ['tanks'],
    queryFn: tanksApi.list,
  })
  useEffect(() => {
    if (tanks?.length && !tankId) setTankId(tanks[0].id)
  }, [tanks])

  const currentTank = tanks?.find(t => t.id === tankId)
  // 如果数据库缺字段或值不合法，降级到 sps 避免渲染崩溃
  const rawType = currentTank?.tank_type as TankType
  const tankType: TankType = TANK_TYPE_RANGES[rawType] ? rawType : 'sps'

  // 图表数据（受时间范围过滤，升序）
  const from = dayjs().subtract(parseInt(range), 'day').toISOString()
  const { data: parameters, isLoading: paramsLoading } = useQuery({
    queryKey: ['parameters', tankId, range],
    queryFn: () => parametersApi.list(tankId!, { from }),
    enabled: !!tankId,
    select: (data) => [...data].reverse(),
  })

  // 快览面板：不受时间范围限制，后端降序，逐参数找最新非空值
  const { data: recentParams } = useQuery({
    queryKey: ['parameters', tankId, 'latest'],
    queryFn: () => parametersApi.list(tankId!),
    enabled: !!tankId,
  })
  const latestPerParam = useMemo(() => {
    const result = {} as Record<ParameterKey, { value: number; recordedAt: string } | undefined>
    if (!recentParams?.length) return result
    for (const key of PARAMS) {
      for (const p of recentParams) {
        const val = p[key as keyof WaterParameter]
        if (val != null) { result[key] = { value: val as number, recordedAt: p.recorded_at }; break }
      }
    }
    return result
  }, [recentParams])

  // 日间消耗：(次新值 - 最新值) ÷ 间隔天数 = 每24h平均消耗
  // 正数=消耗（元素下降），负数=增加（补充），比重和温度不参与
  const consumption = useMemo(() => {
    const result = {} as Partial<Record<ParameterKey, number>>
    if (!recentParams || recentParams.length < 2) return result
    for (const key of CONSUME_PARAMS) {
      let latest: { val: number; time: string } | undefined
      let prev:   { val: number; time: string } | undefined
      for (const p of recentParams) {
        const val = p[key as keyof WaterParameter]
        if (val == null) continue
        if (!latest) { latest = { val: val as number, time: p.recorded_at }; continue }
        prev = { val: val as number, time: p.recorded_at }
        break
      }
      if (latest && prev) {
        const hours = dayjs(latest.time).diff(dayjs(prev.time), 'hour', true)
        if (hours <= 0) continue
        const daily = (prev.val - latest.val) / (hours / 24)
        result[key] = Math.round(daily * 1000) / 1000
      }
    }
    return result
  }, [recentParams])

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveTankMutation = useMutation({
    mutationFn: (values: any) => editTank
      ? tanksApi.update(editTank.id, values)
      : tanksApi.create(values),
    onSuccess: (tank) => {
      qc.invalidateQueries({ queryKey: ['tanks'] })
      if (!editTank) setTankId(tank.id)
      setTankModal(false)
      tankForm.resetFields()
      setEditTank(null)
      message.success(editTank ? '鱼缸已更新' : '鱼缸创建成功')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '操作失败'),
  })

  const createParamMutation = useMutation({
    mutationFn: (values: any) => parametersApi.create(tankId!, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parameters'] })
      setParamModal(false)
      paramForm.resetFields()
      message.success('水质记录已保存')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '保存失败'),
  })

  const deleteParamMutation = useMutation({
    mutationFn: parametersApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['parameters'] }); message.success('已删除') },
    onError: (err: any) => message.error(err.response?.data?.error ?? '删除失败'),
  })

  // ── Handlers ───────────────────────────────────────────────────────────────
  const openCreateTank = () => {
    setEditTank(null)
    tankForm.resetFields()
    setTankModal(true)
  }

  const openEditTank = () => {
    if (!currentTank) return
    setEditTank(currentTank)
    tankForm.setFieldsValue({
      name: currentTank.name,
      tank_type: currentTank.tank_type,
      volume_liters: currentTank.volume_liters,
      setup_date: currentTank.setup_date ? dayjs(currentTank.setup_date) : undefined,
      description: currentTank.description,
    })
    setTankModal(true)
  }

  const handleDeleteTank = () => {
    if (!currentTank) return
    modal.confirm({
      title: `确认归档「${currentTank.name}」？`,
      icon: <ExclamationCircleOutlined />,
      content: '归档后该缸数据仍保留，可前往「设置」页面恢复或彻底删除。',
      okText: '归档', okType: 'danger', cancelText: '取消',
      onOk: async () => {
        await tanksApi.archive(currentTank.id)
        qc.invalidateQueries({ queryKey: ['tanks'] })
        setTankId(undefined)
        message.success('已归档')
      },
    })
  }

  const handleSaveTank = (values: any) => {
    saveTankMutation.mutate({
      name: values.name,
      tank_type: values.tank_type ?? 'sps',
      volume_liters: values.volume_liters,
      setup_date: values.setup_date?.toISOString(),
      description: values.description,
    })
  }

  const handleCreateParam = (values: any) => {
    const toNum = (v: any) => (v === '' || v == null) ? undefined : Number(v)
    createParamMutation.mutate({
      recorded_at: (values.recorded_at ?? dayjs()).toISOString(),
      salinity:    toNum(values.salinity),
      temperature: toNum(values.temperature),
      ph:          toNum(values.ph),
      kh:          toNum(values.kh),
      ca:          toNum(values.ca),
      mg:          toNum(values.mg),
      no3:         toNum(values.no3),
      po4:         toNum(values.po4),
      notes:       values.notes,
    })
  }

  const openParamModal = () => {
    paramForm.setFieldValue('recorded_at', dayjs())
    setParamModal(true)
  }

  const chartData = parameters?.map(p => ({
    time: dayjs(p.recorded_at).format('MM-DD HH:mm'),
    salinity: p.salinity, temperature: p.temperature, ph: p.ph,
    kh: p.kh, ca: p.ca, mg: p.mg, no3: p.no3, po4: p.po4,
  })) ?? []

  // 记录管理抽屉表格列
  const recordColumns = [
    { title: '检测时间', dataIndex: 'recorded_at', key: 'time', width: 140,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    ...PARAMS.map(key => ({
      title: PARAMETER_META[key].label, dataIndex: key, key,
      width: 68, align: 'center' as const,
      render: (v?: number) => v != null ? v : <span style={{ color: '#d9d9d9' }}>—</span>,
    })),
    { title: '', key: 'action', width: 48, fixed: 'right' as const,
      render: (_: any, record: WaterParameter) => (
        <Popconfirm title="确认删除这条记录？" onConfirm={() => deleteParamMutation.mutate(record.id)}>
          <Button type="link" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ) },
  ]

  if (tanksLoading) return <Spin size="large" style={{ display: 'block', marginTop: 80 }} />

  if (!tanks?.length) {
    return (
      <>
        {contextHolder}
        <Empty description="还没有鱼缸，先创建一个">
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateTank}>添加鱼缸</Button>
        </Empty>
        <TankFormModal open={tankModalOpen} form={tankForm} isEdit={false}
          loading={saveTankMutation.isPending}
          onOk={() => tankForm.validateFields().then(handleSaveTank).catch(() => {})}
          onCancel={() => { setTankModal(false); tankForm.resetFields() }}
          onFinish={handleSaveTank} />
      </>
    )
  }

  return (
    <div>
      {contextHolder}

      {/* 顶部控制栏 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* 鱼缸选择器 + 编辑/删除 */}
        <Space.Compact>
          <Select
            style={{ minWidth: 160 }}
            value={tankId}
            onChange={setTankId}
            options={tanks.map(t => ({ value: t.id, label: `${t.name}（${t.tank_type?.toUpperCase()}）` }))}
          />
          <Tooltip title="编辑鱼缸">
            <Button icon={<EditOutlined />} onClick={openEditTank} disabled={!tankId} />
          </Tooltip>
          <Tooltip title="归档鱼缸">
            <Button icon={<DeleteOutlined />} danger onClick={handleDeleteTank} disabled={!tankId} />
          </Tooltip>
        </Space.Compact>

        <Select
          value={range}
          onChange={setRange}
          options={[
            { value: '7d', label: '近7天' },
            { value: '30d', label: '近30天' },
            { value: '90d', label: '近90天' },
          ]}
        />

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button icon={<UnorderedListOutlined />} onClick={() => setDrawerOpen(true)} disabled={!tankId}>
            管理记录
          </Button>
          <Button icon={<PlusOutlined />} onClick={openParamModal} disabled={!tankId}>
            录入水质
          </Button>
          <Button type="dashed" icon={<PlusOutlined />} onClick={openCreateTank}>
            添加鱼缸
          </Button>
        </div>
      </div>

      {/* 最新水质快览：每个参数独立取最新非空值，根据缸型判断状态，无数据时仍显示灰色占位 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
        {PARAMS.map(key => {
          const meta   = PARAMETER_META[key]
          const entry  = latestPerParam[key]
          const status = getStatus(key, tankType, entry?.value)
          const [min, max] = TANK_TYPE_RANGES[tankType][key]
          const tooltipText =
            status === 'safe'   ? `正常范围 ${min}–${max}${meta.unit ? ' ' + meta.unit : ''}` :
            status === 'warn'   ? `超出范围（正常：${min}–${max}${meta.unit ? ' ' + meta.unit : ''}）` :
                                 '暂无数据'
          return (
            <Col key={key} xs={12} sm={8} md={6} lg={3}>
              <Card
                size="small"
                style={{ textAlign: 'center', borderColor: status === 'warn' ? '#ffccc7' : undefined }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                  <span style={{ color: '#8c8c8c', fontSize: 12 }}>{meta.label}</span>
                  <Tooltip title={tooltipText}><StatusIcon status={status} /></Tooltip>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: entry ? meta.color : '#d9d9d9' }}>
                  {entry ? entry.value : '—'}
                </div>
                <div style={{ color: '#bfbfbf', fontSize: 11, minHeight: 18 }}>
                  {meta.unit || ' '}
                </div>
                <div style={{ color: '#bfbfbf', fontSize: 10 }}>
                  {min}–{max}{meta.unit ? ' ' + meta.unit : ''}
                </div>
                <div style={{ color: '#bfbfbf', fontSize: 10, minHeight: 16 }}>
                  {entry ? dayjs(entry.recordedAt).fromNow() : ' '}
                </div>
              </Card>
            </Col>
          )
        })}
      </Row>

      {/* 参数选择器 */}
      <div style={{ marginBottom: 12 }}>
        {PARAMS.map(key => (
          <Tag.CheckableTag
            key={key}
            checked={selectedParams.includes(key)}
            onChange={(checked) => setSelected(
              checked ? [...selectedParams, key] : selectedParams.filter(p => p !== key)
            )}
            style={{ marginBottom: 4 }}
          >
            {PARAMETER_META[key].label}
          </Tag.CheckableTag>
        ))}
      </div>

      {/* 参数趋势图：每个已选参数独立一张图，2 列网格 */}
      {paramsLoading ? (
        <Spin style={{ display: 'block', margin: '40px auto' }} />
      ) : chartData.length === 0 ? (
        <Card>
          <Empty description="暂无水质记录">
            <Button type="primary" onClick={openParamModal}>录入第一条数据</Button>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[12, 12]}>
          {selectedParams.map(key => {
            const meta = PARAMETER_META[key]
            return (
              <Col key={key} xs={24} lg={12}>
                <Card
                  size="small"
                  title={
                    <span style={{ color: meta.color }}>
                      {meta.label}{meta.unit ? ` (${meta.unit})` : ''}
                    </span>
                  }
                >
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} width={45} />
                      <ReTooltip />
                      <Line
                        type="monotone"
                        dataKey={key}
                        stroke={meta.color}
                        dot={false}
                        strokeWidth={2}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
            )
          })}
        </Row>
      )}

      {/* 日间消耗：两次最新记录差值，正数=消耗，负数=补充 */}
      {Object.keys(consumption).length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: '#8c8c8c', fontSize: 12, marginRight: 4 }}>日间消耗</span>
          {CONSUME_PARAMS.filter(key => consumption[key] !== undefined).map(key => {
            const meta = PARAMETER_META[key]
            const val = consumption[key]!
            return (
              <Tag key={key} color={val > 0 ? 'orange' : val < 0 ? 'green' : 'default'} style={{ marginRight: 0 }}>
                {meta.label} {val > 0 ? '-' : val < 0 ? '+' : ''}{Math.abs(val)}{meta.unit ? ' ' + meta.unit : ''}/天
              </Tag>
            )
          })}
        </div>
      )}

      {/* 鱼缸新建/编辑弹窗 */}
      <TankFormModal
        open={tankModalOpen} form={tankForm} isEdit={!!editTank}
        loading={saveTankMutation.isPending}
        onOk={() => tankForm.validateFields().then(handleSaveTank).catch(() => {})}
        onCancel={() => { setTankModal(false); tankForm.resetFields(); setEditTank(null) }}
        onFinish={handleSaveTank}
      />

      {/* 录入水质弹窗 */}
      <Modal
        title="录入水质检测数据"
        open={paramModalOpen}
        onOk={() => paramForm.validateFields().then(handleCreateParam).catch(() => {})}
        onCancel={() => { setParamModal(false); paramForm.resetFields() }}
        confirmLoading={createParamMutation.isPending}
        okText="保存" cancelText="取消" width={520}
      >
        <Form form={paramForm} layout="vertical" onFinish={handleCreateParam}>
          <Form.Item name="recorded_at" label="检测时间" rules={[{ required: true }]}>
            <DatePicker
              showTime={{ format: 'HH:mm' }}
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Row gutter={8}>
            <Col span={8}>
              <Form.Item name="salinity" label="比重 (SG)" rules={[rangeRule(0, 2)]} validateTrigger={['onChange', 'onBlur']}>
                <Input placeholder="0–2" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="temperature" label="温度 (°C)" rules={[rangeRule(0, 35)]} validateTrigger={['onChange', 'onBlur']}>
                <Input placeholder="0–35" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="ph" label="pH" rules={[rangeRule(0, 15)]} validateTrigger={['onChange', 'onBlur']}>
                <Input placeholder="0–15" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="kh" label="KH (dKH)" rules={[rangeRule(0, 15)]} validateTrigger={['onChange', 'onBlur']}>
                <Input placeholder="0–15" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="ca" label="Ca (ppm)" rules={[rangeRule(0, 1000)]} validateTrigger={['onChange', 'onBlur']}>
                <Input placeholder="0–1000" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="mg" label="Mg (ppm)" rules={[rangeRule(0, 2000)]} validateTrigger={['onChange', 'onBlur']}>
                <Input placeholder="0–2000" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="no3" label="NO₃ (ppm)" rules={[rangeRule(0, 200)]} validateTrigger={['onChange', 'onBlur']}>
                <Input placeholder="0–200" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="po4" label="PO₄ (ppm)" rules={[rangeRule(0, 200)]} validateTrigger={['onChange', 'onBlur']}>
                <Input placeholder="0–200" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 记录管理抽屉 */}
      <Drawer
        title="水质记录管理"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={960}
        extra={
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => { setDrawerOpen(false); openParamModal() }}>
            录入新数据
          </Button>
        }
      >
        <Table
          dataSource={recentParams}
          columns={recordColumns}
          rowKey="id"
          size="small"
          scroll={{ x: 900 }}
          pagination={{ pageSize: 20, showSizeChanger: false }}
        />
      </Drawer>
    </div>
  )
}

// ── 鱼缸表单弹窗（新建和编辑共用）────────────────────────────────────────────
function TankFormModal({ open, form, isEdit, loading, onOk, onCancel, onFinish }: {
  open: boolean; form: any; isEdit: boolean; loading: boolean
  onOk: () => void; onCancel: () => void; onFinish: (v: any) => void
}) {
  return (
    <Modal
      title={isEdit ? '编辑鱼缸' : '添加鱼缸'}
      open={open} onOk={onOk} onCancel={onCancel}
      confirmLoading={loading} okText={isEdit ? '保存' : '创建'} cancelText="取消"
    >
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="name" label="鱼缸名称" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="例：客厅 SPS 缸" />
        </Form.Item>
        <Form.Item name="tank_type" label="缸型" initialValue="sps" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'sps', label: 'SPS（小水螅体珊瑚）' },
              { value: 'lps', label: 'LPS（大水螅体珊瑚）' },
              { value: 'nps', label: 'NPS（无光合珊瑚）' },
            ]}
          />
        </Form.Item>
        <Form.Item name="volume_liters" label="净水量 (升)" rules={[{ required: true, message: '请输入净水量' }]}>
          <InputNumber style={{ width: '100%' }} min={1} placeholder="例：300" />
        </Form.Item>
        <Form.Item name="setup_date" label="开缸日期">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="description" label="备注">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
