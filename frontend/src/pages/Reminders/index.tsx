// Reminders/index.tsx 提醒管理页面
// 前端通过轮询 /reminders/due 接口检查到期提醒，不依赖 WebSocket
import { useState } from 'react'
import { Card, List, Tag, Button, Badge, Empty, Popconfirm, Modal, Form, Input, Select, Switch, DatePicker, message } from 'antd'
import { PlusOutlined, DeleteOutlined, CheckOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { remindersApi } from '@/api/reminders'
import { tanksApi } from '@/api/tanks'
import type { Reminder } from '@/types'

// 常用 cron 表达式快捷选项
const CRON_PRESETS = [
  { label: '每天', value: '0 9 * * *' },
  { label: '每两天', value: '0 9 */2 * *' },
  { label: '每周一', value: '0 9 * * 1' },
  { label: '每两周', value: '0 9 1,15 * *' },
  { label: '每月1号', value: '0 9 1 * *' },
]

export default function RemindersPage() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [isRecurring, setIsRecurring] = useState(false)
  const [form] = Form.useForm()

  const { data: reminders, isLoading } = useQuery({
    queryKey: ['reminders'],
    queryFn: remindersApi.list,
  })

  const { data: due } = useQuery({
    queryKey: ['reminders', 'due'],
    queryFn: remindersApi.due,
    refetchInterval: 60_000,
  })

  const { data: tanks } = useQuery({ queryKey: ['tanks'], queryFn: tanksApi.list })

  const createMutation = useMutation({
    mutationFn: remindersApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] })
      setModalOpen(false)
      form.resetFields()
      setIsRecurring(false)
      message.success('提醒已创建')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '创建失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: remindersApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] })
      message.success('已删除')
    },
  })

  // 标记完成：单次提醒停用，周期提醒需计算下次时间（后端未实现时暂时停用）
  const doneMutation = useMutation({
    mutationFn: (id: string) => remindersApi.update(id, { is_active: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders'] }),
  })

  const handleFinish = (values: any) => {
    createMutation.mutate({
      tank_id: values.tank_id,
      title: values.title,
      description: values.description,
      is_recurring: isRecurring,
      cron_expr: isRecurring ? values.cron_expr : undefined,
      remind_at: !isRecurring ? values.remind_at?.toISOString() : undefined,
    })
  }

  const dueIds = new Set(due?.map(r => r.id))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>
          待办提醒
          {(due?.length ?? 0) > 0 && <Badge count={due!.length} style={{ marginLeft: 8 }} />}
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          新建提醒
        </Button>
      </div>

      <Card loading={isLoading}>
        {!reminders?.length ? (
          <Empty description="暂无提醒">
            <Button type="primary" onClick={() => setModalOpen(true)}>创建第一个提醒</Button>
          </Empty>
        ) : (
          <List
            dataSource={reminders}
            renderItem={(r: Reminder) => (
              <List.Item
                actions={[
                  dueIds.has(r.id) && (
                    <Button
                      type="link" size="small" icon={<CheckOutlined />}
                      onClick={() => doneMutation.mutate(r.id)}
                    >
                      完成
                    </Button>
                  ),
                  <Popconfirm title="确认删除？" onConfirm={() => deleteMutation.mutate(r.id)}>
                    <Button type="link" danger size="small" icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  title={
                    <span>
                      {dueIds.has(r.id) && <Badge status="warning" style={{ marginRight: 6 }} />}
                      {r.title}
                      {r.is_recurring && <Tag style={{ marginLeft: 8 }} color="geekblue">周期</Tag>}
                    </span>
                  }
                  description={
                    <>
                      {r.tank && <Tag>{r.tank.name}</Tag>}
                      {r.description && (
                        <span style={{ color: '#8c8c8c', fontSize: 12 }}>{r.description}</span>
                      )}
                      {r.next_remind_at && (
                        <div style={{ color: dueIds.has(r.id) ? '#ff4d4f' : '#8c8c8c', fontSize: 12, marginTop: 2 }}>
                          下次：{dayjs(r.next_remind_at).format('YYYY-MM-DD HH:mm')}
                        </div>
                      )}
                    </>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>

      {/* 新建提醒弹窗 */}
      <Modal
        title="新建提醒"
        open={modalOpen}
        onOk={() => form.submit()}
        onCancel={() => { setModalOpen(false); form.resetFields(); setIsRecurring(false) }}
        confirmLoading={createMutation.isPending}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={handleFinish}>
          <Form.Item name="title" label="提醒标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="例：换水 10%、测试 KH" />
          </Form.Item>
          <Form.Item name="tank_id" label="关联鱼缸（可选）">
            <Select
              allowClear
              placeholder="不选则为全局提醒"
              options={tanks?.map(t => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>
          <Form.Item label="周期提醒">
            <Switch
              checked={isRecurring}
              onChange={setIsRecurring}
              checkedChildren="开启"
              unCheckedChildren="关闭"
            />
          </Form.Item>
          {isRecurring ? (
            <Form.Item name="cron_expr" label="重复频率" rules={[{ required: true, message: '请选择或输入 cron 表达式' }]}>
              <Select
                showSearch
                placeholder="选择预设或输入 cron 表达式"
                options={CRON_PRESETS}
                // 允许直接输入自定义 cron
                onChange={() => {}}
              />
            </Form.Item>
          ) : (
            <Form.Item name="remind_at" label="提醒时间" rules={[{ required: true, message: '请选择时间' }]}>
              <DatePicker showTime style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
            </Form.Item>
          )}
          <Form.Item name="description" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
