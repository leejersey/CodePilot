import uuid
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, model_validator


# ── Learning Path ──

class PathGenerateRequest(BaseModel):
    topic: str = Field(..., min_length=2, max_length=200, examples=["Python 异步编程"])
    difficulty: str = Field("intermediate", pattern="^(beginner|intermediate|advanced)$")
    user_background: str = Field("", max_length=500)
    knowledge_base_ids: list[uuid.UUID] = Field(default_factory=list)


class SkillOutline(BaseModel):
    title: str
    goal: str | None = None
    objectives: list[str] = []
    teach_prompt: str | None = None
    estimated_minutes: int | None = None


class ChapterOutline(BaseModel):
    order: int
    title: str
    summary: str
    covers: list[str] = []
    skills: list[SkillOutline] = []


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


class ChapterStatusResponse(ChapterResponse):
    """preview=True 表示作者/管理员在未报名的情况下预览，进度未被记录。"""

    preview: bool = False


class LearningHeartbeatRequest(BaseModel):
    session_id: uuid.UUID | None = None
    active: bool = True


class LearningHeartbeatResponse(BaseModel):
    session_id: uuid.UUID
    counted_seconds: int
    session_seconds: int


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
    metadata: dict | None = None

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
    input: str = Field("", max_length=100_000)
    expected: str = Field("", max_length=100_000)
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
    judge_mode: str = "judge0"
    validation_status: str = "unverified"
    validated_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChapterExerciseRecommendation(ExerciseResponse):
    attempted: bool = False
    passed: bool = False
    best_score: int | None = None


class ChapterPracticeResponse(BaseModel):
    exercises: list[ChapterExerciseRecommendation]
    next_chapter: ChapterResponse | None = None


class ExerciseSubmitRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=100_000)


class AdminExerciseResponse(ExerciseResponse):
    reference_solution: str | None = None


class ExerciseUpdateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1)
    language: str = Field(..., min_length=1, max_length=50)
    difficulty: str = Field(..., pattern="^(easy|medium|hard)$")
    tags: list[str] = Field(default_factory=list, max_length=20)
    starter_code: str = ""
    reference_solution: str = Field(..., min_length=1)
    test_cases: list[TestCase] = Field(..., min_length=1, max_length=20)


class GeneratedExerciseData(ExerciseUpdateRequest):
    @model_validator(mode="after")
    def require_public_and_hidden_cases(self):
        public_count = sum(not case.hidden for case in self.test_cases)
        hidden_count = sum(case.hidden for case in self.test_cases)
        if public_count < 2 or hidden_count < 1:
            raise ValueError("生成题目必须包含至少 2 个公开用例和 1 个隐藏用例")
        return self


class ExerciseValidationResponse(BaseModel):
    valid: bool
    result: str
    score: int
    test_results: list[dict]


class SubmissionResponse(BaseModel):
    submission_id: uuid.UUID
    submitted_code: str | None = None
    result: str
    score: int | None
    ai_feedback: str | None
    test_results: list[dict] | None = None
    execution_time: str | None = None
    memory: int | None = None
    trusted: bool = True
    judge_source: str = "judge0"
    created_at: datetime | None = None


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


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=100)
    new_password: str = Field(..., min_length=8, max_length=100)


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
    role: Literal["learner", "creator", "admin", "super_admin"]
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
    role: Literal["learner", "creator", "admin", "super_admin"]


class UserAccountStatusUpdate(BaseModel):
    status: Literal["active", "disabled"]


class UserPasswordReset(BaseModel):
    temporary_password: str = Field(..., min_length=8, max_length=100)


class BackgroundJobResponse(BaseModel):
    id: uuid.UUID
    job_type: str
    status: str
    progress: int
    result_resource_id: uuid.UUID | None
    error_message: str | None
    attempts: int
    payload: dict | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Knowledge Base ──

class KnowledgeBaseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field("", max_length=2000)


class KnowledgeBaseUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)


class KnowledgeBaseReviewUpdate(BaseModel):
    decision: Literal["approve", "reject"]
    platform_public: bool = False
    note: str | None = Field(None, max_length=2000)

    @model_validator(mode="after")
    def require_rejection_note(self):
        if self.decision == "reject" and not (self.note or "").strip():
            raise ValueError("拒绝知识库时必须填写审核意见")
        return self


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
    ready_document_count: int = 0
    visibility: str = "private"
    approval_status: str = "pending"
    review_note: str | None = None

    model_config = {"from_attributes": True}


class KnowledgeBaseDetailResponse(KnowledgeBaseResponse):
    documents: list[KnowledgeDocumentResponse] = []


class PathKnowledgeBindRequest(BaseModel):
    knowledge_base_ids: list[uuid.UUID] = Field(default_factory=list)


# ── Courses ──

class CourseGenerateRequest(BaseModel):
    topic: str = Field(..., min_length=2, max_length=200)
    difficulty: str = Field("intermediate", pattern="^(beginner|intermediate|advanced)$")
    user_background: str = Field("", max_length=500)
    pure_ai: bool
    knowledge_base_ids: list[uuid.UUID] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_explicit_source(self):
        if self.pure_ai and self.knowledge_base_ids:
            raise ValueError("纯 AI 生成不能选择知识库")
        if not self.pure_ai and not self.knowledge_base_ids:
            raise ValueError("知识库生成至少选择一个知识库")
        self.knowledge_base_ids = list(dict.fromkeys(self.knowledge_base_ids))
        return self


class CourseRebuildRequest(CourseGenerateRequest):
    topic: str | None = Field(None, min_length=2, max_length=200)

class CourseCatalogItem(BaseModel):
    """公开目录条目：匿名访客也能读到，因此不含任何内部主体 ID。"""

    id: uuid.UUID
    topic: str
    difficulty: str
    status: str
    visibility: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AuthoredCourseItem(CourseCatalogItem):
    """需要分辨「自己的课程」与「平台课程」的已登录视图才附带作者身份。"""

    author_id: uuid.UUID


class CourseDetailResponse(CourseCatalogItem):
    current_version_id: uuid.UUID | None
    learning_path_id: uuid.UUID | None = None


class CourseCatalogResponse(BaseModel):
    items: list[CourseCatalogItem]
    total: int
    page: int
    page_size: int


class CourseChapterResponse(BaseModel):
    id: uuid.UUID
    version_id: uuid.UUID
    sort_order: int
    title: str
    summary: str | None
    content: dict | None
    status: str | None = None
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class EnrollmentResponse(BaseModel):
    id: uuid.UUID
    course_id: uuid.UUID
    active_version_id: uuid.UUID
    status: str
    enrolled_at: datetime

    model_config = {"from_attributes": True}


class EnrollmentCourseResponse(EnrollmentResponse):
    course: AuthoredCourseItem
    learning_path_id: uuid.UUID | None = None
    completed_chapters: int
    total_chapters: int
    progress: int


class CourseReviewUpdate(BaseModel):
    decision: Literal["approve", "reject"]
    note: str | None = Field(None, max_length=2000)

    @model_validator(mode="after")
    def require_rejection_note(self):
        if self.decision == "reject" and not (self.note or "").strip():
            raise ValueError("拒绝课程时必须填写审核意见")
        return self


class CourseStatusUpdate(BaseModel):
    status: Literal["published", "archived"]


class CourseSubmitReviewResponse(CourseDetailResponse):
    review_note: str | None = None
    submitted_for_review_at: datetime | None = None


class AdminCourseResponse(CourseDetailResponse):
    author_id: uuid.UUID
    current_version_number: int | None = None
    source_type: Literal["ai_generated", "knowledge_base"] | None = None
    knowledge_base_ids: list[uuid.UUID] = Field(default_factory=list)
    knowledge_base_names: list[str] = Field(default_factory=list)
    review_note: str | None = None
    reviewer_id: uuid.UUID | None = None
    submitted_for_review_at: datetime | None = None
    reviewed_at: datetime | None = None
    published_at: datetime | None = None


class AdminCourseListResponse(BaseModel):
    items: list[AdminCourseResponse]
    total: int
    page: int
    page_size: int


class SkillResponse(BaseModel):
    id: uuid.UUID
    chapter_id: uuid.UUID
    sort_order: int
    title: str
    goal: str | None = None
    objectives: list | None = None
    teach_prompt: str | None = None
    status: str
    estimated_minutes: int | None = None
    progress_status: str
    mastery_score: int = 0
    attempts: int = 0
    passed_at: datetime | None = None


class SkillListResponse(BaseModel):
    chapter_id: uuid.UUID
    skills: list[SkillResponse]

