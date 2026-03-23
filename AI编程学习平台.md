# 💡 AI 编程学习平台

> 一个问答式的 AI 编程学习平台，AI 引导学习路线、讲解知识、生成动画、提供编码实战。

---

## 核心功能

### 1. 问答式导学
- AI 先问用户想学什么（如"Python 异步编程"）
- 根据用户水平和目标，生成**个性化学习路线**
- 用户选择章节开始学习

### 2. 知识点讲解
- AI 流式输出讲解内容（Markdown + 代码高亮）
- 支持追问和上下文对话
- 每个知识点附带"一句话总结"

### 3. AI 生成动画
- **Manim 动画**（推荐）：LLM 生成 Manim 代码 → 后端渲染为 GIF/MP4
- **步骤式动画**：LLM 返回分步数据 → 前端 CSS/JS 逐步展示
- **代码执行可视化**：类似 Python Tutor，逐行展示变量变化

### 4. 编码实战沙箱
- 浏览器内运行代码（Pyodide，零后端负担）
- AI 出题 → 用户写代码 → AI 判题 + 反馈
- 支持 Hint 提示和参考答案

---

## 技术架构

```
前端：Next.js + Monaco Editor + Pyodide
后端：FastAPI + WebSocket（流式对话）
AI：  LLM API（DeepSeek/OpenAI）
动画：Manim（Python 数学动画库）
存储：PostgreSQL（进度）+ Redis（会话）
```

```
交互流程：

用户 → "我想学 Python 异步编程"
  │
  ▼
AI 生成学习路线（JSON 结构化输出）
  → 前端渲染为章节卡片
  │
  ▼
用户点击 "第2章：协程"
  │
  ├── 📖 AI 流式讲解（WebSocket）
  ├── 🎬 AI 生成动画（Manim → GIF）
  └── 💻 编码练习（Pyodide 沙箱 + AI 判题）
```

---

## 分阶段开发

### MVP（1-2 周）
- [ ] 对话式学习界面（Next.js + WebSocket）
- [ ] AI 生成学习路线（LLM 结构化输出）
- [ ] 知识点流式讲解
- [ ] 代码沙箱（Pyodide 浏览器运行）
- [ ] AI 出题 + 判题

### V2（+1 周）
- [ ] 步骤式动画（前端 CSS/Framer Motion）
- [ ] 学习进度追踪（PostgreSQL）
- [ ] 用户登录（Supabase Auth）

### V3（+1-2 周）
- [ ] Manim 动画生成（后端渲染）
- [ ] 代码执行可视化（变量追踪）
- [ ] 学习数据统计面板

---

## 竞品参考

| 产品 | 特点 | 我们的差异化 |
|:---|:---|:---|
| Codecademy | 交互式编程 | 我们有 AI 个性化导学 |
| Brilliant | 动画讲解 | 我们的动画由 AI 实时生成 |
| ChatGPT | AI 对话 | 我们有沙箱实战 + 结构化路线 |
| Scrimba | 视频+代码 | 我们完全 AI 驱动，无需录制 |

---

## 涉及技术栈

和现有知识完美匹配：
- ✅ Python + FastAPI（后端）
- ✅ 异步编程（WebSocket 流式输出）
- ✅ LLM 集成（AI 对话核心）
- ✅ Next.js（前端）
- ✅ PostgreSQL + Redis（数据存储）
- 🆕 Manim（动画生成，需要学习）
- 🆕 Pyodide（浏览器端 Python 运行时）
