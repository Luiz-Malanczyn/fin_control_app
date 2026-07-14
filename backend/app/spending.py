from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Installment, RecurringRule, Transaction, TransactionKind
from app.recurrence import occurrences_for_installment, occurrences_for_rule

# (valor, tipo, categoria, grupo) -- recorrências/parcelas projetadas não têm
# grupo (esse campo só existe em lançamentos manuais/importados), por isso
# vem sempre None nesses casos.
SpendingItem = tuple[Decimal, TransactionKind, int | None, int | None]


def household_items_in_range(
    db: Session,
    household_id: int,
    date_from: date,
    date_to: date,
    account_id: int | None = None,
) -> list[SpendingItem]:
    """Itens (valor, tipo, categoria, grupo) de um lar num período: transações
    reais + ocorrências de recorrência/parcela que caem no período mas ainda
    não viraram transação (deduplicado por rule_id+data / installment_id+numero,
    pra não contar 2x quando o cron eventualmente materializar).

    Usado por qualquer tela que precise saber "quanto foi gasto/recebido" —
    resumo por categoria/grupo, orçamentos — pra não depender do cron ter
    rodado numa data específica pra uma conta fixa aparecer.
    """
    txn_stmt = select(Transaction).where(
        Transaction.household_id == household_id,
        Transaction.date >= date_from,
        Transaction.date <= date_to,
    )
    if account_id is not None:
        txn_stmt = txn_stmt.where(Transaction.account_id == account_id)
    transactions = list(db.scalars(txn_stmt))
    items: list[SpendingItem] = [(t.amount, t.kind, t.category_id, t.group_id) for t in transactions]

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
            items.append((rule.amount, rule.kind, rule.category_id, None))

    installment_stmt = select(Installment).where(Installment.household_id == household_id)
    if account_id is not None:
        installment_stmt = installment_stmt.where(Installment.account_id == account_id)
    installments = db.scalars(installment_stmt)
    for installment in installments:
        for occurrence_date, number in occurrences_for_installment(installment, date_from, date_to):
            if (installment.id, number) in posted_installment_keys:
                continue
            items.append(
                (installment.installment_amount, TransactionKind.expense, installment.category_id, None)
            )

    return items
