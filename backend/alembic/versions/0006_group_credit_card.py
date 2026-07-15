"""add is_credit_card and due_day to transaction_groups

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-14

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transaction_groups",
        sa.Column("is_credit_card", sa.Boolean, nullable=False, server_default=sa.false()),
    )
    op.add_column("transaction_groups", sa.Column("due_day", sa.Integer, nullable=True))


def downgrade() -> None:
    op.drop_column("transaction_groups", "due_day")
    op.drop_column("transaction_groups", "is_credit_card")
