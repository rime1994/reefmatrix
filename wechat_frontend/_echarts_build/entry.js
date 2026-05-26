// 精简版 echarts：只包含折线图 + 网格 + 标记区域 + 提示框
const echarts = require('echarts/core')
const { LineChart } = require('echarts/charts')
const { GridComponent, MarkAreaComponent, TooltipComponent, DatasetComponent } = require('echarts/components')
const { CanvasRenderer } = require('echarts/renderers')

echarts.use([
  LineChart,
  GridComponent,
  MarkAreaComponent,
  TooltipComponent,
  DatasetComponent,
  CanvasRenderer,
])

module.exports = echarts
