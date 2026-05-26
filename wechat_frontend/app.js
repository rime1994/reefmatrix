// app.js — 小程序入口
const { api } = require('./utils/api')

App({
  globalData: {
    userInfo: null,
    token: null,
    currentTank: null,
  },

  onLaunch() {
    const token = wx.getStorageSync('token')
    if (token) {
      this.globalData.token = token
      this.checkAuth()
    }
  },

  // 静默校验登录态，失败不跳转
  async checkAuth() {
    try {
      const res = await api.get('/auth/me')
      this.globalData.userInfo = res
    } catch (e) {
      this.globalData.token = null
      this.globalData.userInfo = null
      wx.removeStorageSync('token')
    }
  },

  /**
   * 登录守卫：需要登录的操作前调用
   * @returns {boolean} true=已登录可继续，false=未登录已跳转
   */
  requireAuth() {
    if (this.globalData.token && this.globalData.userInfo) {
      return true
    }
    wx.navigateTo({ url: '/pages/login/login' })
    return false
  },

  // 保存登录态
  setAuth(token, userInfo) {
    this.globalData.token = token
    this.globalData.userInfo = userInfo
    wx.setStorageSync('token', token)
  },

  // 退出登录
  logout() {
    this.globalData.token = null
    this.globalData.userInfo = null
    this.globalData.currentTank = null
    wx.removeStorageSync('token')
    wx.switchTab({ url: '/pages/dashboard/dashboard' })
  },
})
