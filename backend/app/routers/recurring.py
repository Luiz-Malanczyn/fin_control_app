from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, verify_cron_secret
from app.models import (
    Account,
    Installment,
    RecurringRule,
    Transaction,
    TransactionKind,
    TransactionSource,
    User,
)
from app.recurrence import occurrences_for_installment, occurrences_for_rule
from app.schemas import (
    InstallmentCreate,
    InstallmentOut,
    InstallmentUpdate,
    RecurringRuleCreate,
    RecurringRuleOut,
    RecurringRuleUpdate,
)

router = APIRouter(tags=["recurring"])


@router.get("/recurring-rules", response_model=list[RecurringRuleOut])
def list_recurring_rules(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[RecurringRule]:
    return list(
        db.scalars(select(RecurringRule).where(RecurringRule.household_id == user.household_id))
    )


@router.post("/recurring-rules", response_model=RecurringRuleOut, status_code=status.HTTP_201_CREATED)
def create_recurring_rule(
    payload: RecurringRuleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RecurringRule:
    account = db.get(Account, payload.account_id)
    if account is None or account.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada")

    rule = RecurringRule(household_id=user.household_id, user_id=user.id, **payload.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.patch("/recurring-rules/{rule_id}", response_model=RecurringRuleOut)
def update_recurring_rule(
    rule_id: int,
    payload: RecurringRuleUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RecurringRule:
    rule = db.get(RecurringRule, rule_id)
    if rule is None or rule.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Regra não encontrada")

    updates = payload.model_dump(exclude_unset=True)
    if "account_id" in updates:
        account = db.get(Account, updates["account_id"])
        if account is None or account.household_id != user.household_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada")

    for field, value in updates.items():
        setattr(rule, field, value)

    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/recurring-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    rule = db.get(RecurringRule, rule_id)
    if rule is None or rule.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Regra não encontrada")
    db.delete(rule)
    db.commit()


@router.get("/installments", response_model=list[InstallmentOut])
def list_installments(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Installment]:
    return list(
        db.scalars(select(Installment).where(Installment.household_id == user.household_id))
    )


@router.post("/installments", response_model=InstallmentOut, status_code=status.HTTP_201_CREATED)
def create_installment(
    payload: InstallmentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Installment:
    account = db.get(Account, payload.account_id)
    if account is None or account.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada")

    installment = Installment(
        household_id=user.household_id,
        user_id=user.id,
        account_id=payload.account_id,
        category_id=payload.category_id,
        description=payload.description,
        total_amount=payload.total_amount,
        installment_count=payload.installment_count,
        installment_amount=round(payload.total_amount / payload.installment_count, 2),
        start_date=payload.start_date,
    )
    db.add(installment)
    db.commit()
    db.refresh(installment)
    return installment


@router.patch("/installments/{installment_id}", response_model=InstallmentOut)
def update_installment(
    installment_id: int,
    payload: InstallmentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Installment:
    installment = db.get(Installment, installment_id)
    if installment is None or installment.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parcelamento não encontrado")

    updates = payload.model_dump(exclude_unset=True)
    if "account_id" in updates:
        account = db.get(Account, updates["account_id"])
        if account is None or account.household_id != user.household_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada")

    for field, value in updates.items():
        setattr(installment, field, value)

    db.commit()
    db.refresh(installment)
    return installment


@router.delete("/installments/{installment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_installment(
    installment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    installment = db.get(Installment, installment_id)
    if installment is None or installment.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parcelamento não encontrado")
    db.delete(installment)
    db.commit()


@router.post("/internal/cron", dependencies=[Depends(verify_cron_secret)])
def run_daily_cron(db: Session = Depends(get_db)) -> dict[str, int]:
    """Materializa as ocorrências de hoje de regras recorrentes e parcelas em transações reais.

    Chamado pelo Google Cloud Scheduler uma vez por dia. Idempotente: usa as
    constraints únicas em Transaction para não duplicar se rodar mais de uma vez.
    """
    today = date.today()
    created = 0

    rules = db.scalars(select(RecurringRule)).all()
    for rule in rules:
        for occurrence_date in occurrences_for_rule(rule, today, today):
            exists = db.scalar(
                select(Transaction).where(
                    Transaction.recurring_rule_id == rule.id,
                    Transaction.date == occurrence_date,
                )
            )
            if exists is not None:
                continue
            db.add(
                Transaction(
                    household_id=rule.household_id,
                    user_id=rule.user_id,
                    account_id=rule.account_id,
                    category_id=rule.category_id,
                    recurring_rule_id=rule.id,
                    date=occurrence_date,
                    description=rule.description,
                    amount=rule.amount,
                    kind=rule.kind,
                    source=TransactionSource.recurring,
                )
            )
            created += 1

    installments = db.scalars(select(Installment)).all()
    for installment in installments:
        for occurrence_date, number in occurrences_for_installment(installment, today, today):
            exists = db.scalar(
                select(Transaction).where(
                    Transaction.installment_id == installment.id,
                    Transaction.installment_number == number,
                )
            )
            if exists is not None:
                continue
            db.add(
                Transaction(
                    household_id=installment.household_id,
                    user_id=installment.user_id,
                    account_id=installment.account_id,
                    category_id=installment.category_id,
                    installment_id=installment.id,
                    installment_number=number,
                    date=occurrence_date,
                    description=f"{installment.description} ({number}/{installment.installment_count})",
                    amount=installment.installment_amount,
                    kind=TransactionKind.expense,
                    source=TransactionSource.installment,
                )
            )
            created += 1

    db.commit()
    return {"transactions_created": created}
