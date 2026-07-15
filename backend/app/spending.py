import calendar as calendar_module
from datetime import date
from decimal import Decimal
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Installment, RecurringRule, Transaction, TransactionKind
from app.recurrence import occurrences_for_installment, occurrences_for_rule


def next_due_date(purchase_date: date, due_day: int) -> date:
    """Data de vencimento da fatura em que uma compra de cartão de crédito
    cai: o próximo dia `due_day` a partir da data da compra (compra até o
    dia due_day vence no mesmo mês; depois disso, vence só no mês seguinte).
    Não há um dia de fechamento separado modelado, então essa é a aproximação
    usada pra decidir em qual fatura uma compra entra.
    """
    year, month = purchase_date.year, purchase_date.month
    if purchase_date.day > due_day:
        month += 1
        if month > 12:
            month = 1
            year += 1
    last_day = calendar_module.monthrange(year, month)[1]
    return date(year, month, min(due_day, last_day))


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
    # Ocorrência projetada de recorrência/parcela ainda não materializada
    # nasce sempre não paga, igual no Calendário -- só uma transação real
    # carrega o status verdadeiro.
    paid: bool


def household_items_in_range(
    db: Session,
    household_id: int,
    date_from: date,
    date_to: date,
    account_id: int | None = None,
    category_id: int | None = None,
    group_id: int | None = None,
) -> list[SpendingItem]:
    """Itens de um lar num período: transações reais + ocorrências de
    recorrência/parcela que caem no período mas ainda não viraram transação
    (deduplicado por rule_id+data / installment_id+numero, pra não contar 2x
    quando o cron eventualmente materializar).

    Usado por qualquer tela que precise saber "quanto foi gasto/recebido" —
    resumo por categoria/grupo, orçamentos, listagem de lançamentos — pra não
    depender do cron ter rodado numa data específica pra uma conta fixa
    aparecer.

    Os filtros de conta/categoria/grupo são aplicados em Python (não na
    query) sobre o conjunto completo de transações do período: a
    deduplicação de recorrência/parcela materializada precisa enxergar TODAS
    as transações já lançadas, mesmo as que um filtro esconde da listagem
    final -- senão a ocorrência projetada correspondente reapareceria
    duplicada.
    """
    all_transactions = list(
        db.scalars(
            select(Transaction).where(
                Transaction.household_id == household_id,
                Transaction.date >= date_from,
                Transaction.date <= date_to,
            )
        )
    )

    def transaction_matches(t: Transaction) -> bool:
        if account_id is not None and t.account_id != account_id:
            return False
        if category_id is not None and t.category_id != category_id:
            return False
        if group_id is not None and t.group_id != group_id:
            return False
        return True

    items: list[SpendingItem] = [
        SpendingItem(
            date=t.date,
            description=t.description,
            amount=t.amount,
            kind=t.kind,
            category_id=t.category_id,
            group_id=t.group_id,
            account_id=t.account_id,
            paid=t.paid,
        )
        for t in all_transactions
        if transaction_matches(t)
    ]

    posted_rule_keys = {(t.recurring_rule_id, t.date) for t in all_transactions if t.recurring_rule_id}
    posted_installment_keys = {
        (t.installment_id, t.installment_number) for t in all_transactions if t.installment_id
    }

    # Ocorrências projetadas nunca têm grupo (só lançamento manual/importado
    # tem), então um filtro de grupo específico nunca pode incluí-las.
    if group_id is None:
        rules = db.scalars(select(RecurringRule).where(RecurringRule.household_id == household_id))
        for rule in rules:
            if account_id is not None and rule.account_id != account_id:
                continue
            if category_id is not None and rule.category_id != category_id:
                continue
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
                        paid=False,
                    )
                )

        installments = db.scalars(select(Installment).where(Installment.household_id == household_id))
        for installment in installments:
            if account_id is not None and installment.account_id != account_id:
                continue
            if category_id is not None and installment.category_id != category_id:
                continue
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
                        paid=False,
                    )
                )

    return items
