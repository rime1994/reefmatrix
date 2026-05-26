// utils/config.js — 环境配置

// 开发环境使用本地 IP，生产环境替换为正式域名
const ENV = {
  dev: {
    BASE_URL: 'http://192.168.69.100:8080/api',
  },
  prod: {
    BASE_URL: 'https://your-domain.com/api',
  },
}

// 当前环境：开发时用 dev，上线前改为 prod
const currentEnv = 'dev'

module.exports = {
  BASE_URL: ENV[currentEnv].BASE_URL,
  IS_DEV: currentEnv === 'dev',

  // 缸型
  TANK_TYPE_LABEL: {
    sps: 'SPS（小水螅体）',
    lps: 'LPS（大水螅体）',
    nps: 'NPS（无光合）',
  },

  // 资产类型
  CATEGORY_LABEL: {
    fish: '鱼类',
    coral: '珊瑚',
    invertebrate: '无脊椎',
    equipment: '设备',
    other: '其他',
  },

  // 生物状态
  STATUS_LABEL: {
    healthy: '健康',
    sick: '病号',
    sold: '已售',
    dead: '死亡',
    transferred: '已转出',
  },

  // 设备状态
  EQUIP_STATUS_LABEL: {
    healthy: '正常运行',
    sick: '故障',
    sold: '已售出',
    dead: '已报废',
    transferred: '已停用',
  },

  // 设备类型
  EQUIPMENT_TYPE_LABEL: {
    light: '灯',
    wavemaker: '造浪',
    skimmer: '蛋分',
    dosing_pump: '滴定泵',
    calcium_reactor: '钙反应器',
    pump: '水泵',
    other: '其他',
  },

  // 水质参数配置
  PARAMETER_META: {
    salinity:    { label: '比重',  unit: 'SG',  color: '#1677ff' },
    temperature: { label: '温度',  unit: '°C',  color: '#ff7a45' },
    ph:          { label: 'pH',   unit: '',    color: '#13c2c2' },
    kh:          { label: 'KH',   unit: 'dKH', color: '#52c41a' },
    ca:          { label: 'Ca',   unit: 'ppm', color: '#722ed1' },
    mg:          { label: 'Mg',   unit: 'ppm', color: '#eb2f96' },
    no3:         { label: 'NO₃',  unit: 'ppm', color: '#fa8c16' },
    po4:         { label: 'PO₄',  unit: 'ppm', color: '#f5222d' },
  },

  // 缸型安全范围
  TANK_TYPE_RANGES: {
    sps: {
      salinity: [1.025, 1.026], temperature: [25.5, 26.5],
      ph: [8.2, 8.4], kh: [7.5, 8.5],
      ca: [420, 440], mg: [1350, 1400],
      no3: [1.0, 5.0], po4: [0.02, 0.05],
    },
    lps: {
      salinity: [1.025, 1.026], temperature: [25.0, 26.5],
      ph: [8.0, 8.3], kh: [8.0, 9.5],
      ca: [400, 450], mg: [1300, 1400],
      no3: [5.0, 15.0], po4: [0.05, 0.15],
    },
    nps: {
      salinity: [1.025, 1.026], temperature: [23.0, 25.0],
      ph: [7.9, 8.2], kh: [7.5, 9.0],
      ca: [400, 450], mg: [1300, 1400],
      no3: [10.0, 30.0], po4: [0.10, 0.50],
    },
  },

  PARAMS_ORDER: ['salinity', 'temperature', 'ph', 'kh', 'ca', 'mg', 'no3', 'po4'],
}
