<p align="center">
  <img src="docs/logo.png" alt="CodePilot" width="80" />
</p>

<h1 align="center">CodePilot — AI 编程学习平台</h1>

<p align="center">
  <strong>问答式 AI 导师 · 截图多模态 · 文档学习模式 · 知识库 RAG · 管理员出题 · 浏览器沙箱 · 实时判题</strong>
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
| 🤖 **AI 教学** | DeepSeek（默认 `deepseek-flash`）流式讲解；可上传/粘贴报错截图多模态问答；章节对话可续聊；个人 LLM 配置可覆盖平台默认 |
| 📖 **文档学习** | 章节页切换「AI 教学 / 文档学习」；讲义摘要 + 知识库原文分阶段阅读；提问带当前阶段上下文 |
| 📚 **知识库 RAG** | 管理员上传文档 → 向量检索；主题匹配时生成知识库课程，否则纯 AI 生成 |
| 🎯 **个性化路径** | 按水平与目标定制路线；进度追踪；可删除路线 |
| 🖥️ **代码沙箱** | Monaco 语法高亮；Pyodide 浏览器跑 Python；代码块可「同步至沙箱」 |
| 🎬 **知识点讲解** | 代码块旁「动画讲解」：生成 Remotion 短片并含运行结果 |
| 📝 **练习演练场** | 管理员基于知识库异步出题并编辑；Judge0 真实运行测试后才可发布 |
| 🔐 **用户认证** | JWT 注册登录；`ADMIN_EMAILS` 晋升管理员；知识库 / 练习管理仅管理员 |
| 👤 **个人中心** | 分板块：账号与安全 · 模型配置 · 用量统计；多 LLM Profile 可切换 |
| 📊 **学习仪表盘** | 统计、活跃度热力图、技能雷达 |

## 🏗️ 技术栈

```
前端                            后端                          基础设施
├── Next.js 16 (App Router)     ├── FastAPI (async)           ├── PostgreSQL 16 + pgvector
├── React 19                    ├── SQLAlchemy 2.0 (async)    ├── Redis 7
├── TypeScript                  ├── Pydantic V2               ├── Docker Compose
├── TailwindCSS 3               ├── Alembic (数据库迁移)       ├── DeepSeek API (LLM)
├── Zustand (状态管理)           ├── asyncpg                   └── 阿里云百炼 Embeddings
├── Monaco Editor               ├── httpx / OpenAI SDK
├── Pyodide (浏览器 Python)      └── pgvector 检索
├── Remotion (讲解动画)
├── react-markdown + Prism 高亮
└── Lucide React
```

## 🚀 快速开始

### 前置要求

- **Node.js** ≥ 18
- **Python** ≥ 3.10
- **Docker Desktop**（PostgreSQL + Redis）

### 1. 克隆项目

```bash
git clone https://github.com/your-username/CodePilot.git
cd CodePilot
```

### 2. 配置环境变量

配置以 **`backend/.env` 为准**（会覆盖根目录 `.env`）：

```bash
cp .env.example backend/.env
```

本地 Docker 默认端口：**5433**（Postgres）、**6380**（Redis）：

```env
DATABASE_URL=postgresql+asyncpg://codepilot:dev_password@localhost:5433/codepilot
REDIS_URL=redis://localhost:6380/0

# LLM — DeepSeek（deepseek-flash 支持识图；需官方开通视觉能力）
LLM_API_KEY=your-deepseek-api-key-here
LLM_MODEL=deepseek-flash
LLM_BASE_URL=https://api.deepseek.com

# Embeddings — 阿里云百炼（知识库 RAG）
EMBEDDING_API_KEY=your-dashscope-api-key-here
EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_MODEL=text-embedding-v3
EMBEDDING_DIM=1024

APP_ENV=development
APP_DEBUG=true

# 管理员邮箱（逗号分隔）
ADMIN_EMAILS=you@example.com

# 火山 TOS（可选；对话截图持久化）
# TOS_ACCESS_KEY=
# TOS_SECRET_KEY=
# TOS_ENDPOINT=tos-cn-beijing.volces.com
# TOS_REGION=cn-beijing
# TOS_BUCKET=
# TOS_PUBLIC_BASE_URL=
```

### 3. 启动数据库

```bash
docker compose up -d
```

该命令启动 PostgreSQL、Redis、API 和 ARQ 后台任务 worker。代码沙箱使用远程 Judge0，
通过 `.env` 配置 `JUDGE0_URL` 及标准 Token；RapidAPI 可改填
`JUDGE0_RAPIDAPI_HOST` 和 `JUDGE0_RAPIDAPI_KEY`。

远程沙箱不可用时，普通运行和学员提交会显示带“非可信”标记的 LLM 临时评估；
临时结果不计为正式通过，也不能用于管理员验证或解锁练习发布。

### 4. 启动后端

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

- API 文档：http://localhost:8000/docs

### 5. 启动前端

```bash
cd frontend
npm install
npm run dev
```

访问：http://localhost:3000

用 `ADMIN_EMAILS` 中的邮箱注册/登录后，顶栏会出现「知识库」「练习管理」；头像菜单可进「个人中心」（账号 / 模型 / 用量分栏）。

## 📚 核心流程

### 知识库与课程

1. **管理员**在「知识库」上传 Markdown 等资料 → 切分入库向量。
2. 首页生成路线时：有匹配就绪库 → **知识库课程**；否则 → **AI 课程**（不会误绑无关库）。
3. 路线可绑定/重建知识库，可删除整条路线。

### 章节学习（双模式）

| 模式 | 说明 |
|------|------|
| **AI 教学** | WebSocket 流式导师对话；默认可视最近约 12 轮，可「加载更早」与「大纲」跳转；可 **+ 上传 / 粘贴截图**（最多 4 张）；课文代码需点「同步至沙箱」才进右侧编辑器（可关闭、同内容去重） / 动画讲解 |
| **文档学习** | 课程讲义（摘要）或知识库原文；按大标题分阶段解锁；提问同样可带截图与当前阶段上下文 |

左右分栏可拖拽调宽。

**截图对话**

1. 输入框旁点 **+** 选图，或直接 **Ctrl/Cmd+V** 粘贴剪贴板截图。
2. 可只发图，也可图文一起发；气泡内显示缩略图，点击可放大。
3. 本轮以多模态发给模型；配置火山 **TOS**（见 `.env.example`）后图片会持久化，刷新/重进章节可在历史消息中回放。
4. 未配置 TOS 时仅当前轮有效，历史消息只保留文字 + `[已附 N 张图片]` 占位。
5. 平台默认模型为 `deepseek-flash`；若改用无视觉能力的模型，识图会失败或被忽略。

### 练习演练场

1. **管理员** →「练习管理」：选知识库 + 主题 → RAG 出题（默认草稿）。
2. 参考答案经 Judge0 **验证通过**后才可 **发布**；可撤回草稿 / 下架 / 删除。
3. **学员** →「练习」：只看到已验证并发布的题目；Monaco 编辑 + Judge0 真实判题。
4. 无匹配知识库内容时 **拒绝出题**，不会生成无关通用题。

### 个人中心（分板块）

头像菜单进入 `/settings`（默认跳到账号页）。桌面左侧导航、手机下拉切换：

| 板块 | 路由 | 说明 |
|------|------|------|
| **账号与安全** | `/settings/account` | 昵称 / 邮箱；邮箱账号可修改密码 |
| **模型配置** | `/settings/llm` | 多条 LLM Profile、启用切换、连通测试；不选则用平台默认 |
| **用量统计** | `/settings/usage` | 本月调用次数、Token、平台配额与 BYOK 统计 |

后续能力（通知、偏好等）只增侧栏项与子路由，不再堆在单页。

## 📁 项目结构

```
CodePilot/
├── frontend/
│   ├── src/app/
│   │   ├── auth/                 # 登录 / 注册
│   │   ├── dashboard/            # 学习仪表盘
│   │   ├── exercises/            # 学员演练场（仅已发布）
│   │   ├── exercise/[id]/        # 练习详情（Markdown 题面 + Monaco）
│   │   ├── admin/exercises/      # 练习管理（管理员出题 / 发布）
│   │   ├── knowledge/            # 知识库管理（管理员）
│   │   ├── learn/                # 学习路径 / 章节（AI + 文档模式）
│   │   ├── settings/             # 个人中心（account / llm / usage 子路由）
│   │   │   ├── account/
│   │   │   ├── llm/
│   │   │   └── usage/
│   │   ├── history/
│   │   └── …
│   ├── src/lib/chatImages.ts     # 截图压缩 / 校验（最多 4 张）
│   ├── src/components/
│   │   ├── settings/SettingsNav.tsx  # 个人中心侧栏 / 移动端切换
│   │   ├── DocumentLearningPanel.tsx
│   │   ├── MarkdownRenderer.tsx
│   │   ├── DialogProvider.tsx
│   │   ├── AdminGuard.tsx / AuthGuard.tsx
│   │   └── layout/               # Header / Sidebar / CommandMenu
│   └── …
├── backend/
│   ├── app/api/v1/
│   │   ├── paths.py / chapters.py / knowledge.py
│   │   ├── exercises.py          # 学员列表 + 管理员出题/状态
│   │   ├── settings.py           # 用户 LLM 偏好
│   │   └── …
│   ├── app/api/ws/chat.py        # 流式对话（RAG + doc_context + images）
│   ├── app/services/
│   │   ├── chat_images.py        # 对话附图校验与多模态组装
│   │   ├── learning_docs.py      # 文档分阶段（忽略代码块内 # 注释）
│   │   ├── kb_retrieve.py / kb_ingest.py
│   │   ├── exercise.py / llm.py / embeddings.py
│   │   └── …
│   ├── uploads/kb/
│   └── requirements.txt
├── design/                       # UI 设计稿
├── docs/
├── docker-compose.yml
└── .env.example
```

## 🔌 API 接口（摘要）

### 认证 / 设置

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/auth/register` · `/login` | 注册 / 登录 |
| `GET` | `/api/v1/auth/me` | 当前用户（含 `role`） |
| `GET/PUT` | `/api/v1/settings/llm` | LLM Profiles 与当前激活配置 |
| `GET` | `/api/v1/usage/me` | 当前用户本月 LLM 用量与配额 |

### 学习路径 / 章节

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/paths/generate` | AI / RAG 生成路线 |
| `DELETE` | `/api/v1/paths/{id}` | 删除路线 |
| `GET` | `/api/v1/chapters/{id}/learning-docs` | 文档学习：讲义阶段 + KB 文档列表 |
| `GET` | `/api/v1/chapters/{id}/learning-docs/kb/{doc_id}` | 知识库原文分阶段 |
| `WebSocket` | `/ws/chat/{conv_id}` | 流式对话；可带 `doc_context`、`images`（data URL，最多 4 张） |

### 知识库（管理员）

| 方法 | 路径 | 说明 |
|------|------|------|
| `CRUD` | `/api/v1/knowledge-bases/…` | 库与文档上传 / 向量入库 |

### 练习

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/exercises` | **仅 published** 列表（学员） |
| `GET` | `/api/v1/exercises/admin` | 全部状态（管理员） |
| `GET` | `/api/v1/exercises/ready-knowledge-bases` | 出题可选就绪库（管理员） |
| `POST` | `/api/v1/exercises/generate` | 基于 KB RAG 异步出题（返回后台任务） |
| `PUT/POST` | `/api/v1/exercises/admin/{id}` · `/validate` | 编辑题目并用参考答案验证 |
| `PATCH` | `/api/v1/exercises/{id}/status` | `draft` / `published` / `archived` |
| `DELETE` | `/api/v1/exercises/{id}` | 删除（管理员） |
| `GET` | `/api/v1/exercises/{id}` | 详情（未发布仅管理员） |
| `POST` | `/api/v1/exercises/{id}/submit` | 提交判题（仅已发布） |

### 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/progress/…` | 统计 / 活跃度 / 技能分布 |
| `POST` | `/api/v1/code/run` | Judge0 隔离沙箱真实运行代码 |
| `POST` | `/api/v1/code/run-modal` | Modal 云端运行 Python（需 `path_id` + `chapter_id`；按课程已批准依赖安装） |
| `GET/POST` | `/api/v1/jobs/…` | 后台任务状态与失败重试 |
| `POST` | `/api/v1/animation/generate-snippet` | 单段代码讲解动画 |
| `GET` | `/health` | 健康检查 |

完整交互式文档见运行中的 `/docs`。

**Modal 云端运行：** 学习页「云端运行」会随请求提交当前路线与章节 ID，服务端只安装该课程 **管理员已批准** 的 pip 包（生成时写入 `package_candidates`，待审包不会装上 Modal）。管理员审阅：`GET/PATCH /api/v1/admin/paths/{path_id}/packages`。存量路线迁移后可在 backend 目录执行 `python -m app.services.backfill_package_candidates`（加 `--dry-run` 仅预览）；`MODAL_*` 见 `.env.example`。

## 📸 页面预览

<div align="center">
  <h3>✨ 首页 · AI 问答导学与路线定制</h3>
  <p>输入任意编程方向或技术栈，AI 实时生成体系化、进阶式的专属学习路径</p>
  <img src="docs/screenshots/home.png" alt="CodePilot 首页" width="850" />
</div>

<br />

<table>
  <tr>
    <td width="50%" align="center"><strong>🗺️ 学习路径 · 知识图谱与 RAG 溯源</strong></td>
    <td width="50%" align="center"><strong>💬 章节详情 · AI / 文档双模式</strong></td>
  </tr>
  <tr>
    <td align="center" valign="top">
      <img src="docs/screenshots/learning_path.png" alt="学习路径" width="100%" />
      <br />
      <sub>结构化大纲 · 进度追踪 · 知识库关联与重建 · 路线删除</sub>
    </td>
    <td align="center" valign="top">
      <img src="docs/screenshots/learning_detail.png" alt="章节详情" width="100%" />
      <br />
      <sub>流式讲解 · 截图识图 · 文档分阶段阅读 · 代码同步沙箱 · 可调左右分栏</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>🏆 编程演练场 · 已发布挑战</strong></td>
    <td width="50%" align="center"><strong>💻 练习详情 · Monaco + AI 判题</strong></td>
  </tr>
  <tr>
    <td align="center" valign="top">
      <img src="docs/screenshots/exercises_hub.png" alt="练习中心" width="100%" />
      <br />
      <sub>语言 / 难度筛选 · 展示知识库溯源标签 · 题目由管理员发布</sub>
    </td>
    <td align="center" valign="top">
      <img src="docs/screenshots/exercise.png" alt="练习详情" width="100%" />
      <br />
      <sub>Markdown 题面 · Monaco 语法高亮 · 提交与 AI 判题</sub>
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center"><strong>📚 平台知识库 · RAG 文档管理（管理员）</strong></td>
  </tr>
  <tr>
    <td colspan="2" align="center" valign="top">
      <img src="docs/screenshots/knowledge.png" alt="知识库管理" width="850" />
      <br />
      <sub>文档上传与向量入库 · 课程生成与练习出题共用检索</sub>
    </td>
  </tr>
</table>

## 📝 开发路线

- [x] **MVP** — 核心对话 + 学习路线 + 代码沙箱 + AI 判题
- [x] **V1.1** — 邮箱注册/登录 + JWT + AuthGuard
- [x] **V1.2** — 练习中心 + 仪表盘 + 进度 + 历史
- [x] **V1.3** — 知识库 RAG + 管理员角色 + 主题相关检索 + 路线删除 / 溯源
- [x] **V1.4** — 文档学习模式 · 知识点 Remotion 讲解 · 个人 LLM Profiles · 管理员出题发布流
- [x] **V2** — Judge0 真实判题 · 练习编辑器 · ARQ 异步入库/出题
- [x] **V2.1** — 章节对话截图上传 / 粘贴 · deepseek-flash 多模态识图（demo：当前轮 base64）
- [x] **V2.2** — 个人中心分板块（账号 / 模型 / 用量子路由）· 对话窗口化与大纲跳转
- [x] **V2.3** — 学习闭环引导 · AI/文档模式澄清 · 平台答疑页 · 截图火山 TOS 持久化
- [ ] **V3** — 多语言产品化 · 社区 · 成就系统 · Judge0 沙箱可信度（禁静默 LLM fallback）

## 📄 License

MIT
