import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app.schemas import AmountConvention

_NON_NUMERIC = re.compile(r"[^0-9,.\-]")


def parse_amount(raw: str) -> Decimal:
    """Aceita tanto '9104.06' (decimal simples) quanto '1.234,56' (formato BR).

    A regra: se houver vírgula, assume formato BR (ponto = milhar, vírgula = decimal).
    Sem vírgula, assume que o ponto já é o separador decimal (como os extratos do
    Nubank exportam, sem separador de milhar).
    """
    cleaned = _NON_NUMERIC.sub("", raw.strip())
    if not cleaned or cleaned in {"-", "."}:
        raise InvalidOperation(f"valor vazio ou inválido: '{raw}'")
    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    return Decimal(cleaned)


def parse_date(raw: str, date_format: str) -> date:
    return datetime.strptime(raw.strip(), date_format).date()


def apply_amount_convention(amount: Decimal, convention: AmountConvention) -> tuple[Decimal, str]:
    """Retorna (valor_absoluto, kind) de acordo com a convenção de sinal do banco."""
    if convention == "income_positive":
        kind = "income" if amount >= 0 else "expense"
    elif convention == "expense_positive":
        kind = "expense" if amount >= 0 else "income"
    else:
        kind = "expense"
    return abs(amount), kind
