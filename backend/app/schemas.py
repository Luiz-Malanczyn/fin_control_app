from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import (
    AccountType,
    ImportStatus,
    RecurrenceFrequency,
    TransactionKind,
    TransactionSource,
)

# --- auth ---


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = Field(min_length=1, max_length=120)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: EmailStr
    name: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# --- accounts ---


class AccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: AccountType


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    type: AccountType


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
    date: date
    description: str
    amount: Decimal
    kind: TransactionKind
    source: TransactionSource
    installment_number: int | None


class ImportColumnMapping(BaseModel):
    date_column: str = "date"
    description_column: str = "description"
    amount_column: str = "amount"
    date_format: str = "%Y-%m-%d"
    # Se True, valores negativos no CSV viram despesa e positivos viram receita.
    # Se False, todo valor é tratado como despesa (comum em extratos "só de gastos").
    signed_amounts: bool = True


class ImportResult(BaseModel):
    import_id: int
    row_count: int
    status: ImportStatus


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


# --- dashboard ---


class CalendarItem(BaseModel):
    date: date
    description: str
    amount: Decimal
    kind: TransactionKind
    source: TransactionSource


class CategorySummary(BaseModel):
    category_id: int | None
    category_name: str
    total: Decimal


class SummaryOut(BaseModel):
    period_start: date
    period_end: date
    total_income: Decimal
    total_expense: Decimal
    by_category: list[CategorySummary]


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
