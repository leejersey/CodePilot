import uuid
from datetime import datetime
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from app.db.types import AsyncpgVector


class Base(DeclarativeBase):
    pass


USER_ROLES = frozenset({"learner", "creator", "admin", "super_admin"})


# 学习路径 ↔ 知识库 多对多
path_knowledge_bases = Table(
    "path_knowledge_bases",
    Base.metadata,
    Column("path_id", UUID(as_uuid=True), ForeignKey("learning_paths.id", ondelete="CASCADE"), primary_key=True),
    Column("kb_id", UUID(as_uuid=True), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), primary_key=True),
)


course_version_knowledge_bases = Table(
    "course_version_knowledge_bases",
    Base.metadata,
    Column(
        "course_version_id",
        UUID(as_uuid=True),
        ForeignKey("course_versions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "kb_id",
        UUID(as_uuid=True),
        ForeignKey("knowledge_bases.id", ondelete="RESTRICT"),
        primary_key=True,
    ),
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    nickname: Mapped[str] = mapped_column(String(100), default="Learner")
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    auth_provider: Mapped[str] = mapped_column(String(20), default="anonymous")
    role: Mapped[str] = mapped_column(String(20), default="learner")  # learner | creator | admin | super_admin
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | disabled
    auth_version: Mapped[int] = mapped_column(Integer, default=1)
    preferences: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    learning_paths = relationship("LearningPath", back_populates="user")
    conversations = relationship("Conversation", back_populates="user")
    submissions = relationship("ExerciseSubmission", back_populates="user")
    knowledge_bases = relationship(
        "KnowledgeBase",
        back_populates="user",
        foreign_keys="KnowledgeBase.user_id",
    )


class BackgroundJob(Base):
    __tablename__ = "background_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    job_type: Mapped[str] = mapped_column(String(40), index=True)
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    result_resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    arq_job_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class LlmUsageEvent(Base):
    __tablename__ = "llm_usage_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    request_type: Mapped[str] = mapped_column(String(40), default="general", index=True)
    provider: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(120), index=True)
    source: Mapped[str] = mapped_column(String(20), index=True)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_usd = mapped_column(Numeric(12, 6), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="success", index=True)
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class ErrorEvent(Base):
    __tablename__ = "error_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    error_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    service: Mapped[str] = mapped_column(String(40), index=True)
    level: Mapped[str] = mapped_column(String(20), default="error", index=True)
    message: Mapped[str] = mapped_column(Text)
    exception_type: Mapped[str | None] = mapped_column(String(200), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    path: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    method: Mapped[str | None] = mapped_column(String(10), nullable=True)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (
        ForeignKeyConstraint(
            ["id", "current_version_id"],
            ["course_versions.course_id", "course_versions.id"],
            name="fk_courses_current_version_same_course",
            use_alter=True,
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint(
            "status IN ('draft', 'pending_review', 'rejected', 'published', 'archived')",
            name="ck_courses_status",
        ),
        CheckConstraint(
            "visibility IN ('private', 'published')",
            name="ck_courses_visibility",
        ),
        CheckConstraint(
            "(status = 'published') = (visibility = 'published')",
            name="ck_courses_status_visibility",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    topic: Mapped[str] = mapped_column(String(255))
    difficulty: Mapped[str] = mapped_column(String(20), default="intermediate")
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    visibility: Mapped[str] = mapped_column(String(20), default="private", index=True)
    current_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    legacy_path_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("learning_paths.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
    )
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    submitted_for_review_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    author = relationship("User", foreign_keys=[author_id])
    reviewer = relationship("User", foreign_keys=[reviewer_id])
    current_version = relationship("CourseVersion", foreign_keys=[current_version_id], post_update=True)
    versions = relationship(
        "CourseVersion",
        back_populates="course",
        cascade="all, delete-orphan",
        foreign_keys="CourseVersion.course_id",
    )
    enrollments = relationship("Enrollment", back_populates="course", cascade="all, delete-orphan")

    @property
    def learning_path_id(self) -> uuid.UUID | None:
        """Compatible target for the legacy /learn workspace."""
        return self.legacy_path_id

    @property
    def current_version_number(self) -> int | None:
        return self.current_version.version_number if self.current_version else None

    @property
    def source_type(self) -> str | None:
        return self.current_version.source_type if self.current_version else None

    @property
    def knowledge_base_ids(self) -> list[uuid.UUID]:
        if not self.current_version:
            return []
        return [kb.id for kb in self.current_version.knowledge_bases]

    @property
    def knowledge_base_names(self) -> list[str]:
        if not self.current_version:
            return []
        return [kb.name for kb in self.current_version.knowledge_bases]


class CourseVersion(Base):
    __tablename__ = "course_versions"
    __table_args__ = (
        UniqueConstraint("course_id", "id", name="uq_course_versions_course_id_id"),
        UniqueConstraint("course_id", "version_number", name="uq_course_versions_course_number"),
        CheckConstraint(
            "source_type IN ('ai_generated', 'knowledge_base')",
            name="ck_course_versions_source_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE")
    )
    version_number: Mapped[int] = mapped_column(Integer)
    outline: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    source_type: Mapped[str] = mapped_column(String(20), default="ai_generated")
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    course = relationship("Course", back_populates="versions", foreign_keys=[course_id])
    creator = relationship("User", foreign_keys=[created_by])
    chapters = relationship(
        "CourseChapter",
        back_populates="version",
        cascade="all, delete-orphan",
        order_by="CourseChapter.sort_order",
    )
    knowledge_bases = relationship(
        "KnowledgeBase",
        secondary=course_version_knowledge_bases,
        back_populates="course_versions",
    )


class CourseChapter(Base):
    __tablename__ = "course_chapters"
    __table_args__ = (
        UniqueConstraint("version_id", "id", name="uq_course_chapters_version_id_id"),
        UniqueConstraint("version_id", "sort_order", name="uq_course_chapters_version_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("course_versions.id", ondelete="CASCADE")
    )
    sort_order: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    legacy_chapter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chapters.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    version = relationship("CourseVersion", back_populates="chapters")
    progress = relationship(
        "ChapterProgress",
        primaryjoin="CourseChapter.id == ChapterProgress.chapter_id",
        foreign_keys="ChapterProgress.chapter_id",
        viewonly=True,
    )


class CourseVersionEvent(Base):
    __tablename__ = "course_version_events"
    __table_args__ = (
        ForeignKeyConstraint(
            ["course_id", "from_version_id"],
            ["course_versions.course_id", "course_versions.id"],
            name="fk_course_version_events_from_same_course",
            deferrable=True,
            initially="DEFERRED",
        ),
        ForeignKeyConstraint(
            ["course_id", "to_version_id"],
            ["course_versions.course_id", "course_versions.id"],
            name="fk_course_version_events_to_same_course",
            deferrable=True,
            initially="DEFERRED",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    from_version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    to_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    actor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    event_type: Mapped[str] = mapped_column(String(30))
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (
        ForeignKeyConstraint(
            ["course_id", "active_version_id"],
            ["course_versions.course_id", "course_versions.id"],
            name="fk_enrollments_active_version_same_course",
            deferrable=True,
            initially="DEFERRED",
        ),
        UniqueConstraint(
            "id",
            "active_version_id",
            name="uq_enrollments_id_active_version_id",
        ),
        UniqueConstraint("user_id", "course_id", name="uq_enrollments_user_course"),
        CheckConstraint(
            "status IN ('active', 'completed', 'withdrawn')",
            name="ck_enrollments_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    active_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), index=True
    )
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    enrolled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user = relationship("User", foreign_keys=[user_id])
    course = relationship("Course", back_populates="enrollments")
    active_version = relationship("CourseVersion", foreign_keys=[active_version_id])
    chapter_progress = relationship(
        "ChapterProgress",
        primaryjoin="Enrollment.id == ChapterProgress.enrollment_id",
        foreign_keys="ChapterProgress.enrollment_id",
        viewonly=True,
    )


class ChapterProgress(Base):
    __tablename__ = "chapter_progress"
    __table_args__ = (
        ForeignKeyConstraint(
            ["enrollment_id", "version_id"],
            ["enrollments.id", "enrollments.active_version_id"],
            name="fk_chapter_progress_enrollment_active_version",
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        ),
        ForeignKeyConstraint(
            ["version_id", "chapter_id"],
            ["course_chapters.version_id", "course_chapters.id"],
            name="fk_chapter_progress_chapter_version",
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        ),
        UniqueConstraint(
            "enrollment_id",
            "chapter_id",
            name="uq_chapter_progress_enrollment_chapter",
        ),
        CheckConstraint(
            "status IN ('locked', 'unlocked', 'available', 'in_progress', 'completed')",
            name="ck_chapter_progress_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    enrollment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    chapter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    status: Mapped[str] = mapped_column(String(20), default="locked", index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    enrollment = relationship(
        "Enrollment",
        primaryjoin="ChapterProgress.enrollment_id == Enrollment.id",
        foreign_keys=[enrollment_id],
    )
    chapter = relationship(
        "CourseChapter",
        primaryjoin="ChapterProgress.chapter_id == CourseChapter.id",
        foreign_keys=[chapter_id],
    )

    @classmethod
    def for_enrollment(
        cls,
        *,
        enrollment: Enrollment,
        chapter: CourseChapter,
        status: str = "locked",
    ) -> "ChapterProgress":
        shared_version = enrollment.active_version
        if shared_version is not None and shared_version is chapter.version:
            if shared_version.id is None:
                shared_version.id = uuid.uuid4()
            enrollment.active_version_id = shared_version.id
            chapter.version_id = shared_version.id

        enrollment_version_id = enrollment.active_version_id
        if enrollment_version_id is None and enrollment.active_version is not None:
            enrollment_version_id = enrollment.active_version.id

        chapter_version_id = chapter.version_id
        if chapter_version_id is None and chapter.version is not None:
            chapter_version_id = chapter.version.id

        if enrollment_version_id is None or chapter_version_id is None:
            raise ValueError("Enrollment and chapter must reference persisted course versions")
        if enrollment_version_id != chapter_version_id:
            raise ValueError("Chapter must belong to the enrollment's active course version")

        progress = cls(version_id=enrollment_version_id, status=status)
        progress.enrollment = enrollment
        progress.chapter = chapter
        return progress


class LearningPath(Base):
    __tablename__ = "learning_paths"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    topic: Mapped[str] = mapped_column(String(255))
    difficulty: Mapped[str] = mapped_column(String(20), default="intermediate")
    outline: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="learning_paths")
    chapters = relationship("Chapter", back_populates="path", order_by="Chapter.sort_order")
    knowledge_bases = relationship(
        "KnowledgeBase",
        secondary=path_knowledge_bases,
        back_populates="paths",
    )


class Chapter(Base):
    __tablename__ = "chapters"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    path_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("learning_paths.id"))
    sort_order: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="locked")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    path = relationship("LearningPath", back_populates="chapters")
    conversations = relationship("Conversation", back_populates="chapter")
    exercises = relationship("Exercise", back_populates="chapter")


class LearningSession(Base):
    __tablename__ = "learning_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    chapter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chapters.id", ondelete="CASCADE"), index=True
    )
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    last_heartbeat_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    chapter_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("chapters.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(255), default="新建对话")
    context_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="conversations")
    chapter = relationship("Chapter", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", order_by="Message.created_at")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversations.id"))
    role: Mapped[str] = mapped_column(String(20))  # user / assistant / system
    content: Mapped[str] = mapped_column(Text)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship("Conversation", back_populates="messages")


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chapter_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("chapters.id"), nullable=True)
    language: Mapped[str] = mapped_column(String(50), default="python", index=True)
    tags: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # e.g. ["async", "networking"]
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    starter_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    test_cases: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    difficulty: Mapped[str] = mapped_column(String(20), default="medium")
    # 出题所依据的知识库溯源 [{"id": "...", "name": "..."}]
    source_kbs: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # draft | published | archived — 学员端仅展示 published
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    reference_solution: Mapped[str | None] = mapped_column(Text, nullable=True)
    judge_mode: Mapped[str] = mapped_column(String(20), default="judge0")
    validation_status: Mapped[str] = mapped_column(String(20), default="unverified", index=True)
    validation_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    chapter = relationship("Chapter", back_populates="exercises")
    submissions = relationship("ExerciseSubmission", back_populates="exercise")


class ExerciseSubmission(Base):
    __tablename__ = "exercise_submissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exercise_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("exercises.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    submitted_code: Mapped[str] = mapped_column(Text)
    result: Mapped[str] = mapped_column(String(20))  # pass / fail / error
    ai_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    test_results: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    execution_time: Mapped[str | None] = mapped_column(String(32), nullable=True)
    memory: Mapped[int | None] = mapped_column(Integer, nullable=True)
    judge_source: Mapped[str] = mapped_column(String(20), default="judge0")
    trusted: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    exercise = relationship("Exercise", back_populates="submissions")
    user = relationship("User", back_populates="submissions")


class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"
    __table_args__ = (
        CheckConstraint(
            "visibility IN ('platform_public', 'private')",
            name="ck_knowledge_bases_visibility",
        ),
        CheckConstraint(
            "approval_status IN ('pending', 'approved', 'rejected')",
            name="ck_knowledge_bases_approval_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
    visibility: Mapped[str] = mapped_column(String(20), default="platform_public", index=True)
    approval_status: Mapped[str] = mapped_column(String(20), default="approved", index=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="knowledge_bases", foreign_keys=[user_id])
    documents = relationship("KnowledgeDocument", back_populates="knowledge_base", cascade="all, delete-orphan")
    chunks = relationship("KnowledgeChunk", back_populates="knowledge_base", cascade="all, delete-orphan")
    paths = relationship(
        "LearningPath",
        secondary=path_knowledge_bases,
        back_populates="knowledge_bases",
    )
    course_versions = relationship(
        "CourseVersion",
        secondary=course_version_knowledge_bases,
        back_populates="knowledge_bases",
    )
    reviewer = relationship("User", foreign_keys=[reviewed_by])


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kb_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(512))
    mime_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    byte_size: Mapped[int] = mapped_column(Integer, default=0)
    storage_path: Mapped[str] = mapped_column(String(1024))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/processing/ready/failed
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    knowledge_base = relationship("KnowledgeBase", back_populates="documents")
    chunks = relationship("KnowledgeChunk", back_populates="document", cascade="all, delete-orphan")


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("knowledge_documents.id", ondelete="CASCADE"), index=True
    )
    kb_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    embedding = mapped_column(AsyncpgVector(1024), nullable=True)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document = relationship("KnowledgeDocument", back_populates="chunks")
    knowledge_base = relationship("KnowledgeBase", back_populates="chunks")
