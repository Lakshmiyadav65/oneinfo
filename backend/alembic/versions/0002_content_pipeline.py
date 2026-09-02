"""projects, hooks, scripts, tanglish_scripts, storyboards, storyboard_scenes

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-03

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "creator_id", sa.String(), sa.ForeignKey("creators.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("idea", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        # FK to hooks.id added after hooks exists (circular reference).
        sa.Column("selected_hook_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("research_topic", sa.String(), nullable=True),
        sa.Column("research_audience", sa.String(), nullable=True),
        sa.Column("research_goal", sa.String(), nullable=True),
        sa.Column("research_angle", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_projects_creator_id", "projects", ["creator_id"])
    op.create_index("ix_projects_status", "projects", ["status"])

    op.create_table(
        "hooks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "creator_id", sa.String(), sa.ForeignKey("creators.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("text", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("is_selected", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_hooks_project_id", "hooks", ["project_id"])
    op.create_index("ix_hooks_creator_id", "hooks", ["creator_id"])

    op.create_foreign_key(
        "fk_projects_selected_hook_id",
        "projects",
        "hooks",
        ["selected_hook_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "scripts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "creator_id", sa.String(), sa.ForeignKey("creators.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("language", sa.String(), nullable=False, server_default="english"),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("estimated_duration_seconds", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_scripts_project_id", "scripts", ["project_id"])
    op.create_index("ix_scripts_creator_id", "scripts", ["creator_id"])
    op.create_index("ix_scripts_status", "scripts", ["status"])

    op.create_table(
        "tanglish_scripts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "creator_id", sa.String(), sa.ForeignKey("creators.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_tanglish_scripts_project_id", "tanglish_scripts", ["project_id"])
    op.create_index("ix_tanglish_scripts_creator_id", "tanglish_scripts", ["creator_id"])
    op.create_index("ix_tanglish_scripts_status", "tanglish_scripts", ["status"])

    op.create_table(
        "storyboards",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "creator_id", sa.String(), sa.ForeignKey("creators.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("qa_passed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("qa_issues", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_storyboards_creator_id", "storyboards", ["creator_id"])

    op.create_table(
        "storyboard_scenes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "storyboard_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("storyboards.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "creator_id", sa.String(), sa.ForeignKey("creators.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("voiceover", sa.Text(), nullable=False),
        sa.Column("visual_prompt", sa.Text(), nullable=False),
        sa.Column("caption", sa.Text(), nullable=False),
    )
    op.create_index("ix_storyboard_scenes_storyboard_id", "storyboard_scenes", ["storyboard_id"])
    op.create_index("ix_storyboard_scenes_creator_id", "storyboard_scenes", ["creator_id"])


def downgrade() -> None:
    op.drop_table("storyboard_scenes")
    op.drop_table("storyboards")
    op.drop_table("tanglish_scripts")
    op.drop_table("scripts")
    op.drop_constraint("fk_projects_selected_hook_id", "projects", type_="foreignkey")
    op.drop_table("hooks")
    op.drop_table("projects")
