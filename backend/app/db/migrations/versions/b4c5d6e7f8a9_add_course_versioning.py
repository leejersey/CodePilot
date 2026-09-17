"""add course versioning, enrollments, progress, and KB permissions

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-09-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, Sequence[str], None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "knowledge_bases",
        sa.Column(
            "visibility",
            sa.String(length=20),
            nullable=False,
            server_default="platform_public",
        ),
    )
    op.add_column(
        "knowledge_bases",
        sa.Column(
            "approval_status",
            sa.String(length=20),
            nullable=False,
            server_default="approved",
        ),
    )
    op.add_column(
        "knowledge_bases",
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("knowledge_bases", sa.Column("review_note", sa.Text(), nullable=True))
    op.add_column(
        "knowledge_bases",
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_knowledge_bases_reviewed_by_users",
        "knowledge_bases",
        "users",
        ["reviewed_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "ck_knowledge_bases_visibility",
        "knowledge_bases",
        "visibility IN ('platform_public', 'private')",
    )
    op.create_check_constraint(
        "ck_knowledge_bases_approval_status",
        "knowledge_bases",
        "approval_status IN ('pending', 'approved', 'rejected')",
    )
    op.create_index(
        "ix_knowledge_bases_visibility",
        "knowledge_bases",
        ["visibility"],
    )
    op.create_index(
        "ix_knowledge_bases_approval_status",
        "knowledge_bases",
        ["approval_status"],
    )

    op.create_table(
        "courses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("topic", sa.String(length=255), nullable=False),
        sa.Column(
            "difficulty",
            sa.String(length=20),
            nullable=False,
            server_default="intermediate",
        ),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column(
            "visibility",
            sa.String(length=20),
            nullable=False,
            server_default="private",
        ),
        sa.Column("current_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("legacy_path_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "submitted_for_review_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'pending_review', 'rejected', 'published', 'archived')",
            name="ck_courses_status",
        ),
        sa.CheckConstraint(
            "visibility IN ('private', 'published')",
            name="ck_courses_visibility",
        ),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["legacy_path_id"],
            ["learning_paths.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(["reviewer_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("legacy_path_id", name="uq_courses_legacy_path_id"),
    )
    op.create_index("ix_courses_author_id", "courses", ["author_id"])
    op.create_index("ix_courses_status", "courses", ["status"])
    op.create_index("ix_courses_visibility", "courses", ["visibility"])

    op.create_table(
        "course_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column(
            "outline",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "source_type",
            sa.String(length=20),
            nullable=False,
            server_default="ai_generated",
        ),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "source_type IN ('ai_generated', 'knowledge_base')",
            name="ck_course_versions_source_type",
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "course_id",
            "id",
            name="uq_course_versions_course_id_id",
        ),
        sa.UniqueConstraint(
            "course_id",
            "version_number",
            name="uq_course_versions_course_number",
        ),
    )
    op.create_index("ix_course_versions_created_by", "course_versions", ["created_by"])

    op.create_foreign_key(
        "fk_courses_current_version_same_course",
        "courses",
        "course_versions",
        ["id", "current_version_id"],
        ["course_id", "id"],
        deferrable=True,
        initially="DEFERRED",
    )

    op.create_table(
        "course_chapters",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column(
            "content",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("legacy_chapter_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["legacy_chapter_id"],
            ["chapters.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["version_id"],
            ["course_versions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "version_id",
            "id",
            name="uq_course_chapters_version_id_id",
        ),
        sa.UniqueConstraint(
            "legacy_chapter_id",
            name="uq_course_chapters_legacy_chapter_id",
        ),
        sa.UniqueConstraint(
            "version_id",
            "sort_order",
            name="uq_course_chapters_version_order",
        ),
    )
    op.create_table(
        "enrollments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("active_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "enrolled_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('active', 'completed', 'withdrawn')",
            name="ck_enrollments_status",
        ),
        sa.ForeignKeyConstraint(
            ["course_id", "active_version_id"],
            ["course_versions.course_id", "course_versions.id"],
            name="fk_enrollments_active_version_same_course",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "id",
            "active_version_id",
            name="uq_enrollments_id_active_version_id",
        ),
        sa.UniqueConstraint(
            "user_id",
            "course_id",
            name="uq_enrollments_user_course",
        ),
    )
    op.create_index("ix_enrollments_course_id", "enrollments", ["course_id"])
    op.create_index(
        "ix_enrollments_active_version_id",
        "enrollments",
        ["active_version_id"],
    )
    op.create_index("ix_enrollments_status", "enrollments", ["status"])

    op.create_table(
        "chapter_progress",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("enrollment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chapter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="locked",
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('locked', 'unlocked', 'available', 'in_progress', 'completed')",
            name="ck_chapter_progress_status",
        ),
        sa.ForeignKeyConstraint(
            ["enrollment_id", "version_id"],
            ["enrollments.id", "enrollments.active_version_id"],
            name="fk_chapter_progress_enrollment_active_version",
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.ForeignKeyConstraint(
            ["version_id", "chapter_id"],
            ["course_chapters.version_id", "course_chapters.id"],
            name="fk_chapter_progress_chapter_version",
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "enrollment_id",
            "chapter_id",
            name="uq_chapter_progress_enrollment_chapter",
        ),
    )
    op.create_index(
        "ix_chapter_progress_chapter_id",
        "chapter_progress",
        ["chapter_id"],
    )
    op.create_index(
        "ix_chapter_progress_version_id",
        "chapter_progress",
        ["version_id"],
    )
    op.create_index("ix_chapter_progress_status", "chapter_progress", ["status"])

    op.create_table(
        "course_version_knowledge_bases",
        sa.Column("course_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kb_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["course_version_id"],
            ["course_versions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["kb_id"],
            ["knowledge_bases.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("course_version_id", "kb_id"),
    )
    op.create_index(
        "ix_course_version_knowledge_bases_kb_id",
        "course_version_knowledge_bases",
        ["kb_id"],
    )

    # Reuse legacy UUIDs in separate tables to make compatibility joins stable
    # without requiring a database-specific UUID generation extension.
    # A legacy path was one learner's private material, so it maps to a private
    # draft its owner can still rebuild and an admin can review or publish.
    op.execute(
        """
        INSERT INTO courses (
            id, author_id, topic, difficulty, status, visibility,
            current_version_id, legacy_path_id, created_at, updated_at
        )
        SELECT
            id, user_id, topic, difficulty, 'draft', 'private',
            NULL, id, created_at, updated_at
        FROM learning_paths
        """
    )
    op.execute(
        """
        INSERT INTO course_versions (
            id, course_id, version_number, outline, source_type, created_by, created_at
        )
        SELECT id, id, 1, outline, 'ai_generated', user_id, created_at
        FROM learning_paths
        """
    )
    op.execute(
        """
        UPDATE courses
        SET current_version_id = id
        WHERE legacy_path_id IS NOT NULL
        """
    )
    # Legacy chapters.sort_order was never unique or dense: older rows and rows
    # written by the KB rebuild trusted LLM-supplied ordering. Renumbering keeps
    # the reading order while satisfying uq_course_chapters_version_order.
    op.execute(
        """
        INSERT INTO course_chapters (
            id, version_id, sort_order, title, summary, content,
            legacy_chapter_id, created_at
        )
        SELECT
            id,
            path_id,
            row_number() OVER (
                PARTITION BY path_id ORDER BY sort_order, created_at, id
            ),
            title,
            summary,
            NULL,
            id,
            created_at
        FROM chapters
        """
    )
    op.execute(
        """
        INSERT INTO enrollments (
            id, user_id, course_id, active_version_id, status, enrolled_at, updated_at
        )
        SELECT id, user_id, id, id, 'active', created_at, updated_at
        FROM learning_paths
        """
    )
    op.execute(
        """
        INSERT INTO chapter_progress (
            id, enrollment_id, version_id, chapter_id,
            status, completed_at, created_at, updated_at
        )
        SELECT
            id, path_id, path_id, id, status, completed_at, created_at, created_at
        FROM chapters
        """
    )
    op.execute(
        """
        INSERT INTO course_version_knowledge_bases (course_version_id, kb_id)
        SELECT path_id, kb_id
        FROM path_knowledge_bases
        """
    )


def downgrade() -> None:
    op.drop_index(
        "ix_course_version_knowledge_bases_kb_id",
        table_name="course_version_knowledge_bases",
    )
    op.drop_table("course_version_knowledge_bases")

    op.drop_index("ix_chapter_progress_status", table_name="chapter_progress")
    op.drop_index("ix_chapter_progress_version_id", table_name="chapter_progress")
    op.drop_index("ix_chapter_progress_chapter_id", table_name="chapter_progress")
    op.drop_table("chapter_progress")

    op.drop_index("ix_enrollments_status", table_name="enrollments")
    op.drop_index("ix_enrollments_active_version_id", table_name="enrollments")
    op.drop_index("ix_enrollments_course_id", table_name="enrollments")
    op.drop_table("enrollments")

    op.drop_table("course_chapters")

    op.drop_constraint(
        "fk_courses_current_version_same_course",
        "courses",
        type_="foreignkey",
    )
    op.drop_index("ix_course_versions_created_by", table_name="course_versions")
    op.drop_table("course_versions")

    op.drop_index("ix_courses_visibility", table_name="courses")
    op.drop_index("ix_courses_status", table_name="courses")
    op.drop_index("ix_courses_author_id", table_name="courses")
    op.drop_table("courses")

    op.drop_index(
        "ix_knowledge_bases_approval_status",
        table_name="knowledge_bases",
    )
    op.drop_index("ix_knowledge_bases_visibility", table_name="knowledge_bases")
    op.drop_constraint(
        "ck_knowledge_bases_approval_status",
        "knowledge_bases",
        type_="check",
    )
    op.drop_constraint(
        "ck_knowledge_bases_visibility",
        "knowledge_bases",
        type_="check",
    )
    op.drop_constraint(
        "fk_knowledge_bases_reviewed_by_users",
        "knowledge_bases",
        type_="foreignkey",
    )
    op.drop_column("knowledge_bases", "reviewed_at")
    op.drop_column("knowledge_bases", "review_note")
    op.drop_column("knowledge_bases", "reviewed_by")
    op.drop_column("knowledge_bases", "approval_status")
    op.drop_column("knowledge_bases", "visibility")
