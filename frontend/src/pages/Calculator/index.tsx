// Calculator/index.tsx 计算器页面
// 上方：智能建议（根据最新水质自动推算，默认选中最早建立的鱼缸）
// 下方：AI 水质分析（默认展示该鱼缸最后一次分析结果）
import { useMemo, useState, useEffect } from 'react'
import {
  Card, Select, Row, Col, Table, Tag, Spin, Empty, Alert,
  Button, Progress, Typography, message,
} from 'antd'
import { BulbOutlined, RobotOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tanksApi } from '@/api/tanks'
import { calculatorApi } from '@/api/calculator'
import { aiApi } from '@/api/ai'
import { PARAMETER_META, type DoseResult } from '@/types'

const { Paragraph, Text } = Typography

export default function CalculatorPage() {
  const qc = useQueryClient()

  const { data: tanks } = useQuery({ queryKey: ['tanks'], queryFn: tanksApi.list })

  // 默认鱼缸 = 按 created_at 升序第一个（最早建立）
  const defaultTankId = useMemo(() => {
    if (!tanks?.length) return undefined
    return [...tanks].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0].id
  }, [tanks])

  const [tankId,   setTankId]   = useState<string>()
  const [aiTankId, setAiTankId] = useState<string>()

  // 鱼缸列表加载完成后，初始化选中项（只在首次加载时设置）
  useEffect(() => {
    if (defaultTankId) {
      setTankId(prev  => prev  ?? defaultTankId)
      setAiTankId(prev => prev ?? defaultTankId)
    }
  }, [defaultTankId])

  // ── 智能建议 ──────────────────────────────────────────────────────────────
  const { data: suggestions, isLoading: suggestLoading } = useQuery({
    queryKey: ['calculator', 'suggest', tankId],
    queryFn: () => calculatorApi.suggest(tankId!),
    enabled: !!tankId,
  })

  // ── AI 分析 ───────────────────────────────────────────────────────────────
  const { data: aiUsage } = useQuery({
    queryKey: ['ai', 'usage'],
    queryFn: aiApi.getUsage,
  })

  // 当前选中鱼缸的最新一次分析结果，分析完成后 invalidate 刷新，刷新页面也能复现
  const { data: latestAnalysis, isLoading: latestLoading } = useQuery({
    queryKey: ['ai', 'latest', aiTankId],
    queryFn: () => aiApi.getLatest(aiTankId!),
    enabled: !!aiTankId,
  })

  const analyzeMutation = useMutation({
    mutationFn: () => aiApi.analyze(aiTankId!),
    onSuccess: (newAnalysis) => {
      // 直接把 mutation 返回值写入缓存，立即显示结果，无需等待二次 fetch
      qc.setQueryData(['ai', 'latest', aiTankId], newAnalysis)
      qc.invalidateQueries({ queryKey: ['ai', 'usage'] })
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '分析失败'),
  })

  const displayedResult = latestAnalysis?.content

  // ── 列定义 ────────────────────────────────────────────────────────────────
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

  const tankOptions = tanks?.map(t => ({ value: t.id, label: t.name }))
  const usedPct = aiUsage ? Math.round((aiUsage.used / aiUsage.limit) * 100) : 0

  return (
    <Row gutter={[16, 16]}>
      {/* 智能建议 */}
      <Col xs={24}>
        <Card
          title={<><BulbOutlined style={{ color: '#faad14' }} /> 智能建议</>}
          extra={
            <Select
              placeholder="选择鱼缸"
              style={{ width: 160 }}
              value={tankId}
              onChange={setTankId}
              options={tankOptions}
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

      {/* AI 水质分析 */}
      <Col xs={24}>
        <Card
          title={<><RobotOutlined style={{ color: '#722ed1' }} /> AI 水质分析</>}
          extra={
            aiUsage && (
              <span style={{ fontSize: 13, color: '#8c8c8c' }}>
                已用 {aiUsage.used} / {aiUsage.limit} 次
              </span>
            )
          }
        >
          <Row gutter={16} align="middle" style={{ marginBottom: 16 }}>
            <Col xs={24} sm={10} md={7}>
              <Select
                style={{ width: '100%' }}
                value={aiTankId}
                onChange={setAiTankId}
                options={tankOptions}
              />
            </Col>
            <Col xs={24} sm={8} md={6}>
              <Button
                type="primary"
                icon={<RobotOutlined />}
                loading={analyzeMutation.isPending}
                disabled={!aiTankId || (aiUsage?.remaining ?? 1) <= 0}
                onClick={() => analyzeMutation.mutate()}
                style={{ background: '#722ed1', borderColor: '#722ed1' }}
              >
                重新分析
              </Button>
            </Col>
            <Col xs={24} md={11}>
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

          {!analyzeMutation.isPending && displayedResult && (
            <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '16px 20px' }}>
              {latestAnalysis?.created_at && (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  上次分析：{new Date(latestAnalysis.created_at).toLocaleString('zh-CN')}
                </Text>
              )}
              <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{displayedResult}</Paragraph>
            </div>
          )}

          {!analyzeMutation.isPending && !displayedResult && !latestLoading && (
            <Empty description="暂无分析记录，点击「重新分析」开始" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>
      </Col>
    </Row>
  )
}
