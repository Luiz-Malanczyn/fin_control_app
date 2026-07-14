"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-07-14

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.models import (
    AccountType,
    ImportStatus,
    RecurrenceFrequency,
    TransactionKind,
    TransactionSource,
)

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("type", sa.Enum(AccountType, native_enum=False), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_accounts_user_id", "accounts", ["user_id"])

    op.create_table(
        "categories",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_id", sa.Integer, sa.ForeignKey("categories.id", ondelete="SET NULL")),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("color", sa.String(9)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_categories_user_id", "categories", ["user_id"])

    op.create_table(
        "transaction_groups",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_transaction_groups_user_id", "transaction_groups", ["user_id"])

    op.create_table(
        "recurring_rules",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", sa.Integer, sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", sa.Integer, sa.ForeignKey("categories.id", ondelete="SET NULL")),
        sa.Column("description", sa.String(200), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("kind", sa.Enum(TransactionKind, native_enum=False), nullable=False),
        sa.Column("frequency", sa.Enum(RecurrenceFrequency, native_enum=False), nullable=False),
        sa.Column("day_of_month", sa.Integer),
        sa.Column("weekday", sa.Integer),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_recurring_rules_user_id", "recurring_rules", ["user_id"])

    op.create_table(
        "installments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", sa.Integer, sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", sa.Integer, sa.ForeignKey("categories.id", ondelete="SET NULL")),
        sa.Column("description", sa.String(200), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("installment_count", sa.Integer, nullable=False),
        sa.Column("installment_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_installments_user_id", "installments", ["user_id"])

    op.create_table(
        "imports",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("bank", sa.String(80)),
        sa.Column("row_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "status",
            sa.Enum(ImportStatus, native_enum=False),
            nullable=False,
            server_default=ImportStatus.processing.value,
        ),
        sa.Column("imported_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_imports_user_id", "imports", ["user_id"])

    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", sa.Integer, sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", sa.Integer, sa.ForeignKey("categories.id", ondelete="SET NULL")),
        sa.Column("group_id", sa.Integer, sa.ForeignKey("transaction_groups.id", ondelete="SET NULL")),
        sa.Column("recurring_rule_id", sa.Integer, sa.ForeignKey("recurring_rules.id", ondelete="CASCADE")),
        sa.Column("installment_id", sa.Integer, sa.ForeignKey("installments.id", ondelete="CASCADE")),
        sa.Column("installment_number", sa.Integer),
        sa.Column("import_batch_id", sa.Integer, sa.ForeignKey("imports.id", ondelete="SET NULL")),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("description", sa.String(200), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("kind", sa.Enum(TransactionKind, native_enum=False), nullable=False),
        sa.Column("source", sa.Enum(TransactionSource, native_enum=False), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("recurring_rule_id", "date", name="uq_recurring_rule_date"),
        sa.UniqueConstraint("installment_id", "installment_number", name="uq_installment_number"),
    )
    op.create_index("ix_transactions_user_id", "transactions", ["user_id"])
    op.create_index("ix_transactions_date", "transactions", ["date"])
    op.create_index("ix_transactions_recurring_rule_id", "transactions", ["recurring_rule_id"])
    op.create_index("ix_transactions_installment_id", "transactions", ["installment_id"])


def downgrade() -> None:
    op.drop_table("transactions")
    op.drop_table("imports")
    op.drop_table("installments")
    op.drop_table("recurring_rules")
    op.drop_table("transaction_groups")
    op.drop_table("categories")
    op.drop_table("accounts")
    op.drop_table("users")
