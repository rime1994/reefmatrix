# ReefMatrix 造礁矩阵

> 开源海水珊瑚缸管理平台 · Go + React · Docker 一键部署

ReefMatrix 帮助海水玩家系统地管理珊瑚缸数据，包括水质趋势跟踪、添加剂用量计算、生物资产记录，以及由 DeepSeek 驱动的 AI 水质分析。

---

## 功能亮点

| 模块 | 说明 |
|------|------|
| 水质记录 | 支持 KH、Ca、Mg、pH、NO₃、PO₄、比重、温度，任意字段可选填，支持回填历史时间 |
| 参数趋势 | 各参数独立折线图，对照 SPS / LPS / NPS 标准区间高亮异常，自动计算日间消耗速率 |
| 添加剂计算器 | 智能建议（根据最新水质自动推算缺口）+ 手动计算两种模式，按国药分析纯精度计算 |
| AI 水质分析 | 调用 DeepSeek 生成综合评估、问题诊断与补充建议，每用户 100 次额度 |
| 生物资产 | 鱼类、珊瑚、无脊椎动物、设备分类管理，追踪健康状态 |
| 提醒系统 | 自定义维护提醒，到期轮询提示 |
| 管理后台 | 管理员可管理用户、配置 AI API 密钥并测试连通性 |

---

## 技术栈

**Backend** — Go 1.22 · Gin · GORM · PostgreSQL · JWT  
**Frontend** — React 18 · TypeScript · Vite · Ant Design 5 · TanStack Query  
**部署** — Docker · Docker Compose · Nginx

---

## 快速开始

### 环境要求

- Docker & Docker Compose
- （本地开发）Go 1.22+、Node.js 18+

### 生产部署（Docker Compose）

```bash
# 1. 克隆仓库
git clone https://github.com/rime1994/reefmatrix.git
cd reefmatrix

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，至少修改 JWT_SECRET 和数据库密码

# 3. 启动服务
docker compose up -d

# 4. 执行数据库迁移
docker compose exec backend sh -c "
  for f in /app/migrations/*.up.sql; do
    psql \$DATABASE_URL -f \$f
  done
"
```

访问 `http://localhost:3000`，默认管理员账号：`admin` / `Admin@123`（首次登录后请立即修改密码）

### 本地开发

```bash
# 启动 PostgreSQL
docker compose -f docker-compose.dev.yml up -d postgres

# 后端（根目录 backend/）
cd backend
cp ../.env.example .env   # 按需修改
go run ./cmd/server        # 或 air（热重载）

# 前端（根目录 frontend/）
cd frontend
npm install
npm run dev
```

---

## 数据库迁移

迁移文件位于 `backend/migrations/`，按序号升序执行：

```
001_init.up.sql              — 基础表结构
002_add_tank_type_and_ph     — 缸型与 pH 字段
003_add_role_and_api_keys    — 用户角色与 API 密钥表
004_add_ai_analyses          — AI 分析记录表
```

---

## 配置说明

复制 `.env.example` 为 `.env` 后按需修改：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DB_HOST` | PostgreSQL 主机 | `localhost` |
| `DB_PORT` | PostgreSQL 端口 | `5432` |
| `DB_USER` | 数据库用户名 | `reefmatrix` |
| `DB_PASSWORD` | 数据库密码 | `reefmatrix_dev` |
| `DB_NAME` | 数据库名 | `reefmatrix` |
| `JWT_SECRET` | JWT 签名密钥（**生产环境必须修改**） | `change_me_in_production` |
| `PORT` | 后端监听端口 | `8080` |
| `ENV` | 运行环境（`development` / `production`） | `development` |
| `ADMIN_PHONE` | 管理员账号 | `admin` |
| `ADMIN_PASSWORD` | 管理员初始密码 | `Admin@123` |

AI 分析功能需在管理后台「API 密钥」中添加有效的 DeepSeek API Key 并启用。

---

## License

[MIT](LICENSE)
