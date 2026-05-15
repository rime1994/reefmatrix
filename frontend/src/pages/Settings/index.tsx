// Settings/index.tsx 系统设置页面：修改密码 + 归档鱼缸管理
import { Card, Table, Button, Popconfirm, Space, Tag, Typography, Empty, message, Form, Input } from 'antd'
import { ReloadOutlined, DeleteOutlined, LockOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { tanksApi } from '@/api/tanks'
import { authApi } from '@/api/auth'
import { TANK_TYPE_LABEL } from '@/types'
import type { Tank, TankType } from '@/types'

const { Title, Text } = Typography

export default function SettingsPage() {
  const qc = useQueryClient()
  const [pwdForm] = Form.useForm()

  const changePwdMutation = useMutation({
    mutationFn: ({ old_password, new_password }: { old_password: string; new_password: string }) =>
      authApi.changePassword(old_password, new_password),
    onSuccess: () => { pwdForm.resetFields(); message.success('密码已修改') },
    onError: (err: any) => message.error(err.response?.data?.error ?? '修改失败'),
  })

  const { data: archivedTanks, isLoading } = useQuery({
    queryKey: ['tanks', 'archived'],
    queryFn: tanksApi.listArchived,
  })

  const restoreMutation = useMutation({
    mutationFn: (id: string) => tanksApi.restore(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tanks'] })
      message.success('鱼缸已恢复')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '操作失败'),
  })

  const purgeMutation = useMutation({
    mutationFn: (id: string) => tanksApi.purge(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tanks'] })
      message.success('已彻底删除')
    },
    onError: (err: any) => message.error(err.response?.data?.error ?? '删除失败'),
  })

  const columns = [
    {
      title: '鱼缸名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '缸型',
      dataIndex: 'tank_type',
      key: 'tank_type',
      render: (v: TankType) => <Tag>{TANK_TYPE_LABEL[v] ?? v}</Tag>,
    },
    {
      title: '净水量',
      dataIndex: 'volume_liters',
      key: 'volume',
      render: (v: number) => `${v} L`,
    },
    {
      title: '归档时间',
      dataIndex: 'updated_at',
      key: 'archived_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: Tank) => (
        <Space>
          <Popconfirm
            title="恢复后该缸将重新出现在主界面"
            okText="恢复" cancelText="取消"
            onConfirm={() => restoreMutation.mutate(record.id)}
          >
            <Button
              icon={<ReloadOutlined />}
              size="small"
              loading={restoreMutation.isPending && restoreMutation.variables === record.id}
            >
              恢复
            </Button>
          </Popconfirm>
          <Popconfirm
            title={
              <span>
                彻底删除「{record.name}」？<br />
                <Text type="danger">所有水质记录和资产数据将永久丢失，无法恢复。</Text>
              </span>
            }
            okText="确认删除" okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => purgeMutation.mutate(record.id)}
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              size="small"
              loading={purgeMutation.isPending && purgeMutation.variables === record.id}
            >
              彻底删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>设置</Title>

      {/* 修改密码 */}
      <Card title={<><LockOutlined /> 修改密码</>} style={{ marginBottom: 24 }}>
        <Form
          form={pwdForm}
          layout="vertical"
          style={{ maxWidth: 400 }}
          onFinish={(v) => changePwdMutation.mutate({ old_password: v.old_password, new_password: v.new_password })}
        >
          <Form.Item name="old_password" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="new_password" label="新密码" rules={[{ required: true, min: 6, message: '新密码不少于6位' }]}>
            <Input.Password />
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
            <Input.Password />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={changePwdMutation.isPending}
          >
            修改密码
          </Button>
        </Form>
      </Card>

      <Card title="已归档鱼缸" style={{ marginBottom: 24 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          归档的鱼缸不再显示在主界面，但数据完整保留。可随时恢复，或彻底删除以释放空间。
        </Text>
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
      </Card>
    </div>
  )
}
