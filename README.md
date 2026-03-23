<p align="center">
  <img src="docs/logo.svg" alt="CodePilot" width="80" />
</p>

<h1 align="center">CodePilot — AI 编程学习平台</h1>

<p align="center">
  <strong>问答式 AI 编程导师 · 个性化学习路线 · 浏览器代码沙箱 · 实时 AI 判题</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/FastAPI-async-009688?logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/DeepSeek-API-blue" alt="DeepSeek" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

---

## ✨ 核心特性

| 特性 | 描述 |
|------|------|
| 🤖 **AI 驱动** | DeepSeek LLM 实时生成学习路线、知识讲解和编程练习 |
| 🎯 **个性化学习** | 根据用户水平和目标定制学习路径，追踪学习进度 |
| 💬 **流式对话** | WebSocket 实时 AI 对话，逐 token 推送 |
| 🖥️ **代码沙箱** | Monaco Editor + Pyodide 浏览器端 Python 运行，零后端依赖 |
| 📝 **AI 判题** | 提交代码即获 AI 评分 + 详细反馈 |
| 🔐 **用户认证** | JWT 邮箱注册/登录，受保护页面 AuthGuard 拦截 |
| 📊 **学习仪表盘** | 学习统计、活跃度热力图、技能分布雷达图 |
| 🎬 **动画引擎** | Remotion 驱动的代码步骤动画可视化 |

## 🏗️ 技术栈

```
前端                            后端                          基础设施
├── Next.js 16 (App Router)     ├── FastAPI (async)           ├── PostgreSQL 16
├── React 19                    ├── SQLAlchemy 2.0 (async)    ├── Redis 7
├── TypeScript                  ├── Pydantic V2               ├── Docker Compose
├── TailwindCSS 3               ├── Alembic (数据库迁移)       └── DeepSeek API (OpenAI 兼容)
├── Zustand (状态管理)           ├── asyncpg (异步 PG 驱动)
├── SWR (数据请求)               ├── httpx (异步 HTTP)
├── Monaco Editor (代码编辑)     └── OpenAI SDK
├── Pyodide (浏览器 Python)
├── Remotion (动画引擎)
├── react-markdown + remark-gfm
└── Lucide React (图标)
```

## 🚀 快速开始

### 前置要求

- **Node.js** ≥ 18
- **Python** ≥ 3.12
- **Docker Desktop** (运行 PostgreSQL + Redis)

### 1. 克隆项目

```bash
git clone https://github.com/your-username/CodePilot.git
cd CodePilot
```

### 2. 配置环境变量

```bash
cp .env.example backend/.env
```

编辑 `backend/.env`，填入以下配置：

```env
DATABASE_URL=postgresql+asyncpg://codepilot:dev_password@localhost:5432/codepilot
REDIS_URL=redis://localhost:6379/0
LLM_API_KEY=your-deepseek-api-key-here
LLM_MODEL=deepseek-chat
LLM_BASE_URL=https://api.deepseek.com
```

### 3. 启动数据库

```bash
docker compose up -d postgres redis
```

### 4. 启动后端

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 数据库迁移
alembic upgrade head

# 启动服务
uvicorn app.main:app --reload --port 8000
```

- API 文档：http://localhost:8000/docs
- ReDoc：http://localhost:8000/redoc

### 5. 启动前端

```bash
cd frontend
npm install
npm run dev
```

访问：http://localhost:3000

## 📁 项目结构

```
CodePilot/
├── frontend/                     # Next.js 前端
│   ├── src/
│   │   ├── app/                  # 页面路由
│   │   │   ├── auth/             #   登录 / 注册
│   │   │   ├── dashboard/        #   学习仪表盘
│   │   │   ├── exercises/        #   练习中心（独立）
│   │   │   ├── exercise/         #   练习详情
│   │   │   ├── history/          #   学习历史
│   │   │   └── learn/            #   学习路径 / 章节详情
│   │   ├── components/           # UI 组件
│   │   │   ├── layout/           #   Header / Footer
│   │   │   ├── charts/           #   统计图表
│   │   │   ├── animations/       #   动画组件
│   │   │   ├── AuthGuard.tsx     #   路由鉴权守卫
│   │   │   └── MarkdownRenderer.tsx  # Markdown 渲染
│   │   ├── hooks/                # 自定义 Hooks
│   │   │   ├── useAuth.ts        #   认证状态管理
│   │   │   └── usePyodide.ts     #   Pyodide 运行时
│   │   ├── stores/               # Zustand 状态
│   │   └── lib/                  # API 封装 + 工具函数
│   └── package.json
├── backend/                      # FastAPI 后端
│   ├── app/
│   │   ├── main.py               # 入口 + 路由注册
│   │   ├── api/v1/               # REST 路由
│   │   │   ├── auth.py           #   注册 / 登录 / 当前用户
│   │   │   ├── paths.py          #   学习路径 CRUD + AI 生成
│   │   │   ├── chapters.py       #   章节管理
│   │   │   ├── conversations.py  #   对话管理
│   │   │   ├── exercises.py      #   练习 CRUD + AI 生成 / 判题
│   │   │   ├── code.py           #   代码运行
│   │   │   ├── progress.py       #   学习进度 / 统计
│   │   │   └── animation.py      #   动画生成
│   │   ├── api/ws/               # WebSocket 路由
│   │   │   └── chat.py           #   流式 AI 对话
│   │   ├── core/                 # 配置 + 安全 + 依赖注入
│   │   ├── models/               # SQLAlchemy ORM 模型
│   │   ├── schemas/              # Pydantic 请求/响应模型
│   │   ├── services/             # 业务逻辑 (LLM/对话/判题)
│   │   └── db/                   # 数据库 + Redis 连接
│   ├── alembic/                  # 数据库迁移脚本
│   ├── Dockerfile
│   └── requirements.txt
├── design/                       # UI 设计稿 (HTML + PNG)
├── docs/
│   └── ARCHITECTURE.md           # 架构设计文档
├── docker-compose.yml
└── .env.example
```

## 🔌 API 接口

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/auth/register` | 邮箱注册 |
| `POST` | `/api/v1/auth/login` | 邮箱密码登录 |
| `GET` | `/api/v1/auth/me` | 获取当前用户信息 (JWT) |

### 学习路径

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/paths/generate` | AI 生成学习路线 |
| `GET` | `/api/v1/paths/{id}` | 获取路线详情 |
| `GET` | `/api/v1/paths/{id}/chapters` | 获取章节列表 |
| `PATCH` | `/api/v1/chapters/{id}/status` | 更新章节状态 |

### 对话 & 练习

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/conversations/` | 创建对话 |
| `GET` | `/api/v1/conversations/{id}/messages` | 获取消息列表 |
| `WebSocket` | `/ws/chat/{conv_id}` | 流式 AI 对话 |
| `GET` | `/api/v1/exercises` | 获取练习列表 (支持筛选) |
| `GET` | `/api/v1/exercises/languages` | 获取可用语言列表 |
| `POST` | `/api/v1/exercises/generate` | AI 生成练习题 |
| `GET` | `/api/v1/exercises/{id}` | 获取练习详情 |
| `POST` | `/api/v1/exercises/{id}/submit` | 提交代码 AI 判题 |
| `GET` | `/api/v1/exercises/{id}/submissions` | 获取提交记录 |
| `GET` | `/api/v1/exercises/chapter/{chapter_id}` | 获取章节关联练习 |

### 进度 & 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/progress/stats` | 学习统计概览 |
| `GET` | `/api/v1/progress/paths` | 学习路径进度 |
| `GET` | `/api/v1/progress/activity` | 学习活跃度数据 |
| `GET` | `/api/v1/progress/skill-distribution` | 技能分布数据 |
| `POST` | `/api/v1/code/run` | 运行代码 |
| `POST` | `/api/v1/animation/generate` | 生成代码动画 |
| `GET` | `/health` | 健康检查 |

## 📸 页面预览

<table>
  <tr>
    <td align="center"><strong>首页</strong></td>
    <td align="center"><strong>学习路径</strong></td>
  </tr>
  <tr>
    <td><img src="design/home.png" width="400" /></td>
    <td><img src="design/learning_path.png" width="400" /></td>
  </tr>
  <tr>
    <td align="center"><strong>章节详情</strong></td>
    <td align="center"><strong>练习中心</strong></td>
  </tr>
  <tr>
    <td><img src="design/learning_detail.png" width="400" /></td>
    <td><img src="design/exercises_hub.png" width="400" /></td>
  </tr>
  <tr>
    <td align="center"><strong>练习详情</strong></td>
    <td></td>
  </tr>
  <tr>
    <td><img src="design/exercise.png" width="400" /></td>
    <td></td>
  </tr>
</table>

## 📝 开发路线

- [x] **MVP** — 核心对话 + 学习路线 + 代码沙箱 + AI 判题
- [x] **V1.1** — 邮箱注册/登录 + JWT 认证 + AuthGuard 路由保护
- [x] **V1.2** — 独立练习中心 + 学习仪表盘 + 进度追踪 + 历史记录
- [ ] **V2** — Manim 动画引擎 + 代码可视化 + 数据统计面板
- [ ] **V3** — 多语言支持 + 社区功能 + 成就系统

## 📄 License

MIT
