import calendar as calendar_module
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import (
    Account,
    Category,
    Installment,
    RecurringRule,
    Transaction,
    TransactionGroup,
    TransactionKind,
    TransactionSource,
    User,
)
from app.recurrence import occurrences_for_installment, occurrences_for_rule
from app.schemas import (
    CalendarItem,
    CategorySummary,
    ForecastOut,
    GroupSummary,
    MarkPaidRequest,
    PeriodTotal,
    SummaryOut,
    TransactionOut,
)
from app.spending import household_items_in_range

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _month_bounds(today: date) -> tuple[date, date]:
    start = today.replace(day=1)
    last_day = calendar_module.monthrange(today.year, today.month)[1]
    end = today.replace(day=last_day)
    return start, end


def _fixed_periods(today: date) -> list[tuple[str, date, date]]:
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    month_start, month_end = _month_bounds(today)
    year_start = today.replace(month=1, day=1)
    year_end = today.replace(month=12, day=31)
    return [
        ("Hoje", today, today),
        ("Semana", week_start, week_end),
        ("Mês", month_start, month_end),
        ("Ano", year_start, year_end),
    ]


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
            Transaction.household_id == user.household_id,
            Transaction.date >= date_from,
            Transaction.date <= date_to,
        )
    )
    posted_keys: set[tuple] = set()
    for t in posted:
        items.append(
            CalendarItem(
                date=t.date,
                description=t.description,
                amount=t.amount,
                kind=t.kind,
                source=t.source,
                paid=t.paid,
                transaction_id=t.id,
                recurring_rule_id=t.recurring_rule_id,
                installment_id=t.installment_id,
                installment_number=t.installment_number,
            )
        )
        if t.recurring_rule_id:
            posted_keys.add(("rule", t.recurring_rule_id, t.date))
        if t.installment_id:
            posted_keys.add(("installment", t.installment_id, t.installment_number))

    rules = db.scalars(select(RecurringRule).where(RecurringRule.household_id == user.household_id))
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
                    paid=False,
                    recurring_rule_id=rule.id,
                )
            )

    installments = db.scalars(select(Installment).where(Installment.household_id == user.household_id))
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
                    paid=False,
                    installment_id=installment.id,
                    installment_number=number,
                )
            )

    items.sort(key=lambda i: i.date)
    return items


@router.post("/mark-paid", response_model=TransactionOut)
def mark_paid(
    payload: MarkPaidRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Transaction:
    """Marca uma conta como paga (ou não). Se já existe uma transação real
    (lançada manualmente ou materializada pelo cron), só troca o status. Se
    ainda é só uma ocorrência prevista de recorrência/parcela, materializa
    ela antecipadamente já com o status escolhido -- por exemplo, marcar
    como pago o aluguel do dia 10 no dia 8 já lança a transação de verdade,
    ao invés de esperar o cron chegar na data."""
    if payload.transaction_id is not None:
        transaction = db.get(Transaction, payload.transaction_id)
        if transaction is None or transaction.household_id != user.household_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Transação não encontrada")
        transaction.paid = payload.paid
        db.commit()
        db.refresh(transaction)
        return transaction

    if payload.recurring_rule_id is not None:
        if payload.occurrence_date is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "occurrence_date é obrigatório")
        rule = db.get(RecurringRule, payload.recurring_rule_id)
        if rule is None or rule.household_id != user.household_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Regra não encontrada")
        existing = db.scalar(
            select(Transaction).where(
                Transaction.recurring_rule_id == rule.id, Transaction.date == payload.occurrence_date
            )
        )
        if existing is not None:
            existing.paid = payload.paid
            db.commit()
            db.refresh(existing)
            return existing
        transaction = Transaction(
            household_id=rule.household_id,
            user_id=user.id,
            account_id=rule.account_id,
            category_id=rule.category_id,
            recurring_rule_id=rule.id,
            date=payload.occurrence_date,
            description=rule.description,
            amount=rule.amount,
            kind=rule.kind,
            source=TransactionSource.recurring,
            paid=payload.paid,
        )
        db.add(transaction)
        db.commit()
        db.refresh(transaction)
        return transaction

    if payload.installment_id is not None:
        if payload.installment_number is None or payload.occurrence_date is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "installment_number e occurrence_date são obrigatórios"
            )
        installment = db.get(Installment, payload.installment_id)
        if installment is None or installment.household_id != user.household_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Parcelamento não encontrado")
        existing = db.scalar(
            select(Transaction).where(
                Transaction.installment_id == installment.id,
                Transaction.installment_number == payload.installment_number,
            )
        )
        if existing is not None:
            existing.paid = payload.paid
            db.commit()
            db.refresh(existing)
            return existing
        transaction = Transaction(
            household_id=installment.household_id,
            user_id=user.id,
            account_id=installment.account_id,
            category_id=installment.category_id,
            installment_id=installment.id,
            installment_number=payload.installment_number,
            date=payload.occurrence_date,
            description=f"{installment.description} ({payload.installment_number}/{installment.installment_count})",
            amount=installment.installment_amount,
            kind=TransactionKind.expense,
            source=TransactionSource.installment,
            paid=payload.paid,
        )
        db.add(transaction)
        db.commit()
        db.refresh(transaction)
        return transaction

    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Informe transaction_id, recurring_rule_id ou installment_id")


@router.get("/summary", response_model=SummaryOut)
def summary(
    date_from: date = Query(...),
    date_to: date = Query(...),
    account_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SummaryOut:
    # Transações reais + ocorrências de recorrência/parcela dentro do período
    # que ainda não viraram transação (contas fixas aparecem no gráfico
    # mesmo sem o cron ter rodado nelas, sem contar 2x quando ele rodar).
    items = household_items_in_range(db, user.household_id, date_from, date_to, account_id=account_id)

    total_income = sum((amount for amount, kind, _, _ in items if kind == TransactionKind.income), Decimal(0))
    total_expense = sum((amount for amount, kind, _, _ in items if kind == TransactionKind.expense), Decimal(0))

    categories = {c.id: c.name for c in db.scalars(select(Category).where(Category.household_id == user.household_id))}
    totals_by_category: dict[int | None, Decimal] = {}
    for amount, kind, category_id, _group_id in items:
        if kind != TransactionKind.expense:
            continue
        totals_by_category[category_id] = totals_by_category.get(category_id, Decimal(0)) + amount

    by_category = [
        CategorySummary(
            category_id=cid,
            category_name=categories.get(cid, "Sem categoria"),
            total=total,
        )
        for cid, total in sorted(totals_by_category.items(), key=lambda kv: kv[1], reverse=True)
    ]

    groups = {g.id: g.name for g in db.scalars(select(TransactionGroup).where(TransactionGroup.household_id == user.household_id))}
    totals_by_group: dict[int | None, Decimal] = {}
    for amount, kind, _category_id, group_id in items:
        if kind != TransactionKind.expense or group_id is None:
            continue
        totals_by_group[group_id] = totals_by_group.get(group_id, Decimal(0)) + amount

    by_group = [
        GroupSummary(
            group_id=gid,
            group_name=groups.get(gid, "Sem grupo"),
            total=total,
        )
        for gid, total in sorted(totals_by_group.items(), key=lambda kv: kv[1], reverse=True)
    ]

    periods = []
    for label, period_start, period_end in _fixed_periods(date.today()):
        period_items = household_items_in_range(db, user.household_id, period_start, period_end, account_id=account_id)
        periods.append(
            PeriodTotal(
                label=label,
                period_start=period_start,
                period_end=period_end,
                total_income=sum((a for a, k, _, _ in period_items if k == TransactionKind.income), Decimal(0)),
                total_expense=sum((a for a, k, _, _ in period_items if k == TransactionKind.expense), Decimal(0)),
            )
        )

    return SummaryOut(
        period_start=date_from,
        period_end=date_to,
        total_income=total_income,
        total_expense=total_expense,
        by_category=by_category,
        by_group=by_group,
        periods=periods,
    )


@router.get("/forecast", response_model=ForecastOut)
def forecast(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> ForecastOut:
    today = date.today()
    month_start, month_end = _month_bounds(today)
    tomorrow = today + timedelta(days=1)

    accounts = {
        a.id: a for a in db.scalars(select(Account).where(Account.household_id == user.household_id))
    }

    # Traz o mês inteiro, não só até hoje: um lançamento manual datado pra
    # frente (ex: salário que cai dia 17, hoje sendo dia 14) já é uma
    # informação conhecida e precisa entrar na previsão, não só recorrências.
    month_transactions = list(
        db.scalars(
            select(Transaction).where(
                Transaction.household_id == user.household_id,
                Transaction.date >= month_start,
                Transaction.date <= month_end,
            )
        )
    )
    # Transações de meses anteriores só entram no saldo atual (já realizado),
    # nunca na previsão do que falta neste mês.
    past_month_transactions = list(
        db.scalars(
            select(Transaction).where(
                Transaction.household_id == user.household_id,
                Transaction.date < month_start,
            )
        )
    )

    # Saldo atual = soma dos saldos iniciais de cada conta + só as transações
    # já realizadas (data <= hoje) a partir da respectiva data de referência.
    # Lançamentos anteriores à data de referência são histórico e não afetam
    # o saldo; lançamentos com data futura ainda não aconteceram de verdade.
    current_balance = sum((a.opening_balance for a in accounts.values()), Decimal(0))
    expenses_posted = Decimal(0)
    expected_income_remaining = Decimal(0)
    fixed_expenses_remaining = Decimal(0)

    for t in past_month_transactions + month_transactions:
        account = accounts.get(t.account_id)
        anchored = account is not None and t.date >= account.opening_balance_date

        if t.date <= today:
            if anchored:
                current_balance += t.amount if t.kind == TransactionKind.income else -t.amount
            if t.kind == TransactionKind.expense and t.date >= month_start:
                expenses_posted += t.amount
        elif t.source not in (TransactionSource.recurring, TransactionSource.installment):
            # Data futura dentro do mês: já é um lançamento real que o
            # usuário cadastrou, então conta como esperado. Recorrência e
            # parcela futuras não passam por aqui pra não contar 2x com a
            # projeção abaixo (o cron só materializa o dia de hoje).
            if t.kind == TransactionKind.income:
                expected_income_remaining += t.amount
            else:
                fixed_expenses_remaining += t.amount

    # Ocorrências de recorrência/parcela que já venceram (até hoje) mas ainda
    # não viraram transação real -- porque o cron diário não rodou nesse dia,
    # por exemplo. Sem isso, uma conta fixa que já foi paga na vida real
    # nunca aparece no saldo enquanto ninguém disparar o cron manualmente.
    materialized_rule_dates = {
        (t.recurring_rule_id, t.date)
        for t in past_month_transactions + month_transactions
        if t.recurring_rule_id is not None
    }
    materialized_installment_numbers = {
        (t.installment_id, t.installment_number)
        for t in past_month_transactions + month_transactions
        if t.installment_id is not None
    }

    all_rules = list(db.scalars(select(RecurringRule).where(RecurringRule.household_id == user.household_id)))
    for rule in all_rules:
        account = accounts.get(rule.account_id)
        for occurrence_date in occurrences_for_rule(rule, rule.start_date, today):
            if (rule.id, occurrence_date) in materialized_rule_dates:
                continue
            if account is None or occurrence_date < account.opening_balance_date:
                continue
            current_balance += rule.amount if rule.kind == TransactionKind.income else -rule.amount
            if rule.kind == TransactionKind.expense and occurrence_date >= month_start:
                expenses_posted += rule.amount

    all_installments = list(
        db.scalars(select(Installment).where(Installment.household_id == user.household_id))
    )
    for installment in all_installments:
        account = accounts.get(installment.account_id)
        for occurrence_date, number in occurrences_for_installment(installment, installment.start_date, today):
            if (installment.id, number) in materialized_installment_numbers:
                continue
            if account is None or occurrence_date < account.opening_balance_date:
                continue
            current_balance -= installment.installment_amount
            if occurrence_date >= month_start:
                expenses_posted += installment.installment_amount

    installments_remaining = Decimal(0)
    if tomorrow <= month_end:
        for rule in all_rules:
            occurrences = occurrences_for_rule(rule, max(tomorrow, month_start), month_end)
            total = rule.amount * len(occurrences)
            if rule.kind == TransactionKind.income:
                expected_income_remaining += total
            else:
                fixed_expenses_remaining += total

        for installment in all_installments:
            occurrences = occurrences_for_installment(installment, max(tomorrow, month_start), month_end)
            installments_remaining += installment.installment_amount * len(occurrences)

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
