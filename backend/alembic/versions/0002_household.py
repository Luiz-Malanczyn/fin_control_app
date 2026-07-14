"""add households (modo casal)

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-14

"""
import secrets
import string
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES_WITH_OWNER = [
    "accounts",
    "categories",
    "transaction_groups",
    "recurring_rules",
    "installments",
    "imports",
    "transactions",
]

_ALPHABET = "".join(c for c in string.ascii_uppercase + string.digits if c not in "0O1I")


def _new_invite_code() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(8))


def upgrade() -> None:
    op.create_table(
        "households",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("invite_code", sa.String(12), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_households_invite_code", "households", ["invite_code"])

    op.add_column("users", sa.Column("household_id", sa.Integer, nullable=True))
    op.create_index("ix_users_household_id", "users", ["household_id"])

    connection = op.get_bind()

    # Cada usuário existente ganha seu próprio lar (podem se juntar depois via convite).
    users = connection.execute(sa.text("SELECT id, name FROM users")).fetchall()
    for user_id, user_name in users:
        household_id = connection.execute(
            sa.text(
                "INSERT INTO households (name, invite_code, created_at) "
                "VALUES (:name, :code, now()) RETURNING id"
            ),
            {"name": f"Lar de {user_name}", "code": _new_invite_code()},
        ).scalar_one()
        connection.execute(
            sa.text("UPDATE users SET household_id = :hid WHERE id = :uid"),
            {"hid": household_id, "uid": user_id},
        )

    op.alter_column("users", "household_id", nullable=False)
    op.create_foreign_key("fk_users_household", "users", "households", ["household_id"], ["id"])

    for table in _TABLES_WITH_OWNER:
        op.add_column(table, sa.Column("household_id", sa.Integer, nullable=True))
        op.create_index(f"ix_{table}_household_id", table, ["household_id"])
        connection.execute(
            sa.text(
                f"UPDATE {table} t SET household_id = u.household_id "
                f"FROM users u WHERE t.user_id = u.id"
            )
        )
        op.alter_column(table, "household_id", nullable=False)
        op.create_foreign_key(f"fk_{table}_household", table, "households", ["household_id"], ["id"])


def downgrade() -> None:
    for table in reversed(_TABLES_WITH_OWNER):
        op.drop_constraint(f"fk_{table}_household", table, type_="foreignkey")
        op.drop_index(f"ix_{table}_household_id", table_name=table)
        op.drop_column(table, "household_id")

    op.drop_constraint("fk_users_household", "users", type_="foreignkey")
    op.drop_index("ix_users_household_id", table_name="users")
    op.drop_column("users", "household_id")

    op.drop_index("ix_households_invite_code", table_name="households")
    op.drop_table("households")
