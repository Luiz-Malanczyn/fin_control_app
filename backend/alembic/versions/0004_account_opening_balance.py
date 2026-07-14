"""add opening balance/date to accounts

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-14

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts", sa.Column("opening_balance", sa.Numeric(12, 2), nullable=False, server_default="0")
    )
    op.add_column("accounts", sa.Column("opening_balance_date", sa.Date, nullable=True))

    connection = op.get_bind()
    # Contas existentes: assume que o saldo inicial (0) valia a partir da data
    # da transação mais antiga já lançada, ou hoje se a conta não tem nenhuma.
    connection.execute(
        sa.text(
            """
            UPDATE accounts a
            SET opening_balance_date = COALESCE(
                (SELECT MIN(t.date) FROM transactions t WHERE t.account_id = a.id),
                CURRENT_DATE
            )
            """
        )
    )
    op.alter_column("accounts", "opening_balance_date", nullable=False)


def downgrade() -> None:
    op.drop_column("accounts", "opening_balance_date")
    op.drop_column("accounts", "opening_balance")
