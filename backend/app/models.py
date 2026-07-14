import enum
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AccountType(str, enum.Enum):
    checking = "checking"
    credit_card = "credit_card"
    cash = "cash"
    savings = "savings"


class RecurrenceFrequency(str, enum.Enum):
    monthly = "monthly"
    weekly = "weekly"


class TransactionKind(str, enum.Enum):
    expense = "expense"
    income = "income"


class TransactionSource(str, enum.Enum):
    manual = "manual"
    import_ = "import"
    recurring = "recurring"
    installment = "installment"


class ImportStatus(str, enum.Enum):
    processing = "processing"
    done = "done"
    failed = "failed"


class Household(Base):
    __tablename__ = "households"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    invite_code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("households.id"), index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("households.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    type: Mapped[AccountType] = mapped_column(Enum(AccountType, native_enum=False))
    # Saldo "ancora": lançamentos anteriores a opening_balance_date são só
    # histórico e não entram no cálculo do saldo atual. Isso permite cadastrar
    # gastos passados pra estatística sem precisar reconciliar o saldo real.
    opening_balance: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    opening_balance_date: Mapped[date] = mapped_column(Date)
    # Dia de vencimento da fatura, só relevante pra contas do tipo credit_card.
    due_day: Mapped[int | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="account")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("households.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(120))
    color: Mapped[str | None] = mapped_column(String(9))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (UniqueConstraint("household_id", "category_id", name="uq_household_category_budget"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("households.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"))
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TransactionGroup(Base):
    __tablename__ = "transaction_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("households.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RecurringRule(Base):
    __tablename__ = "recurring_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("households.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    description: Mapped[str] = mapped_column(String(200))
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    kind: Mapped[TransactionKind] = mapped_column(Enum(TransactionKind, native_enum=False))
    frequency: Mapped[RecurrenceFrequency] = mapped_column(Enum(RecurrenceFrequency, native_enum=False))
    day_of_month: Mapped[int | None] = mapped_column()
    weekday: Mapped[int | None] = mapped_column()
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Installment(Base):
    __tablename__ = "installments"

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("households.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    description: Mapped[str] = mapped_column(String(200))
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2))
    installment_count: Mapped[int] = mapped_column()
    installment_amount: Mapped[float] = mapped_column(Numeric(12, 2))
    start_date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ImportBatch(Base):
    __tablename__ = "imports"

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("households.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    bank: Mapped[str | None] = mapped_column(String(80))
    row_count: Mapped[int] = mapped_column(default=0)
    status: Mapped[ImportStatus] = mapped_column(
        Enum(ImportStatus, native_enum=False), default=ImportStatus.processing
    )
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        UniqueConstraint("recurring_rule_id", "date", name="uq_recurring_rule_date"),
        UniqueConstraint("installment_id", "installment_number", name="uq_installment_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("households.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    group_id: Mapped[int | None] = mapped_column(ForeignKey("transaction_groups.id", ondelete="SET NULL"))
    recurring_rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("recurring_rules.id", ondelete="CASCADE"), index=True
    )
    installment_id: Mapped[int | None] = mapped_column(
        ForeignKey("installments.id", ondelete="CASCADE"), index=True
    )
    installment_number: Mapped[int | None] = mapped_column()
    import_batch_id: Mapped[int | None] = mapped_column(ForeignKey("imports.id", ondelete="SET NULL"))

    date: Mapped[date] = mapped_column(Date, index=True)
    description: Mapped[str] = mapped_column(String(200))
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    kind: Mapped[TransactionKind] = mapped_column(Enum(TransactionKind, native_enum=False))
    source: Mapped[TransactionSource] = mapped_column(Enum(TransactionSource, native_enum=False))
    # Lançamentos manuais/importados nascem pagos (já aconteceram na vida
    # real). Recorrência/parcela materializada pelo cron nasce não paga --
    # o usuário confirma quando efetivamente pagar, tipo um checklist.
    paid: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    account: Mapped["Account"] = relationship(back_populates="transactions")
