// pages/index/index.js — 启动路由页
Page({
  onLoad() {
    const app = getApp()
    if (app.globalData.token) {
      wx.switchTab({ url: '/pages/dashboard/dashboard' })
    } else {
      wx.reLaunch({ url: '/pages/login/login' })
    }
  },
})
