import csv
import io
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app.schemas import AmountConvention, ImportColumnMapping

_NON_NUMERIC = re.compile(r"[^0-9,.\-]")


class CsvParseError(Exception):
    pass


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


_DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d/%m/%y", "%m/%d/%y", "%d-%m-%Y", "%Y/%m/%d"]
_DATE_NAME_RE = re.compile(r"data|date", re.IGNORECASE)
_AMOUNT_NAME_RE = re.compile(r"valor|amount|montante|pre[çc]o|price", re.IGNORECASE)
_DESC_NAME_RE = re.compile(r"desc|hist[oó]r|title|memo|lan[çc]amento|estabelecimento", re.IGNORECASE)


def _try_date_format(value: str) -> str | None:
    value = value.strip()
    for fmt in _DATE_FORMATS:
        try:
            datetime.strptime(value, fmt)
            return fmt
        except ValueError:
            continue
    return None


def _looks_numeric(value: str) -> bool:
    try:
        parse_amount(value)
        return True
    except InvalidOperation:
        return False


def _looks_textual(value: str) -> bool:
    return bool(re.search(r"[A-Za-zÀ-ÿ]", value)) and " " in value.strip()


def detect_csv_mapping(fieldnames: list[str], sample_rows: list[dict]) -> dict:
    """Adivinha qual coluna do CSV é data/descrição/valor.

    Primeiro tenta pelo nome do cabeçalho (Data, Valor, Descrição, date,
    amount, title...); se não achar, analisa o conteúdo das primeiras linhas
    (qual coluna sempre parece uma data, qual sempre parece um número). A
    coluna de descrição prefere texto com espaços a colunas tipo
    identificador/UUID que sobrarem.
    """
    date_col = next((c for c in fieldnames if _DATE_NAME_RE.search(c)), None)
    amount_col = next((c for c in fieldnames if c != date_col and _AMOUNT_NAME_RE.search(c)), None)
    desc_col = next(
        (c for c in fieldnames if c not in (date_col, amount_col) and _DESC_NAME_RE.search(c)), None
    )

    if date_col is None:
        for col in fieldnames:
            values = [row.get(col, "").strip() for row in sample_rows if row.get(col, "").strip()]
            if values and all(_try_date_format(v) for v in values[:5]):
                date_col = col
                break

    if amount_col is None:
        for col in fieldnames:
            if col == date_col:
                continue
            values = [row.get(col, "").strip() for row in sample_rows if row.get(col, "").strip()]
            if values and all(_looks_numeric(v) for v in values[:5]):
                amount_col = col
                break

    if desc_col is None:
        candidates = [c for c in fieldnames if c not in (date_col, amount_col)]
        scored = []
        for col in candidates:
            values = [row.get(col, "").strip() for row in sample_rows if row.get(col, "").strip()]
            score = sum(1 for v in values if _looks_textual(v))
            scored.append((score, col))
        scored.sort(key=lambda item: item[0], reverse=True)
        desc_col = scored[0][1] if scored else (candidates[0] if candidates else fieldnames[0] if fieldnames else "")

    date_format = "%Y-%m-%d"
    if date_col:
        for row in sample_rows:
            value = row.get(date_col, "").strip()
            if value:
                fmt = _try_date_format(value)
                if fmt:
                    date_format = fmt
                    break

    amount_convention: AmountConvention = "income_positive"
    if desc_col and desc_col.strip().lower() in ("title", "estabelecimento"):
        amount_convention = "expense_positive"

    return {
        "date_column": date_col or (fieldnames[0] if fieldnames else ""),
        "description_column": desc_col or (fieldnames[0] if fieldnames else ""),
        "amount_column": amount_col or (fieldnames[-1] if fieldnames else ""),
        "date_format": date_format,
        "amount_convention": amount_convention,
    }


def read_csv_dicts(file_bytes: bytes) -> tuple[list[str], list[dict]]:
    raw = file_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))
    if reader.fieldnames is None:
        raise CsvParseError("Arquivo CSV vazio ou inválido")
    return list(reader.fieldnames), list(reader)


def parse_csv_rows(
    fieldnames: list[str], dict_rows: list[dict], mapping: ImportColumnMapping
) -> tuple[list[tuple[date, str, Decimal]], list[str]]:
    """Aplica um mapeamento de colunas às linhas já lidas do CSV, devolvendo
    (data, descrição, valor com sinal original) + mensagens de erro por linha
    problemática (sem abortar o resto do arquivo)."""
    required = {mapping.date_column, mapping.description_column, mapping.amount_column}
    missing = required - set(fieldnames)
    if missing:
        raise CsvParseError(
            f"Colunas não encontradas no CSV: {', '.join(sorted(missing))}. "
            f"Colunas disponíveis: {', '.join(fieldnames)}"
        )

    rows: list[tuple[date, str, Decimal]] = []
    errors: list[str] = []

    for row_number, row in enumerate(dict_rows, start=2):
        raw_date = (row.get(mapping.date_column) or "").strip()
        raw_amount = (row.get(mapping.amount_column) or "").strip()
        description = (row.get(mapping.description_column) or "").strip()

        if not raw_date and not raw_amount and not description:
            continue  # linha em branco (comum no fim de exports do Nubank)

        try:
            parsed_date = parse_date(raw_date, mapping.date_format)
            parsed_amount = parse_amount(raw_amount)
        except (ValueError, InvalidOperation) as exc:
            errors.append(f"Linha {row_number}: {exc}")
            continue

        rows.append((parsed_date, description, parsed_amount))

    return rows, errors
