// ESM 入口 — tree-shaking 精简，只导出 echarts 对象
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, MarkAreaComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart,
  GridComponent,
  MarkAreaComponent,
  TooltipComponent,
  CanvasRenderer,
])

// 直接挂到 globalThis 上，让 footer 脚本能把它赋给 module.exports
globalThis.__echarts = echarts
