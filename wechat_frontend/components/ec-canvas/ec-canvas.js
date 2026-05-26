// ec-canvas 组件 — 基于官方 echarts-for-weixin，转为 CommonJS
const WxCanvas = require('./wx-canvas')
const echarts = require('./echarts')

function wrapTouch(event) {
  for (let i = 0; i < event.touches.length; ++i) {
    const touch = event.touches[i]
    touch.offsetX = touch.x
    touch.offsetY = touch.y
  }
  return event
}

Component({
  properties: {
    canvasId: {
      type: String,
      value: 'ec-canvas',
    },
    ec: {
      type: Object,
    },
  },

  data: {
    isUseNewCanvas: false,
  },

  lifetimes: {
    ready() {
      if (echarts.registerPreprocessor) {
        echarts.registerPreprocessor(option => {
          if (option && option.series) {
            if (Array.isArray(option.series)) {
              option.series.forEach(s => { s.progressive = 0 })
            } else if (typeof option.series === 'object') {
              option.series.progressive = 0
            }
          }
        })
      }

      if (!this.data.ec) {
        console.warn('[ec-canvas] 需要绑定 ec 属性')
        return
      }

      if (!this.data.ec.lazyLoad) {
        this.init()
      }
    },
    detached() {
      if (this.chart) {
        this.chart.dispose()
        this.chart = null
      }
    },
  },

  methods: {
    // callback 签名: (canvas, width, height, dpr) => chart
    // 调用方必须返回 echarts.init 创建的 chart 实例
    init(callback) {
      const version = wx.getSystemInfoSync().SDKVersion
      const isUseNewCanvas = this._compareVersion(version, '2.9.0') >= 0
      this.setData({ isUseNewCanvas })

      if (isUseNewCanvas) {
        this._initNewCanvas(callback)
      } else {
        this._initOldCanvas(callback)
      }
    },

    _initNewCanvas(callback) {
      console.log('[ec-canvas] _initNewCanvas 开始, callback:', typeof callback)
      const query = wx.createSelectorQuery().in(this)
      query
        .select('.ec-canvas')
        .fields({ node: true, size: true })
        .exec(res => {
          console.log('[ec-canvas] query exec 结果:', JSON.stringify(res && res[0] ? { width: res[0].width, height: res[0].height, hasNode: !!res[0].node } : null))
          if (!res || !res[0] || !res[0].node) {
            console.error('[ec-canvas] 未获取到 canvas 节点')
            return
          }

          const canvasNode = res[0].node
          this.canvasNode = canvasNode

          const canvasDpr = wx.getSystemInfoSync().pixelRatio
          const canvasWidth = res[0].width
          const canvasHeight = res[0].height

          console.log('[ec-canvas] canvas 尺寸:', canvasWidth, 'x', canvasHeight, 'dpr:', canvasDpr)

          const ctx = canvasNode.getContext('2d')
          console.log('[ec-canvas] ctx:', typeof ctx)

          const canvas = new WxCanvas(ctx, this.data.canvasId, true, canvasNode)

          if (echarts.setPlatformAPI) {
            console.log('[ec-canvas] 调用 setPlatformAPI')
            echarts.setPlatformAPI({
              createCanvas: () => canvas,
              loadImage: (src, onload, onerror) => {
                if (canvasNode.createImage) {
                  const image = canvasNode.createImage()
                  image.onload = onload
                  image.onerror = onerror
                  image.src = src
                  return image
                }
              },
            })
          } else if (echarts.setCanvasCreator) {
            console.log('[ec-canvas] 调用 setCanvasCreator')
            echarts.setCanvasCreator(() => canvas)
          }

          try {
            if (typeof callback === 'function') {
              console.log('[ec-canvas] 执行 callback')
              this.chart = callback(canvas, canvasWidth, canvasHeight, canvasDpr)
              console.log('[ec-canvas] callback 返回 chart:', !!this.chart)
            } else if (this.data.ec && typeof this.data.ec.onInit === 'function') {
              console.log('[ec-canvas] 执行 ec.onInit')
              this.chart = this.data.ec.onInit(canvas, canvasWidth, canvasHeight, canvasDpr)
            } else {
              console.warn('[ec-canvas] 无 callback 也无 ec.onInit')
            }
          } catch (err) {
            console.error('[ec-canvas] 初始化图表出错:', err.message, err.stack)
          }
        })
    },

    _initOldCanvas(callback) {
      const ctx = wx.createCanvasContext(this.data.canvasId, this)
      const canvas = new WxCanvas(ctx, this.data.canvasId, false)

      if (echarts.setPlatformAPI) {
        echarts.setPlatformAPI({ createCanvas: () => canvas })
      } else if (echarts.setCanvasCreator) {
        echarts.setCanvasCreator(() => canvas)
      }

      const query = wx.createSelectorQuery().in(this)
      query.select('.ec-canvas').boundingClientRect(res => {
        if (typeof callback === 'function') {
          this.chart = callback(canvas, res.width, res.height, 1)
        } else if (this.data.ec && typeof this.data.ec.onInit === 'function') {
          this.chart = this.data.ec.onInit(canvas, res.width, res.height, 1)
        }
      }).exec()
    },

    canvasToTempFilePath(opt) {
      if (this.data.isUseNewCanvas) {
        const query = wx.createSelectorQuery().in(this)
        query
          .select('.ec-canvas')
          .fields({ node: true, size: true })
          .exec(res => {
            opt.canvas = res[0].node
            wx.canvasToTempFilePath(opt)
          })
      } else {
        if (!opt.canvasId) {
          opt.canvasId = this.data.canvasId
        }
        wx.canvasToTempFilePath(opt, this)
      }
    },

    touchStart(e) {
      if (this.chart && e.touches.length > 0) {
        const touch = e.touches[0]
        const handler = this.chart.getZr().handler
        handler.dispatch('mousedown', {
          zrX: touch.x, zrY: touch.y,
          preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {},
        })
        handler.dispatch('mousemove', {
          zrX: touch.x, zrY: touch.y,
          preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {},
        })
        handler.processGesture(wrapTouch(e), 'start')
      }
    },

    touchMove(e) {
      if (this.chart && e.touches.length > 0) {
        const touch = e.touches[0]
        this.chart.getZr().handler.dispatch('mousemove', {
          zrX: touch.x, zrY: touch.y,
          preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {},
        })
        this.chart.getZr().handler.processGesture(wrapTouch(e), 'change')
      }
    },

    touchEnd(e) {
      if (this.chart) {
        const touch = e.changedTouches ? e.changedTouches[0] : {}
        const handler = this.chart.getZr().handler
        handler.dispatch('mouseup', {
          zrX: touch.x, zrY: touch.y,
          preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {},
        })
        handler.dispatch('click', {
          zrX: touch.x, zrY: touch.y,
          preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {},
        })
        handler.processGesture(wrapTouch(e), 'end')
      }
    },

    _compareVersion(v1, v2) {
      v1 = v1.split('.')
      v2 = v2.split('.')
      const len = Math.max(v1.length, v2.length)
      while (v1.length < len) v1.push('0')
      while (v2.length < len) v2.push('0')
      for (let i = 0; i < len; i++) {
        const n1 = parseInt(v1[i])
        const n2 = parseInt(v2[i])
        if (n1 > n2) return 1
        if (n1 < n2) return -1
      }
      return 0
    },
  },
})
