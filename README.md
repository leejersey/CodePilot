<p align="center">
  <img src="docs/logo.png" alt="CodePilot" width="80" />
</p>

<h1 align="center">CodePilot — AI 编程学习平台</h1>

<p align="center">
  <strong>问答式 AI 编程导师 · 知识库 RAG 课程 · 个性化学习路线 · 浏览器代码沙箱 · 实时 AI 判题</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/FastAPI-async-009688?logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/PostgreSQL-16%20%2B%20pgvector-336791?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/DeepSeek-API-blue" alt="DeepSeek" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

---

## ✨ 核心特性

| 特性 | 描述 |
|------|------|
| 🤖 **AI 驱动** | DeepSeek LLM 实时生成学习路线、知识讲解和编程练习 |
| 📚 **知识库 RAG** | 管理员上传文档 → 向量检索；主题匹配时生成「知识库课程」，否则走纯 AI 生成 |
| 🎯 **个性化学习** | 根据用户水平和目标定制学习路径，追踪学习进度；支持删除路线 |
| 💬 **流式对话** | WebSocket 实时 AI 对话，逐 token 推送；章节对话可续聊 |
| 🖥️ **代码沙箱** | Monaco Editor + Pyodide 浏览器端 Python 运行；课文代码块可同步到编辑器 |
| 📝 **AI 判题** | 提交代码即获 AI 评分 + 详细反馈 |
| 🔐 **用户认证** | JWT 邮箱注册/登录；`ADMIN_EMAILS` 晋升管理员，知识库仅管理员可管 |
| 📊 **学习仪表盘** | 学习统计、活跃度热力图、技能分布雷达图 |
| 🎬 **动画引擎** | Remotion 驱动的代码步骤动画可视化 |

## 🏗️ 技术栈

```
前端                            后端                          基础设施
├── Next.js 16 (App Router)     ├── FastAPI (async)           ├── PostgreSQL 16 + pgvector
├── React 19                    ├── SQLAlchemy 2.0 (async)    ├── Redis 7
├── TypeScript                  ├── Pydantic V2               ├── Docker Compose
├── TailwindCSS 3               ├── Alembic (数据库迁移)       ├── DeepSeek API (LLM)
├── Zustand (状态管理)           ├── asyncpg (异步 PG 驱动)     └── 阿里云百炼 Embeddings
├── SWR (数据请求)               ├── httpx (异步 HTTP)
├── Monaco Editor (代码编辑)     ├── OpenAI SDK
├── Pyodide (浏览器 Python)      └── 向量检索 (pgvector)
├── Remotion (动画引擎)
├── react-markdown + remark-gfm
└── Lucide React (图标)
```

## 🚀 快速开始

### 前置要求

- **Node.js** ≥ 18
- **Python** ≥ 3.10
- **Docker Desktop**（运行 PostgreSQL + Redis）

### 1. 克隆项目

```bash
git clone https://github.com/your-username/CodePilot.git
cd CodePilot
```

### 2. 配置环境变量

配置以 **`backend/.env` 为准**（会覆盖根目录 `.env`）。可从示例复制：

```bash
cp .env.example backend/.env
```

编辑 `backend/.env`。本地 Docker 默认端口为 **5433**（Postgres）与 **6380**（Redis）：

```env
DATABASE_URL=postgresql+asyncpg://codepilot:dev_password@localhost:5433/codepilot
REDIS_URL=redis://localhost:6380/0

# LLM — DeepSeek
LLM_API_KEY=your-deepseek-api-key-here
LLM_MODEL=deepseek-chat
LLM_BASE_URL=https://api.deepseek.com

# Embeddings — 阿里云百炼 text-embedding-v3（知识库 RAG 需要）
EMBEDDING_API_KEY=your-dashscope-api-key-here
EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_MODEL=text-embedding-v3
EMBEDDING_DIM=1024

APP_ENV=development
APP_DEBUG=true

# 管理员邮箱（逗号分隔）；匹配账号为 admin，可管理知识库
ADMIN_EMAILS=you@example.com
```

### 3. 启动数据库

```bash
docker compose up -d postgres redis
```

### 4. 启动后端

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
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

用 `ADMIN_EMAILS` 中的邮箱注册/登录后，顶栏会出现「知识库」入口。

## 📚 知识库与课程生成（简要）

1. **管理员**在「知识库」上传 Markdown 等资料，系统切分并写入向量。
2. 用户在首页输入主题生成路线时：
   - 若平台有与主题**语言/领域匹配**的就绪知识库 → **知识库课程**（RAG 大纲 + 关联知识库标签）。
   - 若不匹配（例如只有 Python 库、主题却是 Node.js）→ **AI 生成课程**，不会误绑无关库。
3. 学习路线列表可删除整条路线（含章节与相关数据）。

## 📁 项目结构

```
CodePilot/
├── frontend/                     # Next.js 前端
│   ├── src/
│   │   ├── app/                  # 页面路由
│   │   │   ├── auth/             #   登录 / 注册
│   │   │   ├── dashboard/        #   学习仪表盘
│   │   │   ├── exercises/        #   练习中心
│   │   │   ├── exercise/         #   练习详情
│   │   │   ├── history/          #   学习历史
│   │   │   ├── knowledge/        #   知识库管理（管理员）
│   │   │   └── learn/            #   学习路径 / 章节详情
│   │   ├── components/           # UI 组件
│   │   │   ├── layout/           #   Header / Sidebar / Footer
│   │   │   ├── charts/           #   统计图表
│   │   │   ├── animations/       #   动画组件
│   │   │   ├── AuthGuard.tsx     #   登录守卫
│   │   │   ├── AdminGuard.tsx    #   管理员守卫
│   │   │   └── MarkdownRenderer.tsx
│   │   ├── hooks/                # useAuth / usePyodide
│   │   ├── stores/
│   │   └── lib/                  # API 封装 + codeBlocks 等
│   └── package.json
├── backend/                      # FastAPI 后端
│   ├── app/
│   │   ├── main.py               # 入口 + 路由注册
│   │   ├── api/v1/               # REST 路由
│   │   │   ├── auth.py
│   │   │   ├── paths.py          # 路线生成 / 删除 / 知识库绑定
│   │   │   ├── chapters.py
│   │   │   ├── conversations.py
│   │   │   ├── exercises.py
│   │   │   ├── knowledge.py      # 知识库 CRUD + 文档上传（管理员）
│   │   │   ├── code.py
│   │   │   ├── progress.py
│   │   │   └── animation.py
│   │   ├── api/ws/chat.py        # 流式 AI 对话（可带 RAG）
│   │   ├── core/                 # 配置 / 安全 / deps（require_admin）
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/             # LLM / chat / exercise / embeddings / kb_*
│   │   └── db/                   # 数据库 + Redis + Alembic migrations
│   ├── uploads/kb/               # 知识库文档落盘（本地开发）
│   ├── Dockerfile
│   └── requirements.txt
├── design/                       # UI 设计稿
├── docs/
│   └── ARCHITECTURE.md
├── docker-compose.yml
└── .env.example
```

## 🔌 API 接口

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/auth/register` | 邮箱注册 |
| `POST` | `/api/v1/auth/login` | 邮箱密码登录 |
| `GET` | `/api/v1/auth/me` | 当前用户（含 `role`: learner / admin） |

### 学习路径

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/paths/generate` | AI / RAG 生成学习路线 |
| `GET` | `/api/v1/paths/{id}` | 路线详情 |
| `DELETE` | `/api/v1/paths/{id}` | 删除路线（本人或管理员） |
| `GET` | `/api/v1/paths/{id}/chapters` | 章节列表 |
| `GET` | `/api/v1/paths/{id}/knowledge-bases` | 已关联知识库 |
| `PUT` | `/api/v1/paths/{id}/knowledge-bases` | 绑定知识库 |
| `POST` | `/api/v1/paths/{id}/rebuild-from-kb` | 按相关知识库重建大纲 |
| `PATCH` | `/api/v1/chapters/{id}/status` | 更新章节状态 |

### 知识库（管理员）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/knowledge-bases/` | 平台知识库列表 |
| `POST` | `/api/v1/knowledge-bases/` | 创建知识库 |
| `GET` | `/api/v1/knowledge-bases/{id}` | 详情（含文档） |
| `PATCH` | `/api/v1/knowledge-bases/{id}` | 更新 |
| `DELETE` | `/api/v1/knowledge-bases/{id}` | 删除 |
| `POST` | `/api/v1/knowledge-bases/{id}/documents` | 上传文档并入库向量 |
| `DELETE` | `/api/v1/knowledge-bases/{id}/documents/{doc_id}` | 删除文档 |

### 对话 & 练习

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/conversations/` | 创建对话 |
| `GET` | `/api/v1/conversations/by-chapter/{chapter_id}` | 按章节取已有对话（续聊） |
| `GET` | `/api/v1/conversations/{id}/messages` | 消息列表 |
| `WebSocket` | `/ws/chat/{conv_id}` | 流式 AI 对话 |
| `GET` | `/api/v1/exercises` | 练习列表 |
| `GET` | `/api/v1/exercises/languages` | 可用语言 |
| `POST` | `/api/v1/exercises/generate` | AI 生成练习（可参考平台知识库） |
| `GET` | `/api/v1/exercises/{id}` | 练习详情 |
| `POST` | `/api/v1/exercises/{id}/submit` | 提交判题 |
| `GET` | `/api/v1/exercises/{id}/submissions` | 提交记录 |
| `GET` | `/api/v1/exercises/chapter/{chapter_id}` | 章节关联练习 |

### 进度 & 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/progress/stats` | 学习统计概览 |
| `GET` | `/api/v1/progress/paths` | 路线进度（含 `source_type` / `kb_names`） |
| `GET` | `/api/v1/progress/activity` | 活跃度 |
| `GET` | `/api/v1/progress/skill-distribution` | 技能分布 |
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
- [x] **V1.3** — 平台知识库 RAG + 管理员角色 + 主题相关检索 + 路线删除 / 溯源标签
- [ ] **V2** — Manim 动画引擎 + 代码可视化增强 + 数据统计面板
- [ ] **V3** — 多语言支持 + 社区功能 + 成就系统

## 📄 License

MIT
