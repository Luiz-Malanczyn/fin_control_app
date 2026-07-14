"""add paid flag to transactions and due_day to accounts

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-14

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("due_day", sa.Integer, nullable=True))

    op.add_column(
        "transactions", sa.Column("paid", sa.Boolean, nullable=False, server_default=sa.true())
    )
    # Lançamentos que já existirem antes dessa migration continuam contando
    # pro saldo do jeito que já contavam -- não faz sentido "despausar" a
    # semântica deles retroativamente, então todos nascem pagos por padrão
    # (o server_default acima já cobre isso).


def downgrade() -> None:
    op.drop_column("transactions", "paid")
    op.drop_column("accounts", "due_day")
