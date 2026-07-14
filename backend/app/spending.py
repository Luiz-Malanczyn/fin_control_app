from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Installment, RecurringRule, Transaction, TransactionKind
from app.recurrence import occurrences_for_installment, occurrences_for_rule

SpendingItem = tuple[Decimal, TransactionKind, int | None]


def household_items_in_range(
    db: Session, household_id: int, date_from: date, date_to: date
) -> list[SpendingItem]:
    """Itens (valor, tipo, categoria) de um lar num período: transações reais
    + ocorrências de recorrência/parcela que caem no período mas ainda não
    viraram transação (deduplicado por rule_id+data / installment_id+numero,
    pra não contar 2x quando o cron eventualmente materializar).

    Usado por qualquer tela que precise saber "quanto foi gasto/recebido" —
    resumo por categoria, orçamentos — pra não depender do cron ter rodado
    numa data específica pra uma conta fixa aparecer.
    """
    transactions = list(
        db.scalars(
            select(Transaction).where(
                Transaction.household_id == household_id,
                Transaction.date >= date_from,
                Transaction.date <= date_to,
            )
        )
    )
    items: list[SpendingItem] = [(t.amount, t.kind, t.category_id) for t in transactions]

    posted_rule_keys = {(t.recurring_rule_id, t.date) for t in transactions if t.recurring_rule_id}
    posted_installment_keys = {
        (t.installment_id, t.installment_number) for t in transactions if t.installment_id
    }

    rules = db.scalars(select(RecurringRule).where(RecurringRule.household_id == household_id))
    for rule in rules:
        for occurrence_date in occurrences_for_rule(rule, date_from, date_to):
            if (rule.id, occurrence_date) in posted_rule_keys:
                continue
            items.append((rule.amount, rule.kind, rule.category_id))

    installments = db.scalars(select(Installment).where(Installment.household_id == household_id))
    for installment in installments:
        for occurrence_date, number in occurrences_for_installment(installment, date_from, date_to):
            if (installment.id, number) in posted_installment_keys:
                continue
            items.append((installment.installment_amount, TransactionKind.expense, installment.category_id))

    return items
