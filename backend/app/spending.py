from datetime import date
from decimal import Decimal
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Installment, RecurringRule, Transaction, TransactionKind
from app.recurrence import occurrences_for_installment, occurrences_for_rule


class SpendingItem(NamedTuple):
    """Um item de gasto/receita: transação real ou ocorrência projetada de
    recorrência/parcela ainda não materializada. Campos nomeados (em vez de
    tupla posicional) porque essa estrutura alimenta várias visões diferentes
    (resumo por categoria/grupo, orçamentos, listagem de lançamentos do
    período) e destrinchar por posição ficaria frágil a cada campo novo.
    """

    date: date
    description: str
    amount: Decimal
    kind: TransactionKind
    category_id: int | None
    group_id: int | None
    account_id: int


def household_items_in_range(
    db: Session,
    household_id: int,
    date_from: date,
    date_to: date,
    account_id: int | None = None,
) -> list[SpendingItem]:
    """Itens de um lar num período: transações reais + ocorrências de
    recorrência/parcela que caem no período mas ainda não viraram transação
    (deduplicado por rule_id+data / installment_id+numero, pra não contar 2x
    quando o cron eventualmente materializar).

    Usado por qualquer tela que precise saber "quanto foi gasto/recebido" —
    resumo por categoria/grupo, orçamentos, listagem de lançamentos — pra não
    depender do cron ter rodado numa data específica pra uma conta fixa
    aparecer.
    """
    txn_stmt = select(Transaction).where(
        Transaction.household_id == household_id,
        Transaction.date >= date_from,
        Transaction.date <= date_to,
    )
    if account_id is not None:
        txn_stmt = txn_stmt.where(Transaction.account_id == account_id)
    transactions = list(db.scalars(txn_stmt))
    items: list[SpendingItem] = [
        SpendingItem(
            date=t.date,
            description=t.description,
            amount=t.amount,
            kind=t.kind,
            category_id=t.category_id,
            group_id=t.group_id,
            account_id=t.account_id,
        )
        for t in transactions
    ]

    posted_rule_keys = {(t.recurring_rule_id, t.date) for t in transactions if t.recurring_rule_id}
    posted_installment_keys = {
        (t.installment_id, t.installment_number) for t in transactions if t.installment_id
    }

    rule_stmt = select(RecurringRule).where(RecurringRule.household_id == household_id)
    if account_id is not None:
        rule_stmt = rule_stmt.where(RecurringRule.account_id == account_id)
    rules = db.scalars(rule_stmt)
    for rule in rules:
        for occurrence_date in occurrences_for_rule(rule, date_from, date_to):
            if (rule.id, occurrence_date) in posted_rule_keys:
                continue
            items.append(
                SpendingItem(
                    date=occurrence_date,
                    description=rule.description,
                    amount=rule.amount,
                    kind=rule.kind,
                    category_id=rule.category_id,
                    group_id=None,
                    account_id=rule.account_id,
                )
            )

    installment_stmt = select(Installment).where(Installment.household_id == household_id)
    if account_id is not None:
        installment_stmt = installment_stmt.where(Installment.account_id == account_id)
    installments = db.scalars(installment_stmt)
    for installment in installments:
        for occurrence_date, number in occurrences_for_installment(installment, date_from, date_to):
            if (installment.id, number) in posted_installment_keys:
                continue
            items.append(
                SpendingItem(
                    date=occurrence_date,
                    description=f"{installment.description} ({number}/{installment.installment_count})",
                    amount=installment.installment_amount,
                    kind=TransactionKind.expense,
                    category_id=installment.category_id,
                    group_id=None,
                    account_id=installment.account_id,
                )
            )

    return items
