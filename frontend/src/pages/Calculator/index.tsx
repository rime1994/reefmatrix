// Calculator/index.tsx 添加剂计算器页面
// 左侧：智能建议（根据最新水质数据自动推算）
// 右侧：手动计算（用户输入当前值和目标值）
// 下方：AI 水质分析模块
import { useState } from 'react'
import { Card, Select, Row, Col, Form, InputNumber, Button, Table, Tag, Spin, Empty, Divider, Alert, message, Progress, Typography } from 'antd'
import { BulbOutlined, CalculatorOutlined, RobotOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tanksApi } from '@/api/tanks'
import { additivesApi } from '@/api/additives'
import { calculatorApi } from '@/api/calculator'
import { aiApi } from '@/api/ai'
import { PARAMETER_META, type DoseResult } from '@/types'

const { Paragraph } = Typography

export default function CalculatorPage() {
  const [tankId, setTankId] = useState<string>()
  const [aiTankId, setAiTankId] = useState<string>()
  const [aiResult, setAiResult] = useState<string>()
  // 手动计算的历史结果列表，按 additive_id 去重（同一添加剂重算时覆盖）
  const [manualResults, setManualResults] = useState<DoseResult[]>([])
  const qc = useQueryClient()

  const { data: tanks }     = useQuery({ queryKey: ['tanks'],     queryFn: tanksApi.list })
  const { data: additives } = useQuery({ queryKey: ['additives'], queryFn: additivesApi.list })

  const { data: aiUsage, isLoading: usageLoading } = useQuery({
    queryKey: ['ai', 'usage'],
    queryFn: aiApi.getUsage,
  })

  const analyzeMutation = useMutation({
    mutationFn: () => aiApi.analyze(aiTankId!),
    onSuccess: (res) => {
      setAiResult(res.content)
      qc.invalidateQueries({ queryKey: ['ai', 'usage'] })
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '分析失败'),
  })

  // 智能建议：选中鱼缸后自动发起请求
  const { data: suggestions, isLoading: suggestLoading } = useQuery({
    queryKey: ['calculator', 'suggest', tankId],
    queryFn: () => calculatorApi.suggest(tankId!),
    enabled: !!tankId,
  })

  const doseMutation = useMutation({
    mutationFn: calculatorApi.calcDose,
    onSuccess: (res) => {
      // 相同添加剂的结果直接覆盖，避免列表堆积旧数据
      setManualResults(prev => {
        const filtered = prev.filter(r => r.additive_id !== res.additive_id)
        return [...filtered, res]
      })
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '计算失败'),
  })

  // 结果表格列定义，供智能建议和手动计算共用
  const resultColumns = [
    { title: '添加剂', dataIndex: 'additive_name', key: 'name' },
    {
      title: '元素', dataIndex: 'element', key: 'element', width: 72,
      render: (v: string) => {
        const meta = PARAMETER_META[v as keyof typeof PARAMETER_META]
        return (
          <Tag color="blue" style={{ width: 52, textAlign: 'center', marginRight: 0 }}>
            {meta?.label ?? v}
          </Tag>
        )
      },
    },
    {
      title: '提升至', dataIndex: 'target_value', key: 'target', width: 90,
      render: (v: number, r: DoseResult) => {
        const unit = PARAMETER_META[r.element as keyof typeof PARAMETER_META]?.unit ?? ''
        return v ? `${v}${unit ? ' ' + unit : ''}` : '—'
      },
    },
    {
      title: '需提升', dataIndex: 'delta', key: 'delta', width: 90,
      render: (v: number, r: DoseResult) => {
        const unit = PARAMETER_META[r.element as keyof typeof PARAMETER_META]?.unit ?? ''
        return `+${v}${unit ? ' ' + unit : ''}`
      },
    },
    {
      title: '建议用量', key: 'dose', width: 100,
      render: (_: any, r: DoseResult) => (
        <strong style={{ color: '#1677ff' }}>{r.required_dose} {r.dose_unit}</strong>
      ),
    },
  ]

  const usedPct = aiUsage ? Math.round((aiUsage.used / aiUsage.limit) * 100) : 0

  return (
    <Row gutter={[16, 16]}>
      {/* 左侧：智能建议面板 */}
      <Col xs={24} lg={12}>
        <Card
          title={<><BulbOutlined style={{ color: '#faad14' }} /> 智能建议</>}
          extra={
            <Select
              placeholder="选择鱼缸"
              style={{ width: 160 }}
              value={tankId}
              onChange={setTankId}
              options={tanks?.map(t => ({ value: t.id, label: t.name }))}
            />
          }
        >
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="数据按照国药分析纯计算，使用前应严格测试，任何错误添加都可能导致一些未知情况发生！为避免冲击，大剂量使用时建议分少量多次添加。"
          />
          {!tankId ? (
            <Empty description="请先选择鱼缸" />
          ) : suggestLoading ? (
            <Spin style={{ display: 'block', margin: '20px auto' }} />
          ) : !suggestions?.length ? (
            <Empty description="Ca / Mg / KH 均已在目标范围内 🎉" />
          ) : (
            <Table
              dataSource={suggestions}
              columns={resultColumns}
              rowKey="additive_name"
              size="small"
              pagination={false}
            />
          )}
        </Card>
      </Col>

      {/* 右侧：手动计算面板 */}
      <Col xs={24} lg={12}>
        <Card title={<><CalculatorOutlined /> 手动计算</>}>
          <ManualDoseForm
            tanks={tanks ?? []}
            additives={additives ?? []}
            onCalc={(payload) => doseMutation.mutate(payload)}
            loading={doseMutation.isPending}
          />
          {manualResults.length > 0 && (
            <>
              <Divider>计算结果</Divider>
              <Table
                dataSource={manualResults}
                columns={resultColumns}
                rowKey="additive_id"
                size="small"
                pagination={false}
              />
            </>
          )}
        </Card>
      </Col>

      {/* AI 水质分析 */}
      <Col xs={24}>
        <Card
          title={<><RobotOutlined style={{ color: '#722ed1' }} /> AI 水质分析</>}
          extra={
            usageLoading ? null : (
              <span style={{ fontSize: 13, color: '#8c8c8c' }}>
                已用 {aiUsage?.used ?? 0} / {aiUsage?.limit ?? 100} 次
              </span>
            )
          }
        >
          <Row gutter={16} align="middle" style={{ marginBottom: 16 }}>
            <Col xs={24} sm={10} md={8}>
              <Select
                placeholder="选择要分析的鱼缸"
                style={{ width: '100%' }}
                value={aiTankId}
                onChange={v => { setAiTankId(v); setAiResult(undefined) }}
                options={tanks?.map(t => ({ value: t.id, label: t.name }))}
              />
            </Col>
            <Col xs={24} sm={14} md={8}>
              <Button
                type="primary"
                icon={<RobotOutlined />}
                loading={analyzeMutation.isPending}
                disabled={!aiTankId || (aiUsage?.remaining ?? 1) <= 0}
                onClick={() => analyzeMutation.mutate()}
                style={{ background: '#722ed1', borderColor: '#722ed1' }}
              >
                开始分析
              </Button>
            </Col>
            <Col xs={24} md={8}>
              <Progress
                percent={usedPct}
                size="small"
                strokeColor={usedPct >= 90 ? '#ff4d4f' : usedPct >= 70 ? '#faad14' : '#52c41a'}
                format={() => `剩余 ${aiUsage?.remaining ?? '—'} 次`}
              />
            </Col>
          </Row>

          {(aiUsage?.remaining ?? 1) <= 0 && (
            <Alert type="warning" showIcon message="已达到分析次数上限，如需继续请联系管理员" style={{ marginBottom: 12 }} />
          )}

          {analyzeMutation.isPending && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <Spin tip="AI 正在分析水质数据，请稍候…" />
            </div>
          )}

          {aiResult && !analyzeMutation.isPending && (
            <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '16px 20px' }}>
              <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{aiResult}</Paragraph>
            </div>
          )}

          {!aiTankId && !aiResult && !analyzeMutation.isPending && (
            <Empty description="请选择鱼缸后点击「开始分析」" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>
      </Col>
    </Row>
  )
}

// ManualDoseForm 手动计算表单（独立组件，保持 CalculatorPage 清晰）
function ManualDoseForm({ tanks, additives, onCalc, loading }: {
  tanks: any[]
  additives: any[]
  onCalc: (p: any) => void
  loading: boolean
}) {
  const [form] = Form.useForm()

  return (
    <Form form={form} layout="vertical" onFinish={onCalc}>
      <Form.Item name="tank_id" label="鱼缸" rules={[{ required: true }]}>
        <Select options={tanks.map(t => ({ value: t.id, label: t.name }))} />
      </Form.Item>
      <Form.Item name="additive_id" label="添加剂" rules={[{ required: true }]}>
        <Select options={additives.map(a => ({
          value: a.id,
          // 显示添加剂名称时附上作用元素，方便选择
          label: `${a.name}（${PARAMETER_META[a.element as keyof typeof PARAMETER_META]?.label ?? a.element}）`,
        }))} />
      </Form.Item>
      <Row gutter={8}>
        <Col span={12}>
          <Form.Item name="current_value" label="当前值" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="target_value" label="目标值" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      {/* 水体容积可选填，为空时后端自动读取鱼缸默认容积 */}
      <Form.Item name="volume_liters" label="净水量(L) — 留空则用鱼缸默认值">
        <InputNumber style={{ width: '100%' }} min={1} />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={loading} block>
        计算用量
      </Button>
    </Form>
  )
}
