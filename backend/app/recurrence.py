import calendar
from datetime import date, timedelta

from app.models import Installment, RecurrenceFrequency, RecurringRule


def _clamp_day(year: int, month: int, day: int) -> int:
    last_day = calendar.monthrange(year, month)[1]
    return min(day, last_day)


def _add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = _clamp_day(year, month, d.day)
    return date(year, month, day)


def occurrences_for_rule(rule: RecurringRule, range_start: date, range_end: date) -> list[date]:
    """Datas em que a regra recorrente cai dentro de [range_start, range_end]."""
    effective_end = min(range_end, rule.end_date) if rule.end_date else range_end
    if effective_end < range_start or rule.start_date > effective_end:
        return []

    occurrences: list[date] = []

    if rule.frequency == RecurrenceFrequency.monthly:
        day = rule.day_of_month or rule.start_date.day
        cursor = date(range_start.year, range_start.month, _clamp_day(range_start.year, range_start.month, day))
        if cursor < range_start:
            cursor = _add_months(cursor, 1)
        while cursor <= effective_end:
            if cursor >= rule.start_date:
                occurrences.append(cursor)
            cursor = _add_months(cursor, 1)

    elif rule.frequency == RecurrenceFrequency.weekly:
        weekday = rule.weekday if rule.weekday is not None else rule.start_date.weekday()
        offset = (weekday - range_start.weekday()) % 7
        cursor = range_start + timedelta(days=offset)
        while cursor <= effective_end:
            if cursor >= rule.start_date:
                occurrences.append(cursor)
            cursor += timedelta(days=7)

    return occurrences


def occurrences_for_installment(
    installment: Installment, range_start: date, range_end: date
) -> list[tuple[date, int]]:
    """Retorna (data, numero_da_parcela) para parcelas dentro de [range_start, range_end]."""
    occurrences: list[tuple[date, int]] = []
    for n in range(installment.installment_count):
        due_date = _add_months(installment.start_date, n)
        if range_start <= due_date <= range_end:
            occurrences.append((due_date, n + 1))
    return occurrences
