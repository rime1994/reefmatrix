/**
 * LAND-001 — LandingPage（B 极客数据风）
 *
 * 布局：左右分屏（移动端堆叠）
 *   左：品牌 + 标语 + 特性列表 + 双 CTA
 *   右：产品数据 mock（水质参数 + KH 走势迷你图 + 资产列表）
 *
 * 选型：B 极客数据风 — 浅色背景 + 数据密度感 + 科技感线条
 */
import { useNavigate } from 'react-router-dom'
import { Button, Tag } from 'antd'
import {
  ExperimentOutlined,
  LineChartOutlined,
  BellOutlined,
  ApiOutlined,
  RightOutlined,
} from '@ant-design/icons'

// ── 品牌色 Token ───────────────────────────────────────────────────────────────
const C = {
  bg:       '#f8fafc',
  panel:    '#ffffff',
  border:   '#e2e8f0',
  primary:  '#0ea5e9', // sky-500
  accent:   '#06b6d4', // cyan-500
  text:     '#0f172a',
  muted:    '#64748b',
  success:  '#10b981',
  warning:  '#f59e0b',
  danger:   '#ef4444',
}

// ── 模拟水质数据 ───────────────────────────────────────────────────────────────
const PARAMS = [
  { label: 'KH',       value: '8.2 dKH',  status: 'ok' },
  { label: 'Ca²⁺',     value: '420 ppm',  status: 'ok' },
  { label: 'Mg²⁺',     value: '1280 ppm', status: 'ok' },
  { label: 'NO₃⁻',     value: '5.2 ppm',  status: 'warn' },
  { label: 'PO₄³⁻',    value: '0.06 ppm', status: 'ok' },
  { label: 'Salinity', value: '35.1 ppt',  status: 'ok' },
]

// KH 最近 7 天数据点（用于迷你 SVG 走势图）
const KH_POINTS = [7.8, 8.0, 8.1, 7.9, 8.2, 8.3, 8.2]

const ASSETS = [
  { name: '黄多带拟花鲈', type: '鱼类',   status: '健康' },
  { name: '毛滴虫毛毡苔', type: '软珊瑚', status: '生长中' },
  { name: '橙杯 Acropora', type: '硬珊瑚', status: '健康' },
]

const FEATURES = [
  { icon: <ExperimentOutlined />, title: '水质全套追踪', desc: 'KH · Ca · Mg · NO₃ · PO₄ 历史曲线一屏览' },
  { icon: <LineChartOutlined />,  title: 'AI 水质分析',   desc: '基于历史数据智能诊断，给出可执行建议' },
  { icon: <BellOutlined />,       title: '智能提醒',      desc: '换水、添加剂、检测日程，一个不漏' },
  { icon: <ApiOutlined />,        title: '双引擎注册',    desc: '邀请码免试直通 · 答题证明玩家资格' },
]

// ── 迷你折线 SVG ──────────────────────────────────────────────────────────────
function SparkLine({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const w = 120, h = 36, pad = 4
  const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (w - pad * 2))
  const ys = data.map(v => pad + ((max - v) / (max - min || 1)) * (h - pad * 2))
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* 最后一点高亮 */}
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="3" fill={color} />
    </svg>
  )
}

// ── 产品 Mock 右面板 ──────────────────────────────────────────────────────────
function ProductMock() {
  return (
    <div style={{
      background: C.panel, borderRadius: 16, border: `1px solid ${C.border}`,
      boxShadow: '0 4px 32px rgba(14,165,233,0.08)',
      padding: '20px 24px', minWidth: 300, width: '100%', maxWidth: 420,
      fontFamily: '"SF Mono", "JetBrains Mono", monospace',
    }}>
      {/* 顶栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
        <span style={{ marginLeft: 8, fontSize: 12, color: C.muted }}>我的 SPS 混养缸 — 600L</span>
      </div>

      {/* 水质参数 */}
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 1 }}>
        WATER PARAMETERS · 最新检测 2h 前
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', marginBottom: 16 }}>
        {PARAMS.map(p => (
          <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: C.muted }}>{p.label}</span>
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: p.status === 'ok' ? C.text : C.warning,
            }}>{p.value}</span>
          </div>
        ))}
      </div>

      {/* KH 走势 */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, letterSpacing: 1 }}>
          KH TREND · 7 DAYS
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SparkLine data={KH_POINTS} color={C.primary} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.primary }}>8.2</div>
            <div style={{ fontSize: 10, color: C.success }}>▲ 稳定</div>
          </div>
        </div>
      </div>

      {/* 生物资产 */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 1 }}>
          LIVESTOCK · {ASSETS.length} 种
        </div>
        {ASSETS.map(a => (
          <div key={a.name} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '5px 0', borderBottom: `1px solid ${C.border}`,
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{a.name}</div>
              <div style={{ fontSize: 10, color: C.muted }}>{a.type}</div>
            </div>
            <Tag
              color={a.status === '健康' ? 'green' : 'blue'}
              style={{ fontSize: 10, margin: 0, padding: '0 6px' }}
            >
              {a.status}
            </Tag>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
    }}>
      {/* ── 导航栏 ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(248,250,252,0.9)', backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${C.border}`,
        padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>🪸</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: C.text }}>造礁矩阵</span>
          <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>Beta</Tag>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="small" onClick={() => navigate('/login')}>登录</Button>
          <Button type="primary" size="small" onClick={() => navigate('/register')}>免费注册</Button>
        </div>
      </nav>

      {/* ── Hero 分屏 ── */}
      <div style={{
        maxWidth: 1200, margin: '0 auto', padding: '80px 24px 64px',
        display: 'flex', alignItems: 'center', gap: 64,
        flexWrap: 'wrap',
      }}>
        {/* 左：文案 */}
        <div style={{ flex: '1 1 360px', minWidth: 280 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#e0f2fe', borderRadius: 999, padding: '4px 12px',
            fontSize: 12, color: C.primary, fontWeight: 600, marginBottom: 20,
          }}>
            <span>⚡</span> 专为硬核海缸玩家打造
          </div>

          <h1 style={{
            fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800,
            color: C.text, lineHeight: 1.15, marginBottom: 16,
          }}>
            把你的海缸<br />
            <span style={{ color: C.primary }}>数据化</span>
          </h1>

          <p style={{ fontSize: 16, color: C.muted, lineHeight: 1.7, marginBottom: 32, maxWidth: 420 }}>
            水质追踪 · AI 分析 · 生物档案 · 智能提醒
            <br />从直觉养缸，到数据驱动的精准养殖。
          </p>

          {/* 特性 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: '#e0f2fe', color: C.primary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 14,
                }}>
                  {f.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button
              type="primary" size="large"
              icon={<RightOutlined />} iconPosition="end"
              onClick={() => navigate('/register')}
              style={{ height: 48, paddingInline: 28, fontSize: 15, fontWeight: 600 }}
            >
              免费注册
            </Button>
            <Button
              size="large"
              onClick={() => navigate('/login')}
              style={{ height: 48, paddingInline: 28, fontSize: 15 }}
            >
              已有账号，去登录
            </Button>
          </div>

          <div style={{ marginTop: 20, fontSize: 12, color: C.muted }}>
            通过邀请码秒速注册 · 或答题证明资格 · 完全免费
          </div>
        </div>

        {/* 右：产品 Mock */}
        <div style={{ flex: '1 1 320px', display: 'flex', justifyContent: 'center' }}>
          <ProductMock />
        </div>
      </div>

      {/* ── 数据统计条 ── */}
      <div style={{
        borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
        background: C.panel,
        padding: '24px 0',
      }}>
        <div style={{
          maxWidth: 800, margin: '0 auto', padding: '0 24px',
          display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 16,
        }}>
          {[
            { val: '6 项',  label: '核心水质指标' },
            { val: 'AI',    label: '智能诊断引擎' },
            { val: '∞',     label: '历史数据存储' },
            { val: '24/7',  label: '提醒不遗漏' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.primary }}>{s.val}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 页脚 ── */}
      <footer style={{ padding: '32px 24px', textAlign: 'center', color: C.muted, fontSize: 12 }}>
        © 2026 造礁矩阵 ReefMatrix · 为海缸玩家，由海缸玩家制作
      </footer>
    </div>
  )
}
