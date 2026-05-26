// pages/dashboard/dashboard.js — 水质看板
// 注意：echarts 不在顶部 require，在回调中懒加载
const { api } = require('../../utils/api')
const { PARAMETER_META, TANK_TYPE_RANGES, PARAMS_ORDER } = require('../../utils/config')
const { formatShortTime, timeAgo, showError } = require('../../utils/util')

// 懒加载 echarts（仅在首次打开图表时加载，避免阻塞页面渲染）
let _echarts = null
function getEcharts() {
  if (!_echarts) {
    _echarts = require('../../components/ec-canvas/echarts')
  }
  return _echarts
}

Page({
  data: {
    isLoggedIn: false,
    loading: false,
    tanks: [],
    tankNames: [],
    tankIndex: 0,
    currentTank: null,
    paramCards: [],
    operations: [],
    // 状态汇总
    safeCount: 0,
    warnCount: 0,
    nodataCount: 0,
    // 图表弹窗
    chartVisible: false,
    chartTitle: '',
    chartKey: '',
    chartColor: '#0891b2',
    // ec-canvas 组件配置
    ecConfig: {
      lazyLoad: true,
    },
  },

  _rawParams: [],

  onShow() {
    const app = getApp()
    const isLoggedIn = !!(app.globalData.token && app.globalData.userInfo)
    this.setData({ isLoggedIn })

    if (isLoggedIn) {
      this.loadTanks()
    }
  },

  onPullDownRefresh() {
    if (this.data.isLoggedIn) {
      this.loadTanks().then(() => wx.stopPullDownRefresh())
    } else {
      wx.stopPullDownRefresh()
    }
  },

  // ── 鱼缸 & 水质数据 ──────────────────────────

  async loadTanks() {
    this.setData({ loading: true })
    try {
      const tanks = await api.get('/tanks')
      const tankNames = tanks.map(t => `${t.name}（${(t.tank_type || 'sps').toUpperCase()}）`)

      const app = getApp()
      let tankIndex = 0
      if (app.globalData.currentTank) {
        const idx = tanks.findIndex(t => t.id === app.globalData.currentTank.id)
        if (idx >= 0) tankIndex = idx
      }

      this.setData({ tanks, tankNames, tankIndex, loading: false })

      if (tanks.length > 0) {
        this.selectTank(tankIndex)
      }
    } catch (err) {
      this.setData({ loading: false })
      showError(err.message)
    }
  },

  selectTank(index) {
    const tank = this.data.tanks[index]
    if (!tank) return

    const app = getApp()
    app.globalData.currentTank = tank
    this.setData({ currentTank: tank, tankIndex: index })
    this.loadParams(tank)
  },

  onTankChange(e) {
    this.selectTank(Number(e.detail.value))
  },

  async loadParams(tank) {
    try {
      const params = await api.get(`/tanks/${tank.id}/parameters`)
      this._rawParams = params
      const tankType = tank.tank_type || 'sps'
      const ranges = TANK_TYPE_RANGES[tankType] || TANK_TYPE_RANGES.sps

      const paramCards = PARAMS_ORDER.map(key => {
        const meta = PARAMETER_META[key]
        const range = ranges[key]
        let value = null
        let recordedAt = null

        for (const p of params) {
          if (p[key] != null) {
            value = p[key]
            recordedAt = p.recorded_at
            break
          }
        }

        let status = 'nodata'
        if (value != null) {
          status = (value >= range[0] && value <= range[1]) ? 'safe' : 'warn'
        }

        return {
          key,
          label: meta.label,
          unit: meta.unit,
          color: meta.color,
          value: value != null ? String(value) : '',
          rangeMin: range[0],
          rangeMax: range[1],
          status,
          timeAgo: recordedAt ? timeAgo(recordedAt) : '',
        }
      })

      const operations = params
        .filter(p => p.notes && p.notes.trim())
        .slice(0, 5)
        .map(p => ({
          id: p.id,
          shortTime: formatShortTime(p.recorded_at),
          notes: p.notes,
        }))

      const safeCount   = paramCards.filter(p => p.status === 'safe').length
      const warnCount   = paramCards.filter(p => p.status === 'warn').length
      const nodataCount = paramCards.filter(p => p.status === 'nodata').length
      this.setData({ paramCards, operations, safeCount, warnCount, nodataCount })
    } catch (err) {
      showError(err.message)
    }
  },

  // ── 图表弹窗 ────────────────────────────────

  onParamTap(e) {
    const key = e.currentTarget.dataset.key
    const meta = PARAMETER_META[key]
    if (!meta) return

    this.setData({
      chartVisible: true,
      chartTitle: `${meta.label} 趋势`,
      chartKey: key,
      chartColor: meta.color,
    }, () => {
      // setData 回调：DOM 已更新，ec-canvas 组件已存在
      console.log('[dashboard] setData 回调触发，查找 #param-chart')

      // 再加一小段延迟，确保组件 ready 生命周期执行完
      setTimeout(() => {
        const ecComp = this.selectComponent('#param-chart')
        console.log('[dashboard] ecComp:', !!ecComp)
        if (!ecComp) {
          console.error('[dashboard] selectComponent #param-chart 失败')
          return
        }

        const that = this
        console.log('[dashboard] 调用 ecComp.init')
        ecComp.init(function (canvas, width, height, dpr) {
          console.log('[dashboard] init 回调触发, canvas:', typeof canvas, 'size:', width, 'x', height, 'dpr:', dpr)
          try {
            const echarts = getEcharts()
            console.log('[dashboard] echarts loaded, init:', typeof echarts.init)
            const chart = echarts.init(canvas, null, {
              width: width,
              height: height,
              devicePixelRatio: dpr,
            })
            console.log('[dashboard] chart 创建成功:', !!chart)
            that._setChartOption(chart, key)
            console.log('[dashboard] setOption 完成')
            return chart
          } catch (err) {
            console.error('[dashboard] 图表初始化出错:', err.message, err.stack)
          }
        })
      }, 100)
    })
  },

  onCloseChart() {
    this.setData({ chartVisible: false, chartKey: '' })
  },

  _setChartOption(chart, key) {
    const tank = this.data.currentTank
    const tankType = tank ? (tank.tank_type || 'sps') : 'sps'
    const ranges = TANK_TYPE_RANGES[tankType] || TANK_TYPE_RANGES.sps
    const meta = PARAMETER_META[key]
    const [safeMin, safeMax] = ranges[key]

    // 过滤有该参数值的记录，按时间正序
    const records = (this._rawParams || [])
      .filter(p => p[key] != null)
      .slice()
      .reverse()

    const dates = records.map(p => {
      const d = new Date(p.recorded_at)
      return `${d.getMonth() + 1}/${d.getDate()}`
    })
    const values = records.map(p => p[key])

    // 自适应 Y 轴：数据范围 ∪ 安全范围 + 30% padding
    const dataMin = values.length ? Math.min(...values) : safeMin
    const dataMax = values.length ? Math.max(...values) : safeMax
    const lo = Math.min(dataMin, safeMin)
    const hi = Math.max(dataMax, safeMax)
    const pad = (hi - lo) * 0.3 || safeMax * 0.05
    const yMin = +(lo - pad).toFixed(4)
    const yMax = +(hi + pad).toFixed(4)

    // 数据点：正常=绿小点，异常=红大点
    const seriesData = values.map(v => {
      const isNormal = v >= safeMin && v <= safeMax
      return {
        value: v,
        itemStyle: { color: isNormal ? '#52c41a' : '#ff4d4f' },
        symbolSize: isNormal ? 4 : 8,
      }
    })

    chart.setOption({
      animation: false,
      grid: {
        left: 50,
        right: 16,
        top: 20,
        bottom: 32,
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { fontSize: 10, color: '#8c8c8c' },
        axisLine: { lineStyle: { color: '#d9d9d9' } },
      },
      yAxis: {
        type: 'value',
        min: yMin,
        max: yMax,
        axisLabel: { fontSize: 10, color: '#8c8c8c' },
        splitLine: { lineStyle: { color: '#f0f0f0' } },
      },
      series: [
        {
          type: 'line',
          data: seriesData,
          smooth: true,
          symbol: 'circle',
          lineStyle: {
            color: meta.color,
            width: 2,
          },
          markArea: {
            silent: true,
            data: [
              [
                { yAxis: safeMax, itemStyle: { color: 'rgba(255,77,79,0.10)' } },
                { yAxis: yMax },
              ],
              [
                { yAxis: yMin, itemStyle: { color: 'rgba(255,77,79,0.10)' } },
                { yAxis: safeMin },
              ],
            ],
          },
        },
      ],
      tooltip: {
        trigger: 'axis',
        confine: true,
        textStyle: { fontSize: 12 },
      },
    })
  },

  // ── 需要登录的操作 ────────────────────────────

  onGoLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  onRecordParam() {
    if (!getApp().requireAuth()) return
    wx.navigateTo({ url: '/pages/tank/tank?action=record' })
  },

  onCreateTank() {
    if (!getApp().requireAuth()) return
    wx.navigateTo({ url: '/pages/tank/tank?action=create' })
  },
})
