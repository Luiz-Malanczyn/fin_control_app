import calendar as calendar_module
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import (
    Category,
    Installment,
    RecurringRule,
    Transaction,
    TransactionKind,
    User,
)
from app.recurrence import occurrences_for_installment, occurrences_for_rule
from app.schemas import CalendarItem, CategorySummary, ForecastOut, SummaryOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _month_bounds(today: date) -> tuple[date, date]:
    start = today.replace(day=1)
    last_day = calendar_module.monthrange(today.year, today.month)[1]
    end = today.replace(day=last_day)
    return start, end


@router.get("/calendar", response_model=list[CalendarItem])
def calendar(
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CalendarItem]:
    items: list[CalendarItem] = []

    posted = db.scalars(
        select(Transaction).where(
            Transaction.user_id == user.id,
            Transaction.date >= date_from,
            Transaction.date <= date_to,
        )
    )
    posted_keys: set[tuple] = set()
    for t in posted:
        items.append(
            CalendarItem(date=t.date, description=t.description, amount=t.amount, kind=t.kind, source=t.source)
        )
        if t.recurring_rule_id:
            posted_keys.add(("rule", t.recurring_rule_id, t.date))
        if t.installment_id:
            posted_keys.add(("installment", t.installment_id, t.installment_number))

    rules = db.scalars(select(RecurringRule).where(RecurringRule.user_id == user.id))
    for rule in rules:
        for occurrence_date in occurrences_for_rule(rule, date_from, date_to):
            if ("rule", rule.id, occurrence_date) in posted_keys:
                continue
            items.append(
                CalendarItem(
                    date=occurrence_date,
                    description=rule.description,
                    amount=rule.amount,
                    kind=rule.kind,
                    source="recurring",
                )
            )

    installments = db.scalars(select(Installment).where(Installment.user_id == user.id))
    for installment in installments:
        for occurrence_date, number in occurrences_for_installment(installment, date_from, date_to):
            if ("installment", installment.id, number) in posted_keys:
                continue
            items.append(
                CalendarItem(
                    date=occurrence_date,
                    description=f"{installment.description} ({number}/{installment.installment_count})",
                    amount=installment.installment_amount,
                    kind=TransactionKind.expense,
                    source="installment",
                )
            )

    items.sort(key=lambda i: i.date)
    return items


@router.get("/summary", response_model=SummaryOut)
def summary(
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SummaryOut:
    transactions = list(
        db.scalars(
            select(Transaction).where(
                Transaction.user_id == user.id,
                Transaction.date >= date_from,
                Transaction.date <= date_to,
            )
        )
    )

    total_income = sum((t.amount for t in transactions if t.kind == TransactionKind.income), Decimal(0))
    total_expense = sum((t.amount for t in transactions if t.kind == TransactionKind.expense), Decimal(0))

    categories = {c.id: c.name for c in db.scalars(select(Category).where(Category.user_id == user.id))}
    totals_by_category: dict[int | None, Decimal] = {}
    for t in transactions:
        if t.kind != TransactionKind.expense:
            continue
        totals_by_category[t.category_id] = totals_by_category.get(t.category_id, Decimal(0)) + t.amount

    by_category = [
        CategorySummary(
            category_id=cid,
            category_name=categories.get(cid, "Sem categoria"),
            total=total,
        )
        for cid, total in sorted(totals_by_category.items(), key=lambda kv: kv[1], reverse=True)
    ]

    return SummaryOut(
        period_start=date_from,
        period_end=date_to,
        total_income=total_income,
        total_expense=total_expense,
        by_category=by_category,
    )


@router.get("/forecast", response_model=ForecastOut)
def forecast(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> ForecastOut:
    today = date.today()
    month_start, month_end = _month_bounds(today)

    all_transactions = list(
        db.scalars(select(Transaction).where(Transaction.user_id == user.id, Transaction.date <= today))
    )
    current_balance = sum(
        (t.amount if t.kind == TransactionKind.income else -t.amount for t in all_transactions),
        Decimal(0),
    )

    expenses_posted = sum(
        (
            t.amount
            for t in all_transactions
            if t.kind == TransactionKind.expense and t.date >= month_start
        ),
        Decimal(0),
    )

    tomorrow = today + timedelta(days=1)

    expected_income_remaining = Decimal(0)
    fixed_expenses_remaining = Decimal(0)
    if tomorrow <= month_end:
        rules = db.scalars(select(RecurringRule).where(RecurringRule.user_id == user.id))
        for rule in rules:
            occurrences = occurrences_for_rule(rule, max(tomorrow, month_start), month_end)
            total = rule.amount * len(occurrences)
            if rule.kind == TransactionKind.income:
                expected_income_remaining += total
            else:
                fixed_expenses_remaining += total

        installments_remaining = Decimal(0)
        installments = db.scalars(select(Installment).where(Installment.user_id == user.id))
        for installment in installments:
            occurrences = occurrences_for_installment(installment, max(tomorrow, month_start), month_end)
            installments_remaining += installment.installment_amount * len(occurrences)
    else:
        installments_remaining = Decimal(0)

    projected_month_end_balance = (
        current_balance + expected_income_remaining - fixed_expenses_remaining - installments_remaining
    )

    return ForecastOut(
        as_of=today,
        month_start=month_start,
        month_end=month_end,
        current_balance=current_balance,
        expected_income_remaining=expected_income_remaining,
        expenses_posted=expenses_posted,
        fixed_expenses_remaining=fixed_expenses_remaining,
        installments_remaining=installments_remaining,
        projected_month_end_balance=projected_month_end_balance,
    )
