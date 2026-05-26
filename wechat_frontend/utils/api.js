// utils/api.js — 统一请求封装
const { BASE_URL } = require('./config')

/**
 * 统一发起 HTTP 请求
 * 自动附带 Authorization header，统一处理 401 跳转登录
 */
function request(method, path, data, options = {}) {
  return new Promise((resolve, reject) => {
    const app = getApp()
    const header = {
      'Content-Type': 'application/json',
      ...(app.globalData.token
        ? { Authorization: `Bearer ${app.globalData.token}` }
        : {}),
      ...(options.header || {}),
    }

    wx.request({
      url: `${BASE_URL}${path}`,
      method,
      data,
      header,
      timeout: options.timeout || 30000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          // Token 失效，跳转登录
          app.globalData.token = null
          app.globalData.userInfo = null
          wx.removeStorageSync('token')
          wx.reLaunch({ url: '/pages/login/login' })
          reject(new Error('登录已过期，请重新登录'))
        } else {
          const msg = res.data?.error || `请求失败 (${res.statusCode})`
          reject(new Error(msg))
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'))
      },
    })
  })
}

const api = {
  get:    (path, data, opts) => request('GET', path, data, opts),
  post:   (path, data, opts) => request('POST', path, data, opts),
  put:    (path, data, opts) => request('PUT', path, data, opts),
  delete: (path, data, opts) => request('DELETE', path, data, opts),
}

module.exports = { api }
