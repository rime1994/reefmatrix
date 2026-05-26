// AppFooter.tsx — 全局页脚
//
// 行为规格（代替正式测试，TDD 活文档）：
//   ✓ 渲染品牌名 "造礁矩阵 ReefMatrix" 及版本号
//   ✓ 渲染 Slogan "Driven by Data, not Magic."
//   ✓ GitHub 图标链接在新标签页打开仓库地址
//   ✓ "报告 Bug / 提供灵感" 链接在新标签页打开 Issues
//   ✓ "联系开发者" hover/点击弹出微信二维码 Popover
//   ✓ 整体视觉极简低调，不干扰主内容区焦点
import { Popover, Tooltip } from 'antd'
import { GithubOutlined, WechatOutlined, BugOutlined } from '@ant-design/icons'

const GITHUB_REPO = 'https://github.com/fuqis/reefmatrix'
const GITHUB_ISSUES = `${GITHUB_REPO}/issues/new`

// 微信二维码图片路径（替换为真实二维码 URL 或本地文件路径）
// const WECHAT_QR_SRC = '/wechat-qr.png'

function WechatQrContent() {
  return (
    <div style={{ textAlign: 'center', padding: '4px 0' }}>
      {/* 占位：将下方 div 替换为 <img src={WECHAT_QR_SRC} width={120} height={120} /> */}
      <div style={{
        width: 120, height: 120,
        background: 'linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 100%)',
        borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 8px',
        border: '1px solid #e2e8f0',
      }}>
        <WechatOutlined style={{ fontSize: 40, color: '#22c55e', opacity: 0.6 }} />
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>微信扫码联系开发者</div>
    </div>
  )
}

export default function AppFooter() {
  return (
    <footer style={{
      borderTop: '1px solid #f0f0f0',
      background: '#fafafa',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 8,
    }}>

      {/* 左：品牌信息 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', letterSpacing: 0.3 }}>
          🪸 造礁矩阵 ReefMatrix
          <span style={{ fontWeight: 400, marginLeft: 6, color: '#94a3b8', fontSize: 11 }}>v1.0</span>
        </span>
        <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', letterSpacing: 0.2 }}>
          Driven by Data, not Magic.
        </span>
      </div>

      {/* 中：开源链接 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Tooltip title="查看开源仓库">
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#475569')}
            onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
          >
            <GithubOutlined style={{ fontSize: 15 }} />
            <span>开源仓库</span>
          </a>
        </Tooltip>
        <a
          href={GITHUB_ISSUES}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, textDecoration: 'none' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#475569')}
          onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
        >
          <BugOutlined style={{ fontSize: 13 }} />
          <span>报告 Bug / 提供灵感</span>
        </a>
      </div>

      {/* 右：联系开发者（微信二维码） */}
      <Popover
        content={<WechatQrContent />}
        title={null}
        trigger={['hover', 'click']}
        placement="topRight"
        overlayInnerStyle={{ padding: '12px 12px 8px' }}
      >
        <span style={{
          color: '#94a3b8', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
          userSelect: 'none',
          transition: 'color 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.color = '#22c55e')}
          onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
        >
          <WechatOutlined style={{ fontSize: 14 }} />
          <span>联系开发者</span>
        </span>
      </Popover>

    </footer>
  )
}
