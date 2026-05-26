/**
 * REG-001 + REG-002 — 注册页（手风琴布局）
 *
 * 状态机：
 *   phase "choose"  — 两张折叠卡片（邀请码 / 知识问答），点击展开，验证通过后进 "form"
 *   phase "form"    — 填写注册资料 → registerV2
 *   phase "success" — 注册成功，展示邀请码，倒计时跳 /dashboard
 *
 * 手风琴规则：
 *   - 点未选中的卡 → 展开该卡，折叠另一卡
 *   - 点已选中的卡 → 折叠（取消选择）
 *   - 两卡始终可见，仅内容区动态显示
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Button, Form, Input, message, Progress, Steps, Typography, Space, Divider, Radio,
} from 'antd'
import {
  GiftOutlined, TrophyOutlined, CopyOutlined, ArrowLeftOutlined, CheckCircleFilled,
  ReloadOutlined, RightOutlined, DownOutlined,
} from '@ant-design/icons'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'

const { Title, Text, Paragraph } = Typography

const C = {
  primary: '#0ea5e9',
  quiz:    '#f59e0b',
  bg:      '#f8fafc',
  border:  '#e2e8f0',
  text:    '#0f172a',
  muted:   '#64748b',
}

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 8)           score += 40
  if (/[A-Za-z]/.test(pw))      score += 20
  if (/\d/.test(pw))            score += 20
  if (/[^A-Za-z\d]/.test(pw))  score += 20
  if (score <= 40) return { score, label: '弱', color: '#ef4444' }
  if (score <= 60) return { score, label: '中', color: '#f59e0b' }
  return { score, label: '强', color: '#10b981' }
}

type Path = 'invite' | 'quiz'
type Phase = 'choose' | 'form' | 'success'

interface QuizQuestion {
  id: string
  question: string
  options: string[]
  difficulty: string
  category?: string
}

export default function RegisterPage() {
  const navigate      = useNavigate()
  const [searchParams] = useSearchParams()
  const { setAuth }   = useAuthStore()
  const queryClient   = useQueryClient()

  const prefilledInvite = searchParams.get('invite') ?? ''

  // 顶层阶段
  const [phase, setPhase] = useState<Phase>('choose')

  // 当前展开的卡片（null = 两张都折叠）
  const [openCard, setOpenCard] = useState<Path | null>(
    prefilledInvite ? 'invite' : null
  )

  // 记录验证通过的路径（进 form 阶段时使用）
  const [verifiedPath, setVerifiedPath] = useState<Path>('invite')

  // Token 持有
  const [inviteToken, setInviteToken] = useState('')
  const [quizToken, setQuizToken]     = useState('')

  // Quiz 子状态
  const [quizQuestion, setQuizQuestion]     = useState<QuizQuestion | null>(null)
  const [quizSub, setQuizSub]               = useState<'loading' | 'question' | 'passed'>('loading')
  const [selectedAnswer, setSelectedAnswer] = useState('')
  const [quizLoading, setQuizLoading]       = useState(false)
  const [lastWrong, setLastWrong]           = useState(false)

  // 表单
  const [loading, setLoading] = useState(false)
  const [pw, setPw]           = useState('')

  // 成功后
  const [myInviteCode, setMyInviteCode] = useState('')
  const [countdown, setCountdown]       = useState(5)

  // ── 倒计时跳转 ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'success') return
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(t); navigate('/dashboard'); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [phase, navigate])

  // ── 手风琴切换 ───────────────────────────────────────────────────────────────
  const toggleCard = (card: Path) => {
    const willOpen = openCard !== card
    setOpenCard(willOpen ? card : null)

    if (card === 'quiz' && willOpen) {
      // 展开 quiz 卡时立即出题
      fetchQuestion()
    }
    if (!willOpen || card !== 'quiz') {
      // 折叠或切走时重置
      setQuizSub('loading')
      setQuizQuestion(null)
      setLastWrong(false)
      setSelectedAnswer('')
    }
  }

  // ── 出题（quiz 卡展开时调用）────────────────────────────────────────────────
  const fetchQuestion = async () => {
    setQuizSub('loading')
    setLastWrong(false)
    setSelectedAnswer('')
    setQuizLoading(true)
    try {
      const q = await authApi.getQuizQuestion()
      setQuizQuestion(q)
      setQuizSub('question')
    } catch (e: any) {
      message.error(e.response?.data?.error ?? '获取题目失败，请重试')
      setOpenCard(null) // 出题失败则折叠卡片
    } finally {
      setQuizLoading(false)
    }
  }

  // ── 邀请码验证 ───────────────────────────────────────────────────────────────
  const handleInvite = async (values: { code: string }) => {
    setLoading(true)
    try {
      const { invite_token } = await authApi.validateInvite(values.code)
      setInviteToken(invite_token)
      setVerifiedPath('invite')
      setPhase('form')
    } catch (e: any) {
      message.error(e.response?.data?.error ?? '邀请码无效')
    } finally {
      setLoading(false)
    }
  }

  // ── 知识问答 ─────────────────────────────────────────────────────────────────
  const handleSubmitAnswer = async () => {
    if (!selectedAnswer || !quizQuestion) return
    setQuizLoading(true)
    try {
      const { quiz_token } = await authApi.submitQuizAnswer(quizQuestion.id, selectedAnswer)
      setQuizToken(quiz_token)
      setQuizSub('passed')
    } catch (e: any) {
      const status = e.response?.status
      if (status === 400) {
        setLastWrong(true)
        message.error('答案错误，换道题再试试')
      } else if (status === 429) {
        message.warning(e.response?.data?.error ?? '答题过于频繁')
      } else {
        message.error(e.response?.data?.error ?? '提交失败')
      }
    } finally {
      setQuizLoading(false)
    }
  }

  const handleNextQuestion = async () => {
    setLastWrong(false)
    setSelectedAnswer('')
    setQuizLoading(true)
    try {
      const q = await authApi.getQuizQuestion()
      setQuizQuestion(q)
      setQuizSub('question')
    } catch (e: any) {
      message.error('获取题目失败')
    } finally {
      setQuizLoading(false)
    }
  }

  const handleQuizProceed = () => {
    setVerifiedPath('quiz')
    setPhase('form')
  }

  // ── 注册 ─────────────────────────────────────────────────────────────────────
  const handleRegister = async (values: { email: string; password: string; nickname: string }) => {
    const tokenField = verifiedPath === 'invite'
      ? { invite_token: inviteToken }
      : { quiz_token: quizToken }
    setLoading(true)
    try {
      const res = await authApi.registerV2({ ...values, ...tokenField })
      setAuth(res.user, res.token)
      queryClient.clear()
      setMyInviteCode((res.user as any).my_invite_code ?? '')
      setPhase('success')
    } catch (e: any) {
      message.error(e.response?.data?.error ?? '注册失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const pwStrength = passwordStrength(pw)

  // ── 渲染壳 ───────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
    }}>
      {/* 顶栏 */}
      <nav style={{
        width: '100%', padding: '0 24px', height: 56, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${C.border}`, background: 'rgba(248,250,252,0.9)',
        backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
          造礁矩阵
        </Button>
        <Text type="secondary" style={{ fontSize: 13 }}>
          已有账号？<a onClick={() => navigate('/login')} style={{ color: C.primary }}>去登录</a>
        </Text>
      </nav>

      <div style={{ width: '100%', maxWidth: 480, padding: '48px 24px 64px' }}>

        {/* ══ 阶段：choose（手风琴）══ */}
        {phase === 'choose' && (
          <>
            <Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>加入造礁矩阵</Title>
            <Paragraph type="secondary" style={{ textAlign: 'center', marginBottom: 32 }}>
              选择注册方式，内容将在下方展开
            </Paragraph>

            {/* ── 卡片 A：邀请码 ── */}
            <AccordionCard
              open={openCard === 'invite'}
              onToggle={() => toggleCard('invite')}
              icon={<GiftOutlined style={{ fontSize: 22, color: C.primary }} />}
              title="我有邀请码"
              subtitle="朋友推荐，直接跳过答题"
              accentColor={C.primary}
            >
              <Form onFinish={handleInvite} layout="vertical" style={{ marginTop: 4 }}>
                <Form.Item
                  name="code"
                  initialValue={prefilledInvite}
                  rules={[
                    { required: true, message: '请输入邀请码' },
                    { pattern: /^RM-[A-Z0-9]{6}$/, message: '格式：RM-XXXXXX' },
                  ]}
                >
                  <Input
                    placeholder="RM-XXXXXX"
                    size="large"
                    style={{ fontFamily: 'monospace', letterSpacing: 4, textAlign: 'center', textTransform: 'uppercase' }}
                    maxLength={9}
                    autoFocus={openCard === 'invite'}
                  />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block size="large">
                  验证邀请码
                </Button>
              </Form>
            </AccordionCard>

            <div style={{ height: 12 }} />

            {/* ── 卡片 B：知识问答 ── */}
            <AccordionCard
              open={openCard === 'quiz'}
              onToggle={() => toggleCard('quiz')}
              icon={<TrophyOutlined style={{ fontSize: 22, color: C.quiz }} />}
              title="知识问答"
              subtitle="没有邀请码？答对一道礁缸题即可"
              accentColor={C.quiz}
            >
              {/* Sub: 加载中 */}
              {quizSub === 'loading' && (
                <div style={{ marginTop: 12, textAlign: 'center', padding: '16px 0', color: C.muted, fontSize: 13 }}>
                  出题中…
                </div>
              )}

              {/* Sub: 答题 */}
              {quizSub === 'question' && quizQuestion && (
                <div style={{ marginTop: 8 }}>
                  {lastWrong && (
                    <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 8, fontSize: 13, color: '#991b1b' }}>
                      ❌ 答案错误，换一道试试
                    </div>
                  )}

                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.6, marginBottom: 14, color: C.text }}>
                    {quizQuestion.question}
                  </div>

                  <Radio.Group
                    value={selectedAnswer}
                    onChange={e => { setSelectedAnswer(e.target.value); setLastWrong(false) }}
                    style={{ width: '100%' }}
                  >
                    <Space direction="vertical" style={{ width: '100%', gap: 6 }}>
                      {['A', 'B', 'C', 'D'].map((letter, idx) => {
                        const opt = quizQuestion.options[idx]
                        if (!opt) return null
                        const selected = selectedAnswer === letter
                        return (
                          <Radio
                            key={letter}
                            value={letter}
                            style={{
                              display: 'flex', alignItems: 'flex-start',
                              padding: '9px 12px', margin: 0, width: '100%',
                              borderRadius: 8,
                              border: `1px solid ${selected ? C.quiz : C.border}`,
                              background: selected ? '#fffbeb' : 'white',
                              transition: 'all 0.15s',
                            }}
                          >
                            <span style={{ fontWeight: 700, color: C.quiz, marginRight: 8, flexShrink: 0 }}>{letter}.</span>
                            <span style={{ fontSize: 13 }}>{opt}</span>
                          </Radio>
                        )
                      })}
                    </Space>
                  </Radio.Group>

                  <Space style={{ width: '100%', marginTop: 14 }}>
                    <Button icon={<ReloadOutlined />} onClick={handleNextQuestion} loading={quizLoading} style={{ flex: 1 }}>
                      换题
                    </Button>
                    <Button
                      type="primary"
                      onClick={handleSubmitAnswer}
                      loading={quizLoading}
                      disabled={!selectedAnswer}
                      style={{ flex: 2 }}
                    >
                      提交答案
                    </Button>
                  </Space>
                </div>
              )}

              {/* Sub: 通过 */}
              {quizSub === 'passed' && (
                <div style={{ marginTop: 8, textAlign: 'center', padding: '8px 0' }}>
                  <CheckCircleFilled style={{ fontSize: 36, color: '#10b981', display: 'block', marginBottom: 10 }} />
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>回答正确 🎉</div>
                  <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>
                    知识验证通过，继续填写注册信息
                  </Text>
                  <Button type="primary" block size="large" onClick={handleQuizProceed}>
                    继续完成注册 →
                  </Button>
                </div>
              )}
            </AccordionCard>
          </>
        )}

        {/* ══ 阶段：form ══ */}
        {phase === 'form' && (
          <div>
            <Steps
              current={1} size="small"
              items={[{ title: '验证' }, { title: '注册资料' }, { title: '完成' }]}
              style={{ marginBottom: 32 }}
            />
            <Title level={3} style={{ marginBottom: 4 }}>填写注册信息</Title>
            <Paragraph type="secondary" style={{ marginBottom: 24 }}>
              {verifiedPath === 'invite' ? '🎟️ 邀请码已验证' : '🧪 知识问答已通过'} — 完成最后一步
            </Paragraph>

            <Form layout="vertical" onFinish={handleRegister} size="large">
              <Form.Item
                name="email"
                label="邮箱"
                rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}
              >
                <Input placeholder="your@email.com" />
              </Form.Item>

              <Form.Item name="nickname" label="昵称（可选）">
                <Input placeholder="我的珊瑚缸 / 留空自动生成" />
              </Form.Item>

              <Form.Item
                name="password"
                label={
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    密码
                    {pw && <span style={{ fontSize: 11, fontWeight: 400 }}>强度：<span style={{ color: pwStrength.color }}>{pwStrength.label}</span></span>}
                  </span>
                }
                rules={[
                  { required: true, message: '请设置密码' },
                  { pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/, message: '至少 8 位，需同时包含字母和数字' },
                ]}
              >
                <Input.Password placeholder="至少 8 位，含字母和数字" onChange={e => setPw(e.target.value)} />
              </Form.Item>

              {pw && (
                <Progress
                  percent={pwStrength.score} showInfo={false} size="small"
                  strokeColor={pwStrength.color}
                  style={{ marginTop: -16, marginBottom: 16 }}
                />
              )}

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block>
                  创建账号
                </Button>
              </Form.Item>
            </Form>

            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <a onClick={() => setPhase('choose')} style={{ fontSize: 12, color: C.muted }}>
                ← 返回重新选择
              </a>
            </div>
          </div>
        )}

        {/* ══ 阶段：success ══ */}
        {phase === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <CheckCircleFilled style={{ fontSize: 64, color: '#10b981', display: 'block', marginBottom: 16 }} />
            <Title level={2} style={{ marginBottom: 8 }}>注册成功！</Title>
            <Paragraph type="secondary" style={{ marginBottom: 32 }}>欢迎加入造礁矩阵 🪸</Paragraph>

            {myInviteCode && (
              <>
                <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>你的专属邀请码</div>
                <div style={{
                  background: C.bg, border: `2px dashed ${C.border}`, borderRadius: 12,
                  padding: '20px 24px', marginBottom: 8,
                  fontFamily: 'monospace', fontSize: 28, fontWeight: 800, letterSpacing: 4, color: C.text,
                }}>
                  {myInviteCode}
                </div>
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => { navigator.clipboard.writeText(myInviteCode); message.success('已复制') }}
                  style={{ marginBottom: 8 }}
                >
                  复制邀请码
                </Button>
                <Button
                  type="link" size="small"
                  onClick={() => {
                    const text = `我在造礁矩阵管理我的海缸，用我的邀请码 ${myInviteCode} 可免试注册 → reefmatrix.app/register?invite=${myInviteCode}`
                    navigator.clipboard.writeText(text)
                    message.success('分享文案已复制')
                  }}
                  style={{ display: 'block', marginBottom: 24 }}
                >
                  复制分享文案
                </Button>
              </>
            )}

            <Divider />
            <Paragraph type="secondary" style={{ fontSize: 13 }}>
              {countdown} 秒后自动跳转到控制台…
            </Paragraph>
            <Button type="primary" onClick={() => navigate('/dashboard')}>
              立即前往控制台
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 手风琴卡片组件 ─────────────────────────────────────────────────────────────

interface AccordionCardProps {
  open: boolean
  onToggle: () => void
  icon: React.ReactNode
  title: string
  subtitle: string
  accentColor: string
  children: React.ReactNode
}

function AccordionCard({ open, onToggle, icon, title, subtitle, accentColor, children }: AccordionCardProps) {
  return (
    <div style={{
      border: `2px solid ${open ? accentColor : C.border}`,
      borderRadius: 16,
      background: 'white',
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* 头部行：始终可见，点击切换 */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '16px 20px',
          cursor: 'pointer',
          userSelect: 'none',
          background: open ? `${accentColor}08` : 'white',
          transition: 'background 0.2s',
        }}
      >
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: open ? `${accentColor}15` : '#f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.2s',
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{title}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{subtitle}</div>
        </div>
        <div style={{ color: open ? accentColor : C.muted, transition: 'color 0.2s', flexShrink: 0 }}>
          {open ? <DownOutlined /> : <RightOutlined />}
        </div>
      </div>

      {/* 内容区：展开时显示 */}
      {open && (
        <div style={{ padding: '4px 20px 20px', borderTop: `1px solid ${accentColor}20` }}>
          {children}
        </div>
      )}
    </div>
  )
}
