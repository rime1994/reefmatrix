// Assets/index.tsx 资产追踪页面
import { useState, useEffect } from 'react'
import { Select, Card, Row, Col, Table, Tag, Statistic, Button, Empty, Modal, Form, Input, InputNumber, DatePicker, Popconfirm, Space, message } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { tanksApi } from '@/api/tanks'
import { assetsApi } from '@/api/assets'
import type { Asset, AssetCategory, AssetStatus } from '@/types'

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

export default function AssetsPage() {
  const qc = useQueryClient()
  const [tankId, setTankId] = useState<string>()
  const [modalOpen, setModalOpen] = useState(false)
  const [editAsset, setEditAsset] = useState<Asset | null>(null) // null = 新建，非 null = 编辑
  const [form] = Form.useForm()

  const { data: tanks } = useQuery({ queryKey: ['tanks'], queryFn: tanksApi.list })

  // TanStack Query v5 无 onSuccess，用 useEffect 初始化选中缸
  useEffect(() => {
    if (tanks?.length && !tankId) setTankId(tanks[0].id)
  }, [tanks])

  const { data: assets, isLoading } = useQuery({
    queryKey: ['assets', tankId],
    queryFn: () => assetsApi.list(tankId!),
    enabled: !!tankId,
  })

  const createMutation = useMutation({
    mutationFn: (values: any) => assetsApi.create(tankId!, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets', tankId] })
      closeModal()
      message.success('资产已添加')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '添加失败'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: any }) => assetsApi.update(id, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets', tankId] })
      closeModal()
      message.success('资产已更新')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '更新失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assetsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets', tankId] })
      message.success('资产已删除')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '删除失败'),
  })

  const openCreate = () => {
    setEditAsset(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (asset: Asset) => {
    setEditAsset(asset)
    form.setFieldsValue({
      ...asset,
      purchase_date: asset.purchase_date ? dayjs(asset.purchase_date) : undefined,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditAsset(null)
    form.resetFields()
  }

  const handleFinish = (values: any) => {
    const payload = {
      ...values,
      purchase_date: values.purchase_date?.toISOString(),
    }
    if (editAsset) {
      updateMutation.mutate({ id: editAsset.id, values: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  // 估值优先于购入价计算总额
  const totalValue = assets?.reduce((s, a) => s + (a.current_value ?? a.purchase_price ?? 0) * a.quantity, 0) ?? 0
  const totalCost  = assets?.reduce((s, a) => s + (a.purchase_price ?? 0) * a.quantity, 0) ?? 0

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '类型', dataIndex: 'category', key: 'category',
      render: (v: AssetCategory) => <Tag color={CATEGORY_COLOR[v]}>{CATEGORY_LABEL[v]}</Tag>,
    },
    { title: '数量', dataIndex: 'quantity', key: 'qty' },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (v: AssetStatus) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag>,
    },
    {
      title: '购入价', dataIndex: 'purchase_price', key: 'cost',
      render: (v?: number) => v != null ? `¥${v}` : '—',
    },
    {
      title: '当前估值', dataIndex: 'current_value', key: 'val',
      render: (v?: number) => v != null ? `¥${v}` : '—',
    },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_: any, record: Asset) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          />
          <Popconfirm
            title="确认删除此资产？"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={deleteMutation.isPending && deleteMutation.variables === record.id}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div>
      {/* 顶部控制栏 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <Select
          style={{ minWidth: 160 }}
          value={tankId}
          onChange={setTankId}
          options={tanks?.map(t => ({ value: t.id, label: t.name }))}
          placeholder="选择鱼缸"
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreate}
          disabled={!tankId}
        >
          添加资产
        </Button>
      </div>

      {/* 汇总统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} md={6}>
          <Card><Statistic title="资产总数" value={assets?.length ?? 0} suffix="项" /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="生物数量"
              value={assets?.filter(a => a.category !== 'equipment').reduce((s, a) => s + a.quantity, 0) ?? 0}
              suffix="只/株"
            />
          </Card>
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

      {/* 资产明细表格 */}
      <Card>
        {!tankId ? (
          <Empty description="请选择鱼缸" />
        ) : (
          <Table
            dataSource={assets}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            size="middle"
            pagination={{ pageSize: 20 }}
          />
        )}
      </Card>

      {/* 新建 / 编辑资产弹窗 */}
      <Modal
        title={editAsset ? '编辑资产' : '添加资产'}
        open={modalOpen}
        onOk={() => form.validateFields().then(handleFinish).catch(() => {})}
        onCancel={closeModal}
        confirmLoading={isSaving}
        okText={editAsset ? '保存' : '添加'}
        cancelText="取消"
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleFinish}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="category" label="类型" rules={[{ required: true }]}>
                <Select options={Object.entries(CATEGORY_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
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
            <Col span={8}>
              <Form.Item name="quantity" label="数量" initialValue={1}>
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="purchase_price" label="购入价 (¥)">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="current_value" label="当前估值 (¥)">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="purchase_date" label="购入日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
