// wx-canvas.js — 将小程序 Canvas 包装为 ECharts 可识别的类 DOM 对象
class WxCanvas {
  constructor(ctx, canvasId, isNew, canvasNode) {
    this.ctx = ctx
    this.canvasId = canvasId
    this.chart = null
    this.isNew = isNew
    if (isNew) {
      this.canvasNode = canvasNode
    } else {
      this._initStyle(ctx)
    }
    this._initEvent()
  }

  getContext(contextType) {
    if (contextType === '2d') {
      return this.ctx
    }
  }

  setChart(chart) {
    this.chart = chart
  }

  addEventListener() {}
  removeEventListener() {}
  attachEvent() {}
  detachEvent() {}

  _initStyle(ctx) {
    ctx.createRadialGradient = function () {
      return ctx.createCircularGradient(arguments)
    }
  }

  _initEvent() {
    this.event = {}
    const eventNames = [
      { wxName: 'touchStart', ecName: 'mousedown' },
      { wxName: 'touchMove', ecName: 'mousemove' },
      { wxName: 'touchEnd', ecName: 'mouseup' },
      { wxName: 'touchEnd', ecName: 'click' },
    ]
    eventNames.forEach(name => {
      this.event[name.wxName] = e => {
        const touch = e.touches[0]
        this.chart.getZr().handler.dispatch(name.ecName, {
          zrX: touch.x,
          zrY: touch.y,
          preventDefault() {},
          stopImmediatePropagation() {},
          stopPropagation() {},
        })
      }
    })
  }

  set width(w) {
    if (this.canvasNode) this.canvasNode.width = w
  }
  set height(h) {
    if (this.canvasNode) this.canvasNode.height = h
  }
  get width() {
    return this.canvasNode ? this.canvasNode.width : 0
  }
  get height() {
    return this.canvasNode ? this.canvasNode.height : 0
  }
}

module.exports = WxCanvas
