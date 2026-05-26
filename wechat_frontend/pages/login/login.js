// pages/login/login.js — 微信原生登录
const { api } = require('../../utils/api')
const { IS_DEV } = require('../../utils/config')
const { showError, showLoading, hideLoading } = require('../../utils/util')

Page({
  data: {
    avatarUrl: '',
    nickname: '',
    phone: '',        // 显示文字
    phoneCode: '',    // getPhoneNumber 返回的 code
    wxCode: '',       // wx.login 返回的 code
    loading: false,
    canLogin: false,
    isDev: IS_DEV,
    // 开发模式：手动输入手机号 + 密码
    devPhone: '',
    devPassword: '',
    devIsRegister: false,  // true=注册, false=登录
  },

  onLoad() {
    // 预获取 wx.login code（正式环境需要）
    if (!IS_DEV) {
      this.getWxCode()
    }
  },

  getWxCode() {
    wx.login({
      success: (res) => {
        if (res.code) {
          this.setData({ wxCode: res.code })
        }
      },
    })
  },

  // ── 微信授权流程（正式环境） ─────────────────────────

  // 选择头像
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl
    this.setData({ avatarUrl })
    this.checkCanLogin()
  },

  // 昵称输入
  onNicknameChange(e) {
    this.setData({ nickname: e.detail.value })
    this.checkCanLogin()
  },

  // 授权手机号
  onGetPhoneNumber(e) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      showError('需要授权手机号才能使用')
      return
    }
    this.setData({
      phoneCode: e.detail.code,
      phone: '已授权',
    })
    this.checkCanLogin()
  },

  checkCanLogin() {
    if (IS_DEV) {
      // 开发模式只需手机号+密码
      const { devPhone, devPassword } = this.data
      this.setData({
        canLogin: !!(devPhone && devPhone.trim() && devPassword && devPassword.length >= 6),
      })
    } else {
      const { nickname, phoneCode } = this.data
      this.setData({
        canLogin: !!(nickname && nickname.trim() && phoneCode),
      })
    }
  },

  // ── 开发模式输入 ─────────────────────────────────

  onDevPhoneInput(e) {
    this.setData({ devPhone: e.detail.value })
    this.checkCanLogin()
  },

  onDevPasswordInput(e) {
    this.setData({ devPassword: e.detail.value })
    this.checkCanLogin()
  },

  onToggleDevMode() {
    this.setData({ devIsRegister: !this.data.devIsRegister })
  },

  // ── 发起登录 ────────────────────────────────────

  async onLogin() {
    if (IS_DEV) {
      return this.doDevLogin()
    }
    return this.doWxLogin()
  },

  // 开发模式：手机号 + 密码 直接调后端 register/login
  async doDevLogin() {
    const { devPhone, devPassword, nickname, devIsRegister } = this.data

    this.setData({ loading: true })
    showLoading(devIsRegister ? '注册中...' : '登录中...')

    try {
      let res
      if (devIsRegister) {
        res = await api.post('/auth/register', {
          phone: devPhone.trim(),
          password: devPassword,
          nickname: (nickname && nickname.trim()) || '开发用户',
        })
      } else {
        res = await api.post('/auth/login', {
          phone: devPhone.trim(),
          password: devPassword,
        })
      }

      const app = getApp()
      app.setAuth(res.token, res.user)

      hideLoading()
      wx.showToast({ title: devIsRegister ? '注册成功' : '登录成功', icon: 'success' })

      setTimeout(() => {
        wx.navigateBack({ fail: () => {
          wx.switchTab({ url: '/pages/dashboard/dashboard' })
        }})
      }, 500)
    } catch (err) {
      hideLoading()
      showError(err.message || (devIsRegister ? '注册失败' : '登录失败'))
    } finally {
      this.setData({ loading: false })
    }
  },

  // 正式环境：微信授权登录
  async doWxLogin() {
    const { wxCode, nickname, avatarUrl, phoneCode } = this.data

    if (!wxCode) {
      this.getWxCode()
      showError('请稍后重试')
      return
    }

    if (!nickname || !nickname.trim()) {
      showError('请输入昵称')
      return
    }

    if (!phoneCode) {
      showError('请授权手机号')
      return
    }

    this.setData({ loading: true })
    showLoading('登录中...')

    try {
      const res = await api.post('/auth/wx-login', {
        code: wxCode,
        nickname: nickname.trim(),
        avatar_url: avatarUrl,
        phone_code: phoneCode,
      })

      const app = getApp()
      app.setAuth(res.token, res.user)

      hideLoading()
      wx.showToast({ title: '登录成功', icon: 'success' })

      setTimeout(() => {
        wx.navigateBack({ fail: () => {
          wx.switchTab({ url: '/pages/dashboard/dashboard' })
        }})
      }, 500)
    } catch (err) {
      hideLoading()
      showError(err.message || '登录失败')
      this.getWxCode()
    } finally {
      this.setData({ loading: false })
    }
  },
})
