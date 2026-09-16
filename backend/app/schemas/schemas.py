import uuid
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


# ── Learning Path ──

class PathGenerateRequest(BaseModel):
    topic: str = Field(..., min_length=2, max_length=200, examples=["Python 异步编程"])
    difficulty: str = Field("intermediate", pattern="^(beginner|intermediate|advanced)$")
    user_background: str = Field("", max_length=500)
    knowledge_base_ids: list[uuid.UUID] = Field(default_factory=list)


class ChapterOutline(BaseModel):
    order: int
    title: str
    summary: str
    covers: list[str] = []


class RagProvenance(BaseModel):
    """课程生成溯源：区分知识库 RAG 课 vs 纯 AI 课"""
    used: bool = False
    source_type: str = "ai_generated"  # knowledge_base | ai_generated
    kb_ids: list[str] = []
    kb_names: list[str] = []
    doc_count: int = 0
    doc_filenames: list[str] = []
    uncovered_docs: list[str] = []
    generated_at: str | None = None


class PathOutline(BaseModel):
    total_chapters: int
    estimated_hours: float
    prerequisites: list[str] = []
    chapters: list[ChapterOutline]
    rag: RagProvenance | None = None


class PathResponse(BaseModel):
    id: uuid.UUID
    topic: str
    difficulty: str
    outline: PathOutline | None = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChapterResponse(BaseModel):
    id: uuid.UUID
    path_id: uuid.UUID
    sort_order: int
    title: str
    summary: str | None
    status: str
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChapterStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(locked|unlocked|in_progress|completed)$")


# ── Conversation ──

class ConversationCreate(BaseModel):
    chapter_id: uuid.UUID | None = None
    title: str = "新建对话"


class ConversationResponse(BaseModel):
    id: uuid.UUID
    chapter_id: uuid.UUID | None
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    token_count: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Exercise ──

class ExerciseGenerateRequest(BaseModel):
    chapter_id: uuid.UUID | None = None
    language: str = Field("python", max_length=50, examples=["python", "javascript", "go"])
    topic: str = Field(..., min_length=2, max_length=200, examples=["并发编程", "数据结构"])
    difficulty: str = Field("medium", pattern="^(easy|medium|hard)$")
    # 必选：至少绑定一个就绪知识库，出题必须基于 RAG
    knowledge_base_ids: list[uuid.UUID] = Field(..., min_length=1)
    # 生成后是否直接发布（默认草稿，需管理员审核发布）
    publish: bool = False


class TestCase(BaseModel):
    input: str
    expected: str
    hidden: bool = False


class ExerciseSourceKb(BaseModel):
    id: str
    name: str


class ExerciseStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(draft|published|archived)$")


class ExerciseResponse(BaseModel):
    id: uuid.UUID
    chapter_id: uuid.UUID | None = None
    language: str = "python"
    tags: list[str] | None = None
    title: str
    description: str
    starter_code: str | None
    test_cases: list[TestCase] | None
    difficulty: str
    source_kbs: list[ExerciseSourceKb] | None = None
    status: str = "draft"
    created_at: datetime

    model_config = {"from_attributes": True}


class ExerciseSubmitRequest(BaseModel):
    code: str = Field(..., min_length=1)


class SubmissionResponse(BaseModel):
    submission_id: uuid.UUID
    result: str
    score: int | None
    ai_feedback: str | None
    test_results: list[dict] | None = None


# ── Error ──

class ErrorDetail(BaseModel):
    field: str | None = None
    issue: str


class ErrorResponse(BaseModel):
    error: dict = Field(default_factory=lambda: {"code": "UNKNOWN", "message": "未知错误"})


# ── Auth ──

class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255, examples=["user@example.com"])
    password: str = Field(..., min_length=6, max_length=100)
    nickname: str = Field("Learner", max_length=100)


class LoginRequest(BaseModel):
    email: str = Field(..., examples=["user@example.com"])
    password: str = Field(...)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str | None
    nickname: str
    avatar_url: str | None
    auth_provider: str
    role: str = "learner"
    status: str = "active"
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminUserResponse(BaseModel):
    id: uuid.UUID
    email: str | None
    nickname: str
    avatar_url: str | None
    auth_provider: str
    role: Literal["learner", "admin", "super_admin"]
    status: Literal["active", "disabled"]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AdminUserListResponse(BaseModel):
    items: list[AdminUserResponse]
    total: int
    page: int
    page_size: int
    stats: dict[str, int]


class UserRoleUpdate(BaseModel):
    role: Literal["learner", "admin", "super_admin"]


class UserAccountStatusUpdate(BaseModel):
    status: Literal["active", "disabled"]


class UserPasswordReset(BaseModel):
    temporary_password: str = Field(..., min_length=8, max_length=100)


# ── Knowledge Base ──

class KnowledgeBaseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field("", max_length=2000)


class KnowledgeBaseUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)


class KnowledgeDocumentResponse(BaseModel):
    id: uuid.UUID
    kb_id: uuid.UUID
    filename: str
    mime_type: str | None
    byte_size: int
    status: str
    error_message: str | None
    chunk_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class KnowledgeBaseResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    status: str
    created_at: datetime
    updated_at: datetime
    document_count: int = 0

    model_config = {"from_attributes": True}


class KnowledgeBaseDetailResponse(KnowledgeBaseResponse):
    documents: list[KnowledgeDocumentResponse] = []


class PathKnowledgeBindRequest(BaseModel):
    knowledge_base_ids: list[uuid.UUID] = Field(default_factory=list)

