// Assets/index.tsx 资产追踪 — 生物资产 + 设备资产两个 Tab
import { useState, useEffect } from 'react'
import {
  Select, Card, Row, Col, Tabs, Table, Tag, Statistic, Button, Empty,
  Modal, Form, Input, InputNumber, DatePicker, Popconfirm, Space,
  Drawer, message,
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, LineChartOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { tanksApi } from '@/api/tanks'
import { assetsApi, equipmentLogsApi, bioMeasurementsApi } from '@/api/assets'
import {
  EQUIPMENT_TYPE_LABEL, EQUIPMENT_PARAMS,
  type Asset, type AssetCategory, type AssetStatus,
  type EquipmentType, type EquipmentLog, type BioMeasurement,
} from '@/types'

const BIO_CATEGORIES: AssetCategory[] = ['fish', 'coral', 'invertebrate', 'other']

const CATEGORY_COLOR: Record<AssetCategory, string> = {
  fish: 'blue', coral: 'cyan', invertebrate: 'purple', equipment: 'orange', other: 'default',
}
const CATEGORY_LABEL: Record<AssetCategory, string> = {
  fish: '鱼类', coral: '珊瑚', invertebrate: '无脊椎', equipment: '设备', other: '其他',
}
const STATUS_COLOR: Record<AssetStatus, string> = {
  healthy: 'success', sick: 'warning', sold: 'default', dead: 'error', transferred: 'processing',
}
const STATUS_LABEL: Record<AssetStatus, string> = {
  healthy: '健康', sick: '病号', sold: '已售', dead: '死亡', transferred: '已转出',
}
const EQUIP_STATUS_LABEL: Record<AssetStatus, string> = {
  healthy: '正常运行', sick: '故障', sold: '已售出', dead: '已报废', transferred: '已停用',
}

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function AssetsPage() {
  const { data: tanks } = useQuery({ queryKey: ['tanks'], queryFn: tanksApi.list })
  const [tankId, setTankId] = useState<string>()

  useEffect(() => {
    if (tanks?.length && !tankId) setTankId(tanks[0].id)
  }, [tanks])

  const { data: assets } = useQuery({
    queryKey: ['assets', tankId],
    queryFn: () => assetsApi.list(tankId!),
    enabled: !!tankId,
  })

  const bioAssets  = assets?.filter(a => BIO_CATEGORIES.includes(a.category)) ?? []
  const equipAssets = assets?.filter(a => a.category === 'equipment') ?? []

  const totalValue = assets?.reduce((s, a) => s + (a.current_value ?? a.purchase_price ?? 0) * a.quantity, 0) ?? 0
  const totalCost  = assets?.reduce((s, a) => s + (a.purchase_price ?? 0) * a.quantity, 0) ?? 0

  return (
    <div>
      {/* 顶部鱼缸选择器 */}
      <div style={{ marginBottom: 24 }}>
        <Select
          style={{ minWidth: 160 }}
          value={tankId}
          onChange={setTankId}
          options={tanks?.map(t => ({ value: t.id, label: t.name }))}
          placeholder="选择鱼缸"
        />
      </div>

      {/* 汇总统计 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} md={6}>
          <Card><Statistic title="生物总数" value={bioAssets.reduce((s, a) => s + a.quantity, 0)} suffix="只/株" /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card><Statistic title="设备数量" value={equipAssets.length} suffix="件" /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card><Statistic title="总成本" value={totalCost} prefix="¥" precision={0} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="当前估值"
              value={totalValue}
              prefix="¥"
              precision={0}
              valueStyle={{ color: totalValue >= totalCost ? '#52c41a' : '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 生物/设备 Tab */}
      <Tabs
        items={[
          {
            key: 'bio',
            label: '🐠 生物资产',
            children: <BioTab tankId={tankId} assets={bioAssets} />,
          },
          {
            key: 'equipment',
            label: '⚙️ 设备资产',
            children: <EquipmentTab tankId={tankId} assets={equipAssets} />,
          },
        ]}
      />
    </div>
  )
}

// ── 生物资产 Tab ───────────────────────────────────────────────────────────────
function BioTab({ tankId, assets }: { tankId?: string; assets: Asset[] }) {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editAsset, setEditAsset] = useState<Asset | null>(null)
  const [measureDrawer, setMeasureDrawer] = useState<Asset | null>(null)
  const [form] = Form.useForm()

  const saveMutation = useMutation({
    mutationFn: (values: any) => editAsset
      ? assetsApi.update(editAsset.id, values)
      : assetsApi.create(tankId!, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets', tankId] })
      closeModal()
      message.success(editAsset ? '已更新' : '已添加')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '操作失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assetsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets', tankId] }); message.success('已删除') },
    onError: (err: any) => message.error(err.response?.data?.error ?? '删除失败'),
  })

  const openCreate = () => { setEditAsset(null); form.resetFields(); setModalOpen(true) }
  const openEdit = (a: Asset) => {
    setEditAsset(a)
    form.setFieldsValue({ ...a, purchase_date: a.purchase_date ? dayjs(a.purchase_date) : undefined })
    setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditAsset(null); form.resetFields() }

  const handleFinish = (values: any) => {
    saveMutation.mutate({ ...values, purchase_date: values.purchase_date?.toISOString() })
  }

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 160 },
    {
      title: '类型', dataIndex: 'category', key: 'category', width: 90,
      render: (v: AssetCategory) => <Tag color={CATEGORY_COLOR[v]}>{CATEGORY_LABEL[v]}</Tag>,
    },
    { title: '数量', dataIndex: 'quantity', key: 'qty', width: 60 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (v: AssetStatus) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag>,
    },
    {
      title: '尺寸(cm)', key: 'size_cm', width: 100,
      render: (_: any, r: Asset) =>
        r.latest_bio?.size_cm != null ? `${r.latest_bio.size_cm} cm` : '—',
    },
    {
      title: '生长点数量', key: 'growth_points', width: 100,
      render: (_: any, r: Asset) =>
        r.category === 'coral' && r.latest_bio?.growth_points != null
          ? `${r.latest_bio.growth_points} 个` : '—',
    },
    {
      title: '购入价', dataIndex: 'purchase_price', key: 'cost', width: 100,
      render: (v?: number) => v != null ? `¥${v}` : '—',
    },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_: any, record: Asset) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<LineChartOutlined />}
            onClick={() => setMeasureDrawer(record)} title="记录尺寸" />
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="确认删除此生物？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }}
            onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />}
              loading={deleteMutation.isPending && deleteMutation.variables === record.id} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 12, textAlign: 'right' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!tankId}>
          添加生物
        </Button>
      </div>

      {!tankId ? (
        <Empty description="请选择鱼缸" />
      ) : (
        <Table dataSource={assets} columns={columns} rowKey="id" size="middle" pagination={{ pageSize: 20 }} />
      )}

      {/* 新建/编辑弹窗 */}
      <Modal
        title={editAsset ? '编辑生物资产' : '添加生物资产'}
        open={modalOpen}
        onOk={() => form.validateFields().then(handleFinish).catch(() => {})}
        onCancel={closeModal}
        confirmLoading={saveMutation.isPending}
        okText={editAsset ? '保存' : '添加'} cancelText="取消"
        width={520} destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleFinish}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="category" label="类型" rules={[{ required: true }]} initialValue="fish">
                <Select options={BIO_CATEGORIES.map(v => ({ value: v, label: CATEGORY_LABEL[v] }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态" initialValue="healthy">
                <Select options={Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例：黄金吊、彩虹鹿角" />
          </Form.Item>
          <Form.Item name="species" label="学名/品种">
            <Input placeholder="例：Zebrasoma flavescens" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="quantity" label="数量" initialValue={1}><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col>
            <Col span={8}><Form.Item name="purchase_price" label="购入价 (¥)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col span={8}><Form.Item name="current_value" label="当前估值 (¥)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
          </Row>
          <Form.Item name="purchase_date" label="购入日期"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* 尺寸记录抽屉 */}
      {measureDrawer && (
        <BioMeasureDrawer
          asset={measureDrawer}
          onClose={() => setMeasureDrawer(null)}
        />
      )}
    </>
  )
}

// ── 生物尺寸记录抽屉 ──────────────────────────────────────────────────────────
function BioMeasureDrawer({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const qc = useQueryClient()
  const [form] = Form.useForm()
  const isCoral = asset.category === 'coral'

  const { data: measurements, isLoading } = useQuery({
    queryKey: ['bio-measurements', asset.id],
    queryFn: () => bioMeasurementsApi.list(asset.id),
  })

  const createMutation = useMutation({
    mutationFn: (values: any) => bioMeasurementsApi.create(asset.id, {
      recorded_at: (values.recorded_at ?? dayjs()).toISOString(),
      size_cm: values.size_cm ?? undefined,
      growth_points: isCoral ? (values.growth_points ?? undefined) : undefined,
      notes: values.notes ?? undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bio-measurements', asset.id] })
      form.resetFields()
      message.success('记录已添加')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '添加失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bioMeasurementsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bio-measurements', asset.id] }),
  })

  const columns = [
    { title: '记录时间', dataIndex: 'recorded_at', key: 'time', width: 140,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    { title: '尺寸 (cm)', dataIndex: 'size_cm', key: 'size',
      render: (v?: number) => v != null ? `${v} cm` : '—' },
    ...(isCoral ? [{
      title: '生长点', dataIndex: 'growth_points', key: 'growth_points',
      render: (v?: number) => v != null ? `${v} 个` : '—',
    }] : []),
    { title: '', key: 'del', width: 48,
      render: (_: any, r: BioMeasurement) => (
        <Popconfirm title="确认删除？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }}
          onConfirm={() => deleteMutation.mutate(r.id)}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <Drawer
      title={`生长记录 — ${asset.name}`}
      open
      onClose={onClose}
      width={isCoral ? 580 : 500}
    >
      <Form form={form} layout="inline" style={{ marginBottom: 16, gap: 8, flexWrap: 'wrap' }}
        onFinish={(v) => createMutation.mutate(v)}>
        <Form.Item name="recorded_at" initialValue={dayjs()} style={{ margin: 0 }}>
          <DatePicker showTime={{ format: 'HH:mm' }} format="MM-DD HH:mm" style={{ width: 150 }} />
        </Form.Item>
        <Form.Item name="size_cm" style={{ margin: 0 }}>
          <InputNumber placeholder="尺寸 cm" min={0} step={0.1} style={{ width: isCoral ? 130 : 160 }} />
        </Form.Item>
        {isCoral && (
          <Form.Item name="growth_points" style={{ margin: 0 }}>
            <InputNumber placeholder="生长点数量" min={0} step={1} precision={0} style={{ width: 130 }} />
          </Form.Item>
        )}
        <Form.Item style={{ margin: 0 }}>
          <Button type="primary" htmlType="submit" loading={createMutation.isPending} icon={<PlusOutlined />}>
            添加
          </Button>
        </Form.Item>
      </Form>

      <Table
        dataSource={measurements}
        columns={columns}
        rowKey="id"
        size="small"
        loading={isLoading}
        pagination={{ pageSize: 10, showSizeChanger: false }}
      />
    </Drawer>
  )
}

// ── 设备资产 Tab ───────────────────────────────────────────────────────────────
function EquipmentTab({ tankId, assets }: { tankId?: string; assets: Asset[] }) {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editAsset, setEditAsset] = useState<Asset | null>(null)
  const [logDrawer, setLogDrawer] = useState<Asset | null>(null)
  const [form] = Form.useForm()

  const saveMutation = useMutation({
    mutationFn: (values: any) => editAsset
      ? assetsApi.update(editAsset.id, values)
      : assetsApi.create(tankId!, { ...values, category: 'equipment' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets', tankId] })
      closeModal()
      message.success(editAsset ? '已更新' : '已添加')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '操作失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assetsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets', tankId] }); message.success('已删除') },
    onError: (err: any) => message.error(err.response?.data?.error ?? '删除失败'),
  })

  const openCreate = () => { setEditAsset(null); form.resetFields(); setModalOpen(true) }
  const openEdit = (a: Asset) => {
    setEditAsset(a)
    form.setFieldsValue({ ...a, purchase_date: a.purchase_date ? dayjs(a.purchase_date) : undefined })
    setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditAsset(null); form.resetFields() }
  const handleFinish = (values: any) => {
    saveMutation.mutate({ ...values, category: 'equipment', purchase_date: values.purchase_date?.toISOString() })
  }

  const columns = [
    { title: '设备名称', dataIndex: 'name', key: 'name' },
    {
      title: '设备类型', dataIndex: 'equipment_type', key: 'equipment_type',
      render: (v?: EquipmentType) => v ? <Tag color="orange">{EQUIPMENT_TYPE_LABEL[v]}</Tag> : <Tag>其他</Tag>,
    },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (v: AssetStatus) => <Tag color={STATUS_COLOR[v]}>{EQUIP_STATUS_LABEL[v]}</Tag>,
    },
    {
      title: '购入价', dataIndex: 'purchase_price', key: 'cost', width: 90,
      render: (v?: number) => v != null ? `¥${v}` : '—',
    },
    {
      title: '操作', key: 'actions', width: 110,
      render: (_: any, record: Asset) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<LineChartOutlined />}
            onClick={() => setLogDrawer(record)} title="记录运行参数" />
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="确认删除此设备？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }}
            onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />}
              loading={deleteMutation.isPending && deleteMutation.variables === record.id} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 12, textAlign: 'right' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!tankId}>
          添加设备
        </Button>
      </div>

      {!tankId ? (
        <Empty description="请选择鱼缸" />
      ) : (
        <Table dataSource={assets} columns={columns} rowKey="id" size="middle" pagination={{ pageSize: 20 }} />
      )}

      <Modal
        title={editAsset ? '编辑设备' : '添加设备'}
        open={modalOpen}
        onOk={() => form.validateFields().then(handleFinish).catch(() => {})}
        onCancel={closeModal}
        confirmLoading={saveMutation.isPending}
        okText={editAsset ? '保存' : '添加'} cancelText="取消"
        width={480} destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleFinish}>
          <Form.Item name="name" label="设备名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例：AI Prime 16HD、Maxspect Gyre" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="equipment_type" label="设备类型" initialValue="other">
                <Select options={Object.entries(EQUIPMENT_TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态" initialValue="healthy">
                <Select options={[
                  { value: 'healthy', label: '正常运行' },
                  { value: 'sick',    label: '故障' },
                  { value: 'transferred', label: '已停用' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="purchase_price" label="购入价 (¥)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col span={12}><Form.Item name="purchase_date" label="购入日期"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {logDrawer && (
        <EquipmentLogDrawer asset={logDrawer} onClose={() => setLogDrawer(null)} />
      )}
    </>
  )
}

// ── 设备运行参数记录抽屉 ──────────────────────────────────────────────────────
function EquipmentLogDrawer({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const qc = useQueryClient()
  const [form] = Form.useForm()
  const equipType = (asset.equipment_type ?? 'other') as EquipmentType
  const paramDefs = EQUIPMENT_PARAMS[equipType]

  const { data: logs, isLoading } = useQuery({
    queryKey: ['equipment-logs', asset.id],
    queryFn: () => equipmentLogsApi.list(asset.id),
  })

  const createMutation = useMutation({
    mutationFn: (values: any) => {
      const params: Record<string, unknown> = {}
      for (const p of paramDefs) {
        if (values[p.key] != null && values[p.key] !== '') params[p.key] = values[p.key]
      }
      return equipmentLogsApi.create(asset.id, {
        recorded_at: (values.recorded_at ?? dayjs()).toISOString(),
        params,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment-logs', asset.id] })
      form.resetFields()
      message.success('记录已添加')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '添加失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => equipmentLogsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipment-logs', asset.id] }),
  })

  const columns = [
    { title: '记录时间', dataIndex: 'recorded_at', key: 'time', width: 140,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    ...paramDefs.map(p => ({
      title: p.unit ? `${p.label}(${p.unit})` : p.label,
      key: p.key,
      render: (_: any, r: EquipmentLog) => {
        const v = r.params?.[p.key]
        return v != null ? String(v) : '—'
      },
    })),
    { title: '', key: 'del', width: 48,
      render: (_: any, r: EquipmentLog) => (
        <Popconfirm title="确认删除？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }}
          onConfirm={() => deleteMutation.mutate(r.id)}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <Drawer
      title={`运行参数记录 — ${asset.name}（${EQUIPMENT_TYPE_LABEL[equipType]}）`}
      open
      onClose={onClose}
      width={560}
    >
      <Form form={form} layout="inline" style={{ marginBottom: 16, gap: 8, flexWrap: 'wrap' }}
        onFinish={(v) => createMutation.mutate(v)}>
        <Form.Item name="recorded_at" initialValue={dayjs()} style={{ margin: 0 }}>
          <DatePicker showTime={{ format: 'HH:mm' }} format="MM-DD HH:mm" style={{ width: 150 }} />
        </Form.Item>
        {paramDefs.map(p => (
          <Form.Item key={p.key} name={p.key} style={{ margin: 0 }}>
            {p.inputType === 'text'
              ? <Input placeholder={p.label} style={{ width: 110 }} />
              : <InputNumber placeholder={p.unit ? `${p.label}(${p.unit})` : p.label} min={0} step={0.1} style={{ width: 130 }} />
            }
          </Form.Item>
        ))}
        <Form.Item style={{ margin: 0 }}>
          <Button type="primary" htmlType="submit" loading={createMutation.isPending} icon={<PlusOutlined />}>
            添加
          </Button>
        </Form.Item>
      </Form>

      <Table
        dataSource={logs}
        columns={columns}
        rowKey="id"
        size="small"
        loading={isLoading}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        scroll={{ x: 'max-content' }}
      />
    </Drawer>
  )
}
