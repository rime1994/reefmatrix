// pages/tank/tank.js — 鱼缸详情/操作页（录入水质、历史记录、AI分析、创建鱼缸）
Page({
  data: {
    action: '', // record | history | ai | create
  },

  onLoad(options) {
    const action = options.action || 'record'
    this.setData({ action })

    const titles = {
      record: '录入水质',
      history: '历史记录',
      ai: 'AI 分析',
      create: '创建鱼缸',
    }
    wx.setNavigationBarTitle({ title: titles[action] || '鱼缸详情' })
  },
})
