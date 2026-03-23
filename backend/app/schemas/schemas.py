import uuid
from datetime import datetime
from pydantic import BaseModel, Field


# ── Learning Path ──

class PathGenerateRequest(BaseModel):
    topic: str = Field(..., min_length=2, max_length=200, examples=["Python 异步编程"])
    difficulty: str = Field("intermediate", pattern="^(beginner|intermediate|advanced)$")
    user_background: str = Field("", max_length=500)


class ChapterOutline(BaseModel):
    order: int
    title: str
    summary: str


class PathOutline(BaseModel):
    total_chapters: int
    estimated_hours: float
    prerequisites: list[str] = []
    chapters: list[ChapterOutline]


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
    topic: str = Field("", max_length=200, examples=["并发编程", "数据结构"])
    difficulty: str = Field("medium", pattern="^(easy|medium|hard)$")


class TestCase(BaseModel):
    input: str
    expected: str
    hidden: bool = False


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
    created_at: datetime

    model_config = {"from_attributes": True}

