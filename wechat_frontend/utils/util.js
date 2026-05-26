// utils/util.js — 通用工具函数

/**
 * 格式化日期 YYYY-MM-DD HH:mm
 */
function formatTime(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 格式化为 MM-DD HH:mm
 */
function formatShortTime(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 相对时间（x 分钟前、x 小时前、x 天前）
 */
function timeAgo(dateStr) {
  if (!dateStr) return ''
  const now = Date.now()
  const diff = now - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}天前`
  const months = Math.floor(days / 30)
  return `${months}个月前`
}

/**
 * 显示成功提示
 */
function showSuccess(title) {
  wx.showToast({ title, icon: 'success', duration: 1500 })
}

/**
 * 显示错误提示
 */
function showError(msg) {
  wx.showToast({ title: msg || '操作失败', icon: 'none', duration: 2000 })
}

/**
 * 显示加载中
 */
function showLoading(title = '加载中...') {
  wx.showLoading({ title, mask: true })
}

function hideLoading() {
  wx.hideLoading()
}

module.exports = {
  formatTime,
  formatShortTime,
  timeAgo,
  showSuccess,
  showError,
  showLoading,
  hideLoading,
}
