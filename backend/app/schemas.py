import datetime as dt_module
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import (
    AccountType,
    ImportStatus,
    RecurrenceFrequency,
    TransactionKind,
    TransactionSource,
)

# Convenção de sinal usada pelo banco no CSV exportado:
# - income_positive: positivo = receita, negativo = despesa (extratos de conta)
# - expense_positive: positivo = despesa, negativo = estorno/crédito (faturas de cartão)
# - all_expense: ignora o sinal, tudo vira despesa (extratos só de gastos)
AmountConvention = Literal["income_positive", "expense_positive", "all_expense"]

# --- auth ---


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = Field(min_length=1, max_length=120)
    invite_code: str | None = Field(default=None, max_length=12)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: EmailStr
    name: str
    household_id: int


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# --- household (modo casal) ---


class HouseholdMember(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: EmailStr


class HouseholdOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    invite_code: str
    members: list[HouseholdMember]


class HouseholdRename(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class HouseholdJoin(BaseModel):
    invite_code: str = Field(min_length=1, max_length=12)


# --- accounts ---


class AccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: AccountType
    opening_balance: Decimal = Decimal(0)
    opening_balance_date: date = Field(default_factory=date.today)
    due_day: int | None = Field(default=None, ge=1, le=31)


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    type: AccountType
    opening_balance: Decimal
    opening_balance_date: date
    due_day: int | None


class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    type: AccountType | None = None
    opening_balance: Decimal | None = None
    opening_balance_date: date | None = None
    due_day: int | None = Field(default=None, ge=1, le=31)


# --- categories ---


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    parent_id: int | None = None
    color: str | None = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    parent_id: int | None
    color: str | None


# --- budgets ---


class BudgetCreate(BaseModel):
    category_id: int
    amount: Decimal = Field(gt=0)


class BudgetOut(BaseModel):
    id: int
    category_id: int
    category_name: str
    amount: Decimal
    spent: Decimal
    remaining: Decimal
    percentage: float


# --- transaction groups ---


class TransactionGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class TransactionGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


# --- transactions ---


class TransactionCreate(BaseModel):
    account_id: int
    category_id: int | None = None
    group_id: int | None = None
    date: date
    description: str = Field(min_length=1, max_length=200)
    amount: Decimal = Field(gt=0)
    kind: TransactionKind


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    account_id: int
    category_id: int | None
    group_id: int | None
    user_id: int
    date: date
    description: str
    amount: Decimal
    kind: TransactionKind
    source: TransactionSource
    installment_number: int | None
    paid: bool


class TransactionUpdate(BaseModel):
    account_id: int | None = None
    category_id: int | None = None
    group_id: int | None = None
    # dt_module.date (not the bare `date` import) is required here: a class-body
    # annotated assignment `date: date | None = None` self-shadows, because the
    # `= None` gets stored to the class attribute `date` before the annotation
    # `date | None` is evaluated, so it resolves to `None | None` and raises.
    date: dt_module.date | None = None
    description: str | None = Field(default=None, min_length=1, max_length=200)
    amount: Decimal | None = Field(default=None, gt=0)
    kind: TransactionKind | None = None
    paid: bool | None = None


class ImportColumnMapping(BaseModel):
    date_column: str = "date"
    description_column: str = "description"
    amount_column: str = "amount"
    date_format: str = "%Y-%m-%d"
    amount_convention: AmountConvention = "income_positive"


class ImportResult(BaseModel):
    import_id: int
    row_count: int
    skipped_duplicates: int
    errors: list[str]
    status: ImportStatus


class ImportPreviewRow(BaseModel):
    index: int
    date: date
    description: str
    amount: Decimal
    kind: TransactionKind


class ImportPreview(BaseModel):
    file_type: Literal["csv", "pdf"]
    columns: list[str] | None = None
    mapping: ImportColumnMapping
    rows: list[ImportPreviewRow]
    row_count: int
    errors: list[str]


# --- recurring rules ---


class RecurringRuleCreate(BaseModel):
    account_id: int
    category_id: int | None = None
    description: str = Field(min_length=1, max_length=200)
    amount: Decimal = Field(gt=0)
    kind: TransactionKind
    frequency: RecurrenceFrequency
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    weekday: int | None = Field(default=None, ge=0, le=6)
    start_date: date
    end_date: date | None = None


class RecurringRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    account_id: int
    category_id: int | None
    description: str
    amount: Decimal
    kind: TransactionKind
    frequency: RecurrenceFrequency
    day_of_month: int | None
    weekday: int | None
    start_date: date
    end_date: date | None


class RecurringRuleUpdate(BaseModel):
    account_id: int | None = None
    category_id: int | None = None
    description: str | None = Field(default=None, min_length=1, max_length=200)
    amount: Decimal | None = Field(default=None, gt=0)
    kind: TransactionKind | None = None
    frequency: RecurrenceFrequency | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    weekday: int | None = Field(default=None, ge=0, le=6)
    start_date: date | None = None
    end_date: date | None = None


# --- installments ---


class InstallmentCreate(BaseModel):
    account_id: int
    category_id: int | None = None
    description: str = Field(min_length=1, max_length=200)
    total_amount: Decimal = Field(gt=0)
    installment_count: int = Field(gt=0, le=120)
    start_date: date


class InstallmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    account_id: int
    category_id: int | None
    description: str
    total_amount: Decimal
    installment_count: int
    installment_amount: Decimal
    start_date: date


class InstallmentUpdate(BaseModel):
    account_id: int | None = None
    category_id: int | None = None
    description: str | None = Field(default=None, min_length=1, max_length=200)
    start_date: date | None = None


# --- dashboard ---


class CalendarItem(BaseModel):
    date: date
    description: str
    amount: Decimal
    kind: TransactionKind
    source: TransactionSource
    paid: bool
    transaction_id: int | None = None
    recurring_rule_id: int | None = None
    installment_id: int | None = None
    installment_number: int | None = None


class MarkPaidRequest(BaseModel):
    transaction_id: int | None = None
    recurring_rule_id: int | None = None
    installment_id: int | None = None
    installment_number: int | None = None
    occurrence_date: date | None = None
    paid: bool = True


class CategorySummary(BaseModel):
    category_id: int | None
    category_name: str
    total: Decimal


class GroupSummary(BaseModel):
    group_id: int | None
    group_name: str
    total: Decimal


class PeriodTotal(BaseModel):
    label: str
    period_start: date
    period_end: date
    total_income: Decimal
    total_expense: Decimal


class SummaryOut(BaseModel):
    period_start: date
    period_end: date
    total_income: Decimal
    total_expense: Decimal
    by_category: list[CategorySummary]
    by_group: list[GroupSummary]
    periods: list[PeriodTotal]


class ForecastOut(BaseModel):
    as_of: date
    month_start: date
    month_end: date
    current_balance: Decimal
    expected_income_remaining: Decimal
    expenses_posted: Decimal
    fixed_expenses_remaining: Decimal
    installments_remaining: Decimal
    projected_month_end_balance: Decimal
