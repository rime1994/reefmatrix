// pages/mine/mine.js — 个人中心
Page({
  data: {
    userInfo: null,
  },

  onShow() {
    const app = getApp()
    this.setData({ userInfo: app.globalData.userInfo })
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '退出后需重新登录',
      confirmText: '退出',
      confirmColor: '#ff4d4f',
      success(res) {
        if (res.confirm) {
          const app = getApp()
          app.logout()
        }
      },
    })
  },
})
