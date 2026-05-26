// Dashboard/index.tsx 水质趋势看板 + 鱼缸管理
import { useState, useEffect, useMemo } from 'react'
import {
  Select, Card, Row, Col, Spin, Empty, Tag, Button, Modal, Form,
  Input, InputNumber, DatePicker, message, Drawer, Table, Popconfirm,
  Tooltip, Space, Upload, Alert, Cascader, Divider, Tabs,
} from 'antd'
import type { UploadFile } from 'antd'
import {
  PlusOutlined, CheckCircleFilled, CloseCircleFilled, MinusCircleFilled,
  DeleteOutlined, UnorderedListOutlined, EditOutlined, ExclamationCircleOutlined,
  DownloadOutlined, UploadOutlined, InboxOutlined,
  CheckOutlined, DropboxOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, ReferenceArea, ReferenceLine,
} from 'recharts'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { tanksApi } from '@/api/tanks'
import { parametersApi } from '@/api/parameters'
import { equipmentApi } from '@/api/equipment'
import type { EquipmentTuningLog, UpdateEquipmentInput } from '@/api/equipment'
import type { TableColumnsType } from 'antd'
import {
  PARAMETER_META, TANK_TYPE_RANGES,
  type ParameterKey, type WaterParameter, type Tank, type TankType,
} from '@/types'

dayjs.extend(relativeTime)

// ── 设备参数展示辅助（常量，不随 API 变化）─────────────────────────────────
/** 级联选择器选项：通道类型 → 具体添加剂 */
const DOSING_CASCADE_OPTIONS = [
  {
    value: 'KH',
    label: 'KH',
    children: [
      { value: 'KH - 碳酸氢钠', label: '碳酸氢钠（NaHCO₃）' },
    ],
  },
  {
    value: 'Ca',
    label: 'Ca',
    children: [
      { value: 'Ca - 无水氯化钙', label: '无水氯化钙（CaCl₂）' },
    ],
  },
  {
    value: 'Mg',
    label: 'Mg',
    children: [
      { value: 'Mg - 无水氯化镁',   label: '无水氯化镁（MgCl₂）' },
      { value: 'Mg - 六合水氯化镁', label: '六合水氯化镁（MgCl₂·6H₂O）' },
    ],
  },
]

/** 滴定通道草稿（编辑态本地状态） */
interface DosingDraftRow {
  channel_name:   string
  dose_g_per_time: number
  times_per_day:  number
  isNew?:         boolean  // 新增行（保存前尚未持久化）
}
/** 钙反字段名 → 中文显示（含设备级汇总键） */
const CR_PARAM_LABELS: Record<string, string> = {
  calcium_reactor: '调参',   // 多字段汇总日志的 param_name
  flow_rate:       '出水流速',
  target_ph:       '目标 pH',
  outlet_kh:       '出水 KH',
}
/** 钙反字段名 → 显示单位（汇总日志单位内嵌在 new_value 中，此处为空） */
const CR_PARAM_UNITS: Record<string, string> = {
  calcium_reactor: '', // 汇总日志：单位已含在 new_value 字符串内
  flow_rate:       'ml/min',
  target_ph:       '',
  outlet_kh:       'dKH',
}

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
  if (status === 'safe') return <CheckCircleFilled style={{ color: '#22c55e', fontSize: 12 }} />
  if (status === 'warn') return <CloseCircleFilled style={{ color: '#ef4444', fontSize: 12 }} />
  return <MinusCircleFilled style={{ color: '#cbd5e1', fontSize: 12 }} />
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
  const [importModalOpen, setImportModal] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult]   = useState<{ imported: number; skipped: number; errors: number; details: string[] } | null>(null)
  const [importFile, setImportFile]       = useState<File | null>(null)
  const [importFileList, setImportFileList] = useState<UploadFile[]>([])
  // 设备运行参数编辑态
  const [equipEditing, setEquipEditing]       = useState(false)
  const [equipCRDraft, setEquipCRDraft]       = useState<Record<string, number>>({})
  const [dosingDraft, setDosingDraft]         = useState<DosingDraftRow[]>([])
  const [addChannelKey, setAddChannelKey]     = useState<string[] | null>(null) // 级联选中值
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

  // 设备运行参数（钙反 + 滴定泵）
  const { data: equipData } = useQuery({
    queryKey: ['equipment', tankId],
    queryFn: () => equipmentApi.getEquipment(tankId!),
    enabled: !!tankId,
  })

  // 调参历史日志（图表联动 + 事件区）
  const { data: tuningLogsData } = useQuery({
    queryKey: ['equipment-tuning-logs', tankId],
    queryFn: () => equipmentApi.getTuningLogs(tankId!, 50),
    enabled: !!tankId,
  })
  const tuningLogs: EquipmentTuningLog[] = tuningLogsData?.logs ?? []

  // 调参日期 → 当天所有日志（key: "MM-DD"），支持同日多条（钙反+滴定各一条）
  const tuningAnnoGroups = useMemo(() => {
    const groups: Record<string, EquipmentTuningLog[]> = {}
    for (const log of tuningLogs) {
      const day = dayjs(log.changed_at).format('MM-DD')
      if (!groups[day]) groups[day] = []
      groups[day].push(log)
    }
    return groups
  }, [tuningLogs])

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

  // 最近 5 条有操作记录的水质条目
  const recentOperations = useMemo(() =>
    (recentParams ?? []).filter(p => p.notes?.trim()).slice(0, 5),
    [recentParams]
  )

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

  const deleteTuningLogMutation = useMutation({
    mutationFn: ({ tid, logId }: { tid: string; logId: string }) =>
      equipmentApi.deleteTuningLog(tid, logId),
    onSuccess: (_data, { tid }) => {
      qc.invalidateQueries({ queryKey: ['equipment-tuning-logs', tid] })
      message.success('调参记录已删除')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? err?.message ?? '删除失败，请重试'
      message.error(msg)
    },
  })

  const updateEquipmentMutation = useMutation({
    mutationFn: (input: UpdateEquipmentInput) => equipmentApi.updateEquipment(tankId!, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment', tankId] })
      qc.invalidateQueries({ queryKey: ['equipment-tuning-logs', tankId] })
      setEquipEditing(false)
      setEquipCRDraft({})
      setDosingDraft([])
      setAddChannelKey(null)
      message.success('调参已保存')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '保存失败'),
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

  const handleExport = async () => {
    if (!tankId) return
    try {
      const blob = await parametersApi.exportCsv(tankId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reefmatrix_${currentTank?.name ?? tankId}_${dayjs().format('YYYYMMDD')}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      message.error('导出失败，请稍后重试')
    }
  }

  const openImportModal = () => {
    setImportResult(null)
    setImportFile(null)
    setImportFileList([])
    setImportModal(true)
  }

  const handleImport = async () => {
    if (!tankId || !importFile) { message.warning('请先选择 CSV 文件'); return }
    setImportLoading(true)
    try {
      const result = await parametersApi.importCsv(tankId, importFile)
      setImportResult(result)
      // 不在这里刷新：Modal 还在更新状态时同步触发 invalidate 会导致白屏
      // 改为点击「完成」关闭弹窗后再刷新
    } catch (err: any) {
      message.error(err.response?.data?.error ?? '导入失败，请检查文件格式')
    } finally {
      setImportLoading(false)
    }
  }

  const chartData = parameters
    ?.filter(p => PARAMS.some(k => p[k as keyof WaterParameter] != null))
    .map(p => ({
      time: dayjs(p.recorded_at).format('MM-DD HH:mm'),
      salinity: p.salinity, temperature: p.temperature, ph: p.ph,
      kh: p.kh, ca: p.ca, mg: p.mg, no3: p.no3, po4: p.po4,
    })) ?? []

  // 调参日期 → 图表中实际存在的 x 值（"MM-DD" → "MM-DD HH:mm"）
  // ReferenceLine 的 x 必须精确匹配 chartData[i].time，否则不渲染
  const tuningChartXMap = useMemo(() => {
    const result: Record<string, string> = {}
    for (const day of Object.keys(tuningAnnoGroups)) {
      const match = chartData.find(d => d.time.startsWith(day))
      if (match) result[day] = match.time
    }
    return result
  }, [tuningAnnoGroups, chartData])

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

  // 调参记录列（兼容新格式 device_type='equipment' 和旧格式）
  const tuningColumns: TableColumnsType<EquipmentTuningLog> = [
    { title: '时间', dataIndex: 'changed_at', key: 'changed_at', width: 140,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    { title: '类型', dataIndex: 'device_type', key: 'device_type', width: 72,
      render: (v: string) => {
        if (v === 'equipment')        return <Tag color="purple" style={{ margin: 0 }}>调参</Tag>
        if (v === 'calcium_reactor')  return <Tag color="gold"   style={{ margin: 0 }}>钙反</Tag>
        return                               <Tag color="blue"   style={{ margin: 0 }}>滴定</Tag>
      } },
    { title: '变更内容', key: 'changes', render: (_: any, r: EquipmentTuningLog) => (
        <div style={{ fontSize: 12 }}>
          {r.old_value && (
            <span style={{ color: '#94a3b8' }}>{r.old_value} → </span>
          )}
          <span style={{ fontWeight: 600, color: '#0c4a6e' }}>{r.new_value}</span>
        </div>
      ) },
    { title: '', key: 'action', width: 48, fixed: 'right' as const,
      render: (_: any, record: EquipmentTuningLog) => (
        <Popconfirm
          title="确认删除这条调参记录？"
          onConfirm={() => {
            if (!tankId || !record.id) { message.error('数据异常，无法删除'); return }
            deleteTuningLogMutation.mutate({ tid: tankId, logId: record.id })
          }}
        >
          <Button type="link" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ) },
  ]

  // 操作记录列（WaterParameter 中有 notes 的条目）
  const operationColumns: TableColumnsType<WaterParameter> = [
    { title: '时间', dataIndex: 'recorded_at', key: 'recorded_at', width: 140,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    { title: '操作记录', dataIndex: 'notes', key: 'notes',
      render: (v: string) => <span style={{ color: '#0c4a6e' }}>{v}</span> },
    { title: '', key: 'action', width: 48, fixed: 'right' as const,
      render: (_: any, record: WaterParameter) => (
        <Popconfirm title="确认删除这条操作记录？" onConfirm={() => deleteParamMutation.mutate(record.id)}>
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
    <div style={{ background: '#f0f9ff', margin: '-24px', padding: '24px', minHeight: 'calc(100vh - 64px)' }}>
      {contextHolder}

      {/* 顶部控制栏 */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center',
        background: '#ffffff', borderRadius: 14, padding: '10px 16px',
        boxShadow: '0 1px 4px rgba(12,74,110,0.08)', border: '1px solid #e0f2fe',
      }}>
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
          <Tooltip title="导出 CSV">
            <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={!tankId} />
          </Tooltip>
          <Tooltip title="导入 CSV">
            <Button icon={<UploadOutlined />} onClick={openImportModal} disabled={!tankId} />
          </Tooltip>
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
                style={{
                  textAlign: 'center',
                  borderRadius: 12,
                  border: '1px solid #e0f2fe',
                  borderTop: `3px solid ${status === 'warn' ? '#ef4444' : status === 'safe' ? meta.color : '#e2e8f0'}`,
                  boxShadow: '0 1px 4px rgba(12,74,110,0.07)',
                  background: '#ffffff',
                  overflow: 'hidden',
                  transition: 'box-shadow 0.2s, transform 0.2s',
                  cursor: 'pointer',
                }}
                styles={{ body: { padding: '10px 8px' } }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <span style={{ color: '#64748b', fontSize: 11, fontWeight: 500, letterSpacing: 0.2 }}>{meta.label}</span>
                  <Tooltip title={tooltipText}><StatusIcon status={status} /></Tooltip>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: entry ? meta.color : '#94a3b8', whiteSpace: 'nowrap', lineHeight: 1.2, marginBottom: 2 }}>
                  {entry ? entry.value : '—'}
                  {entry && meta.unit && (
                    <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2, opacity: 0.75 }}>{meta.unit}</span>
                  )}
                </div>
                <div style={{ color: '#94a3b8', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {min}–{max}{meta.unit ? ' ' + meta.unit : ''}
                </div>
                <div style={{ color: '#94a3b8', fontSize: 10, minHeight: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
                  {entry ? dayjs(entry.recordedAt).fromNow() : ' '}
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

      {/* ── 设备运行参数 + 事件日志（单张卡，灰线分隔三区）─────────────────── */}
      <Card
        size="small"
        style={{ borderRadius: 14, border: '1px solid #e0f2fe', boxShadow: '0 1px 4px rgba(12,74,110,0.07)', marginBottom: 12 }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        {/* ① 卡头 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontWeight: 600, color: '#0c4a6e', fontSize: 14 }}>设备运行参数</span>
          <button
            onClick={() => {
              if (equipEditing) {
                const cr = equipData?.calcium_reactor
                const input: UpdateEquipmentInput = {}
                if (cr || Object.keys(equipCRDraft).length > 0) {
                  input.calcium_reactor = {
                    flow_rate: equipCRDraft.flow_rate ?? cr?.flow_rate ?? null,
                    target_ph: equipCRDraft.target_ph ?? cr?.target_ph ?? null,
                    outlet_kh: equipCRDraft.outlet_kh ?? cr?.outlet_kh ?? null,
                  }
                }
                // 始终发送完整通道列表（即使为空数组），后端据此做全量同步（含删除）
                input.dosing_channels = dosingDraft.map(d => ({
                  channel_name:    d.channel_name,
                  dose_g_per_time: d.dose_g_per_time,
                  times_per_day:   d.times_per_day,
                }))
                updateEquipmentMutation.mutate(input)
              } else {
                const rows: DosingDraftRow[] = (equipData?.dosing_channels ?? []).map(ch => ({
                  channel_name:    ch.channel_name,
                  dose_g_per_time: ch.dose_g_per_time,
                  times_per_day:   ch.times_per_day,
                }))
                setDosingDraft(rows)
                setAddChannelKey(null)
                setEquipEditing(true)
              }
            }}
            style={{
              border: `1px solid ${equipEditing ? '#22c55e' : '#e0f2fe'}`,
              background: equipEditing ? '#f0fdf4' : 'transparent',
              color: equipEditing ? '#16a34a' : '#64748b',
              cursor: 'pointer', borderRadius: 8, padding: '4px 12px',
              fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5,
              opacity: updateEquipmentMutation.isPending ? 0.6 : 1,
            }}
            disabled={updateEquipmentMutation.isPending}
          >
            {equipEditing
              ? <><CheckOutlined style={{ fontSize: 11 }} />{updateEquipmentMutation.isPending ? '保存中…' : '保存调参'}</>
              : <><EditOutlined style={{ fontSize: 11 }} />调参</>}
          </button>
        </div>

        {/* ② 钙反 | 滴定泵 两列 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 20, alignItems: 'start' }}>

          {/* 钙反 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <DropboxOutlined style={{ color: '#f59e0b', fontSize: 13 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>钙反（Calcium Reactor）</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {(['flow_rate', 'target_ph', 'outlet_kh'] as const).map(field => {
                const apiVal = equipData?.calcium_reactor?.[field] ?? null
                const displayVal = equipCRDraft[field] ?? apiVal
                return (
                  <div key={field} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ color: '#92400e', fontSize: 10, marginBottom: 6 }}>{CR_PARAM_LABELS[field]}</div>
                    {equipEditing ? (
                      <input
                        type="number"
                        step={field === 'target_ph' ? 0.1 : 1}
                        value={displayVal ?? ''}
                        onChange={e => setEquipCRDraft(d => ({ ...d, [field]: Number(e.target.value) }))}
                        style={{ width: '100%', textAlign: 'center', fontSize: 17, fontWeight: 700, border: '1px solid #f59e0b', borderRadius: 6, padding: '2px 4px', color: '#f59e0b', background: '#fff' }}
                      />
                    ) : (
                      <div style={{ fontSize: 22, fontWeight: 700, color: displayVal != null ? '#f59e0b' : '#cbd5e1' }}>
                        {displayVal != null ? displayVal : '—'}
                        {displayVal != null && CR_PARAM_UNITS[field] && <span style={{ fontSize: 10, color: '#d97706', marginLeft: 2 }}>{CR_PARAM_UNITS[field]}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 竖分隔 */}
          <div style={{ width: 1, background: '#e2e8f0', alignSelf: 'stretch', minHeight: 80 }} />

          {/* 滴定泵 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <ThunderboltOutlined style={{ color: '#0ea5e9', fontSize: 13 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#0ea5e9' }}>滴定泵（Dosing Pump）</span>
            </div>

            {/* 查看态：channel / dose_g_per_time g/次 × times_per_day次 */}
            {!equipEditing && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(equipData?.dosing_channels ?? []).length === 0 ? (
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>暂无滴定通道，点击「调参」添加</span>
                ) : (equipData?.dosing_channels ?? []).map(ch => (
                  <div key={ch.channel_name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ color: '#0c4a6e', fontWeight: 500, minWidth: 120 }}>{ch.channel_name}</span>
                    <span style={{ color: '#0ea5e9', fontWeight: 700 }}>{ch.dose_g_per_time}</span>
                    <span style={{ color: '#94a3b8', fontSize: 11 }}>g/次</span>
                    <span style={{ color: '#cbd5e1', fontSize: 11 }}>×</span>
                    <span style={{ color: '#0ea5e9', fontWeight: 700 }}>{ch.times_per_day}</span>
                    <span style={{ color: '#94a3b8', fontSize: 11 }}>次/day</span>
                    <span style={{ color: '#e2e8f0', fontSize: 11 }}>=</span>
                    <span style={{ color: '#64748b', fontSize: 11 }}>{(ch.dose_g_per_time * ch.times_per_day).toFixed(2)} g/day</span>
                  </div>
                ))}
              </div>
            )}

            {/* 编辑态：每行可修改 + 删除，底部级联添加 */}
            {equipEditing && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dosingDraft.map((row, idx) => (
                  <div key={row.channel_name} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ color: '#0c4a6e', fontSize: 12, minWidth: 120, fontWeight: row.isNew ? 600 : 400 }}>
                      {row.channel_name}
                      {row.isNew && <Tag color="blue" style={{ marginLeft: 4, fontSize: 10 }}>新</Tag>}
                    </span>
                    <input
                      type="number" step={0.001} min={0}
                      value={row.dose_g_per_time}
                      onChange={e => setDosingDraft(ds => ds.map((d, i) => i === idx ? { ...d, dose_g_per_time: Number(e.target.value) } : d))}
                      style={{ width: 60, textAlign: 'center', fontWeight: 700, border: '1px solid #0ea5e9', borderRadius: 6, fontSize: 13, color: '#0ea5e9', padding: '2px 4px' }}
                    />
                    <span style={{ color: '#94a3b8', fontSize: 11 }}>g/次</span>
                    <span style={{ color: '#cbd5e1' }}>×</span>
                    <input
                      type="number" step={1} min={1}
                      value={row.times_per_day}
                      onChange={e => setDosingDraft(ds => ds.map((d, i) => i === idx ? { ...d, times_per_day: Math.max(1, Number(e.target.value)) } : d))}
                      style={{ width: 44, textAlign: 'center', fontWeight: 700, border: '1px solid #0ea5e9', borderRadius: 6, fontSize: 13, color: '#0ea5e9', padding: '2px 4px' }}
                    />
                    <span style={{ color: '#94a3b8', fontSize: 11 }}>次/day</span>
                    <button
                      onClick={() => setDosingDraft(ds => ds.filter((_, i) => i !== idx))}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#fca5a5', padding: '0 2px', fontSize: 13, lineHeight: 1 }}
                      title="删除通道"
                    >×</button>
                  </div>
                ))}

                {/* 级联添加通道 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  <Cascader
                    options={DOSING_CASCADE_OPTIONS}
                    value={addChannelKey ?? undefined}
                    onChange={v => setAddChannelKey(v as string[])}
                    placeholder="选择通道类型 / 添加剂"
                    size="small"
                    style={{ minWidth: 200 }}
                    displayRender={labels => labels.join(' · ')}
                  />
                  <Button
                    size="small"
                    type="dashed"
                    icon={<PlusOutlined />}
                    disabled={!addChannelKey || addChannelKey.length < 2}
                    onClick={() => {
                      if (!addChannelKey || addChannelKey.length < 2) return
                      const channelName = addChannelKey[1]
                      if (dosingDraft.some(d => d.channel_name === channelName)) {
                        message.warning(`通道「${channelName}」已存在`)
                        return
                      }
                      setDosingDraft(ds => [...ds, { channel_name: channelName, dose_g_per_time: 0, times_per_day: 1, isNew: true }])
                      setAddChannelKey(null)
                    }}
                  >
                    添加
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ③ 灰线分隔 */}
        <Divider style={{ borderColor: '#e2e8f0', margin: '14px 0' }} />

        {/* ④ 事件与操作日志（左：调参时间轴 | 右：近期操作记录） */}
        <Row gutter={[20, 12]}>
          {/* 左：调参时间轴（最新3条，不滚动） */}
          <Col xs={24} lg={12} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>调参记录</div>
            <div style={{ position: 'relative', paddingLeft: 20 }}>
              <div style={{ position: 'absolute', left: 7, top: 0, bottom: 4, width: 2, background: 'linear-gradient(to bottom, #f59e0b, #0ea5e9)', borderRadius: 1 }} />
              {tuningLogs.length === 0 ? (
                <div style={{ color: '#bfbfbf', fontSize: 13, paddingTop: 20 }}>暂无调参记录，调参后将自动显示</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tuningLogs.slice(0, 3).map(log => {
                    // device_type: 'equipment'=新批量格式, 'calcium_reactor'/'dosing_pump'=旧格式兼容
                    const isBatch = log.device_type === 'equipment'
                    const isCR    = log.device_type === 'calcium_reactor'
                    const dotColor = isBatch ? '#8b5cf6' : isCR ? '#f59e0b' : '#0ea5e9'
                    const tagColor = isBatch ? 'purple'  : isCR ? 'gold'    : 'blue'
                    const tagText  = isBatch ? '调参'    : isCR ? '钙反'    : '滴定'
                    // 旧格式有字段级 label；新批量格式 new_value 已含全部信息，label 不再展示
                    const fieldLabel = isBatch ? '' : isCR
                      ? (CR_PARAM_LABELS[log.param_name] ?? log.param_name)
                      : log.param_name
                    return (
                      <div key={log.id} style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ position: 'absolute', left: -17, top: 5, width: 8, height: 8, borderRadius: '50%', background: dotColor, border: '2px solid #fff', boxShadow: `0 0 0 1px ${dotColor}` }} />
                        <div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 1 }}>{dayjs(log.changed_at).format('MM-DD HH:mm')}</div>
                          <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                            <Tag color={tagColor} style={{ margin: 0, fontSize: 10 }}>{tagText}</Tag>
                            {fieldLabel && <span style={{ color: '#64748b' }}>{fieldLabel}</span>}
                            {log.old_value && <><span style={{ color: '#94a3b8' }}>{log.old_value}</span><span style={{ color: '#94a3b8' }}>→</span></>}
                            <span style={{ color: '#0c4a6e', fontWeight: 600 }}>{log.new_value}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Col>

          {/* 右：近期操作记录 */}
          <Col xs={24} lg={12} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>近期操作记录</div>
            <div>
              {recentOperations.length === 0 ? (
                <div style={{ color: '#bfbfbf', fontSize: 13, paddingTop: 20 }}>暂无操作记录，录入水质时可填写当天操作</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentOperations.map(p => (
                    <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ color: '#94a3b8', fontSize: 11, whiteSpace: 'nowrap', minWidth: 90, fontVariantNumeric: 'tabular-nums' }}>
                        {dayjs(p.recorded_at).format('MM-DD HH:mm')}
                      </span>
                      <span style={{ fontSize: 13, color: '#0c4a6e', flex: 1, lineHeight: 1.5 }}>{p.notes}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Col>
        </Row>
      </Card>


      {/* ── 参数趋势图（操作记录已移至上方事件区，图表从此开始）─────────────── */}
      {paramsLoading ? (
        <Spin style={{ display: 'block', margin: '40px auto' }} />
      ) : (
        <Row gutter={[12, 12]}>
          {/* 折线图：无数据时显示引导，有数据时按选中参数渲染 */}
          {chartData.length === 0 ? (
            <Col xs={24} lg={12}>
              <Card>
                <Empty description="暂无水质记录">
                  <Button type="primary" onClick={openParamModal}>录入第一条数据</Button>
                </Empty>
              </Card>
            </Col>
          ) : selectedParams.map(key => {
            const meta = PARAMETER_META[key]
            const [safeMin, safeMax] = TANK_TYPE_RANGES[tankType][key]

            // 自适应 Y 轴：数据范围 + 安全区间取并集，再加 30% padding
            const vals = chartData
              .map(d => (d as any)[key] as number | undefined)
              .filter((v): v is number => v != null)
            const dataMin = vals.length ? Math.min(...vals) : safeMin
            const dataMax = vals.length ? Math.max(...vals) : safeMax
            const lo = Math.min(dataMin, safeMin)
            const hi = Math.max(dataMax, safeMax)
            const pad = (hi - lo) * 0.3 || safeMax * 0.05
            const yMin = parseFloat((lo - pad).toFixed(6))
            const yMax = parseFloat((hi + pad).toFixed(6))

            return (
              <Col key={key} xs={24} lg={12}>
                <Card
                  size="small"
                  style={{ borderRadius: 12, border: '1px solid #e0f2fe', boxShadow: '0 1px 4px rgba(12,74,110,0.07)' }}
                  title={
                    <span style={{ color: meta.color, fontWeight: 600, fontSize: 13 }}>
                      {meta.label}{meta.unit ? ` (${meta.unit})` : ''}
                    </span>
                  }
                >
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={meta.color} stopOpacity={0.18} />
                          <stop offset="95%" stopColor={meta.color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={42} domain={[yMin, yMax]} axisLine={false} tickLine={false} />
                      {/* 调参增强 tooltip：hover 至调参日期时追加调参详情 */}
                      <ReTooltip
                        content={(props: any) => <HwTooltip {...props} paramColor={meta.color} />}
                        cursor={{ stroke: meta.color, strokeWidth: 1, strokeDasharray: '4 2', strokeOpacity: 0.5 }}
                      />
                      {/* 安全区间外：淡红背景 */}
                      <ReferenceArea y1={safeMax} y2={9999} fill="rgba(239,68,68,0.06)" ifOverflow="hidden" />
                      <ReferenceArea y1={-9999} y2={safeMin} fill="rgba(239,68,68,0.06)" ifOverflow="hidden" />
                      {/* 调参事件竖线：x 必须匹配 chartData 中真实存在的 time 值
                            同日双改：两根叠加线互补 dashOffset → 交替琥珀/蓝虚线 */}
                      {Object.entries(tuningChartXMap).map(([day, actualX]) => {
                        const logs = tuningAnnoGroups[day] ?? []
                        const hasCR     = logs.some(l => l.device_type === 'calcium_reactor')
                        const hasDosing = logs.some(l => l.device_type === 'dosing_pump')
                        const both = hasCR && hasDosing
                        if (both) {
                          // 双色交替虚线：周期18px(6填+12空)，蓝线 offset=9 落在间隙中央
                          // 效果：██████░░░██████░░░ (琥珀6 间隙3 蓝6 间隙3)
                          return [
                            <ReferenceLine key={`${day}-cr`} x={actualX}
                              stroke="#f59e0b" strokeDasharray="6 12"
                              strokeWidth={1.5} opacity={0.8} />,
                            <ReferenceLine key={`${day}-dp`} x={actualX}
                              stroke="#0ea5e9" strokeDasharray="6 12" strokeDashoffset="9"
                              strokeWidth={1.5} opacity={0.8} />,
                          ]
                        }
                        return (
                          <ReferenceLine key={day} x={actualX}
                            stroke={hasCR ? '#f59e0b' : '#0ea5e9'}
                            strokeDasharray="4 3"
                            strokeWidth={1.5} opacity={0.7}
                          />
                        )
                      })}
                      <Area
                        type="monotone"
                        dataKey={key}
                        stroke={meta.color}
                        fill={`url(#grad-${key})`}
                        dot={(props: any) => {
                          const { cx, cy, value, key: k, payload } = props
                          if (value == null || cx == null || cy == null) return <circle key={k} r={0} />
                          const isAbnormal = value < safeMin || value > safeMax
                          // payload.time 格式 "MM-DD HH:mm"，取前5字符得 "MM-DD" 做 lookup
                          const dayKey = (payload?.time as string | undefined)?.slice(0, 5) ?? ''
                          const annoLogs = tuningAnnoGroups[dayKey]
                          const isAnnotated = !!annoLogs?.length
                          // 调参事件数据点放大（r=4.5），有 CR 日志 → 琥珀，纯滴定 → 蓝
                          if (isAnnotated) {
                            const hasCR = annoLogs.some(l => l.device_type === 'calcium_reactor')
                            return (
                              <circle key={k} cx={cx} cy={cy} r={4.5}
                                fill={hasCR ? '#f59e0b' : '#0ea5e9'}
                                stroke="#fff" strokeWidth={1.5} />
                            )
                          }
                          return (
                            <circle key={k} cx={cx} cy={cy} r={2.5}
                              fill={isAbnormal ? '#ef4444' : '#22c55e'} strokeWidth={0} />
                          )
                        }}
                        strokeWidth={2}
                        connectNulls
                      />
                    </AreaChart>
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
          <span style={{ color: '#64748b', fontSize: 12, fontWeight: 500, marginRight: 4 }}>日间变化</span>
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
          <Form.Item name="notes" label="操作记录">
            <Input.TextArea rows={2} placeholder="换水 20%、添加碳源、发现珊瑚掉色…" />
          </Form.Item>
        </Form>
      </Modal>

      {/* CSV 导入弹窗 */}
      <Modal
        title="导入水质记录"
        open={importModalOpen}
        onCancel={() => {
          setImportModal(false)
          if (importResult && importResult.imported > 0) {
            qc.invalidateQueries({ queryKey: ['parameters'] })
          }
        }}
        footer={
          importResult ? (
            <Button type="primary" onClick={() => {
              setImportModal(false)
              // Modal 关闭后再刷新数据，避免并发 state 更新导致白屏
              if (importResult && importResult.imported > 0) {
                qc.invalidateQueries({ queryKey: ['parameters'] })
              }
            }}>完成</Button>
          ) : (
            <Space>
              <Button onClick={() => setImportModal(false)}>取消</Button>
              <Button
                type="primary"
                loading={importLoading}
                disabled={!importFile}
                onClick={handleImport}
              >
                开始导入
              </Button>
            </Space>
          )
        }
        width={480}
      >
        {importResult ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Alert
              type={importResult.errors > 0 ? 'warning' : 'success'}
              message={
                <span>
                  导入完成：<strong style={{ color: '#52c41a' }}>{importResult.imported} 条成功</strong>
                  {importResult.skipped > 0 && <span>，{importResult.skipped} 条重复跳过</span>}
                  {importResult.errors > 0 && <span style={{ color: '#ff4d4f' }}>，{importResult.errors} 条失败</span>}
                </span>
              }
              showIcon
            />
            {importResult.details.length > 0 && (
              <div style={{ background: '#fafafa', borderRadius: 6, padding: 12 }}>
                <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 4 }}>错误详情（最多显示 5 条）</div>
                {importResult.details.map((d, i) => (
                  <div key={i} style={{ color: '#ff4d4f', fontSize: 12 }}>{d}</div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <Upload.Dragger
              accept=".csv"
              maxCount={1}
              fileList={importFileList}
              beforeUpload={(file) => {
                setImportFile(file)
                setImportFileList([file as any])
                return false // 阻止自动上传
              }}
              onRemove={() => { setImportFile(null); setImportFileList([]) }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽 CSV 文件到此区域</p>
              <p className="ant-upload-hint" style={{ fontSize: 12 }}>
                仅支持 .csv 格式，列顺序不限，必须包含 recorded_at 列。<br />
                相同时间的记录会自动跳过（去重）。
              </p>
            </Upload.Dragger>
          </div>
        )}
      </Modal>

      {/* 记录管理抽屉 */}
      <Drawer
        title="记录管理"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={960}
      >
        <Tabs
          defaultActiveKey="params"
          items={[
            {
              key: 'params',
              label: '水质记录',
              children: (
                <>
                  <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button type="primary" icon={<PlusOutlined />}
                      onClick={() => { setDrawerOpen(false); openParamModal() }}>
                      录入新数据
                    </Button>
                  </div>
                  <Table
                    dataSource={recentParams}
                    columns={recordColumns}
                    rowKey="id"
                    size="small"
                    scroll={{ x: 900 }}
                    pagination={{ pageSize: 20, showSizeChanger: false }}
                  />
                </>
              ),
            },
            {
              key: 'tuning',
              label: `调参记录${tuningLogs.length ? `（${tuningLogs.length}）` : ''}`,
              children: (
                <Table
                  dataSource={tuningLogs}
                  columns={tuningColumns}
                  rowKey="id"
                  size="small"
                  scroll={{ x: 640 }}
                  pagination={{ pageSize: 20, showSizeChanger: false }}
                  locale={{ emptyText: '暂无调参记录' }}
                />
              ),
            },
            {
              key: 'operations',
              label: `操作记录${(recentParams ?? []).filter(p => p.notes?.trim()).length ? `（${(recentParams ?? []).filter(p => p.notes?.trim()).length}）` : ''}`,
              children: (
                <Table
                  dataSource={(recentParams ?? []).filter(p => p.notes?.trim())}
                  columns={operationColumns}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 20, showSizeChanger: false }}
                  locale={{ emptyText: '暂无操作记录，录入水质时可填写操作备注' }}
                />
              ),
            },
          ]}
        />
      </Drawer>
    </div>
  )
}

// ── 调参增强 Tooltip（折线图 hover 时展示调参详情）──────────────────────────────
//
// 当鼠标悬停在有调参事件的日期时，tooltip 底部追加该日期所有调参记录。
// 否则只显示常规参数值。
function HwTooltip({
  active, payload, label, paramColor,
}: {
  active?: boolean
  payload?: any[]
  label?: string
  paramColor: string
}) {
  if (!active || !payload?.length || !label) return null

  return (
    <div style={{
      background: '#fff', border: '1px solid #e0f2fe',
      borderRadius: 10, padding: '8px 12px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.10)', fontSize: 12, minWidth: 140,
    }}>
      <div style={{ color: '#94a3b8', marginBottom: 6, fontWeight: 500 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
          <span style={{ color: paramColor }}>{p.name ?? p.dataKey}</span>
          <span style={{ fontWeight: 700, color: '#0c4a6e' }}>{p.value}</span>
        </div>
      ))}
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
