import io
import re
import statistics
from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation

import pdfplumber

from app.csv_import import parse_amount

_DATE_TOKEN = re.compile(r"^\d{1,2}/\d{1,2}$")
_MONEY_TOKEN = re.compile(r"^-?\s?\d{1,3}(?:\.\d{3})*,\d{2}$")
_MONEY_ANYWHERE = re.compile(r"-?\s?\d{1,3}(?:\.\d{3})*,\d{2}\s*$")
_HEADER_DATE_WORD = re.compile(r"^(data|date)$", re.IGNORECASE)

_SKIP_PHRASES = (
    "saldo anterior",
    "saldo total",
    "limite dispon",
    "total para",
    "total da fatura",
    "total desta fatura",
    "subtotal",
)


class PdfParseError(Exception):
    pass


def _looks_like_junk(description: str) -> bool:
    lowered = description.strip().lower()
    if not lowered:
        return True
    return any(phrase in lowered for phrase in _SKIP_PHRASES)


def _date_column_bound(words: list[dict]) -> float:
    for w in words:
        if _HEADER_DATE_WORD.match(w["text"].strip()):
            return w["x1"] + 15
    return 120.0


def _rows_from_rects(page) -> list[tuple[str, str, str]] | None:
    """Usa as linhas finas que separam cada transação na tabela (quando existem)
    pra agrupar palavras em blocos por linha, mesmo quando a descrição quebra
    em 2-3 linhas de texto dentro da mesma linha da tabela."""
    segments_by_top: dict[float, list] = defaultdict(list)
    for r in page.rects:
        height = r["bottom"] - r["top"]
        width = r["x1"] - r["x0"]
        if height < 3 and width > 30:
            segments_by_top[round(r["top"], 1)].append(r)

    # Linhas de separação de linha de tabela costumam ser desenhadas em vários
    # pedaços (um por coluna); uma linha decorativa avulsa é só 1 pedaço.
    tops = sorted(t for t, segs in segments_by_top.items() if len(segs) >= 2)
    if len(tops) < 2:
        return None

    words = page.extract_words()
    date_col_max_x = _date_column_bound(words)

    date_words_in_col = [
        w for w in words if _DATE_TOKEN.match(w["text"]) and w["x0"] < date_col_max_x
    ]
    if date_words_in_col:
        first_row_top = min(w["top"] for w in date_words_in_col)
        if first_row_top < tops[0]:
            tops = [first_row_top - 1] + tops

    row_height = statistics.median(b - a for a, b in zip(tops, tops[1:])) if len(tops) > 1 else 30
    tops = tops + [tops[-1] + row_height]

    rows: list[tuple[str, str, str]] = []
    for top, bottom in zip(tops, tops[1:]):
        band_words = [w for w in words if top <= w["top"] < bottom]
        band_words.sort(key=lambda w: (round(w["top"], 1), w["x0"]))
        if not band_words:
            continue

        date_tok = next(
            (w["text"] for w in band_words if _DATE_TOKEN.match(w["text"]) and w["x0"] < date_col_max_x),
            None,
        )
        money_idx = next(
            (i for i in range(len(band_words) - 1, -1, -1) if _MONEY_TOKEN.match(band_words[i]["text"])),
            None,
        )
        if date_tok is None or money_idx is None:
            continue

        money_tok = band_words[money_idx]["text"]
        desc_words = [
            w["text"]
            for i, w in enumerate(band_words)
            if i != money_idx and not (w["text"] == date_tok and w["x0"] < date_col_max_x)
        ]
        rows.append((date_tok, " ".join(desc_words), money_tok))

    return rows


def _rows_from_text_lines(page) -> list[tuple[str, str, str]]:
    """Alternativa sem depender de linhas de grade: acumula texto até achar um
    valor no fim, tratando qualquer linha antes disso como continuação da
    descrição da transação em aberto."""
    text = page.extract_text() or ""
    rows: list[tuple[str, str, str]] = []
    pending_date: str | None = None
    pending_desc: list[str] = []

    for raw_line in text.split("\n"):
        line = raw_line.strip()
        if not line:
            continue

        date_match = re.match(r"^(\d{1,2}/\d{1,2})\s*(.*)$", line)
        if date_match:
            pending_date = date_match.group(1)
            pending_desc = [date_match.group(2)] if date_match.group(2) else []
        elif pending_date is None:
            continue  # lixo antes/depois da tabela, sem transação em aberto
        else:
            pending_desc.append(line)

        joined = " ".join(p for p in pending_desc if p).strip()
        money_match = _MONEY_ANYWHERE.search(joined)
        if money_match and pending_date is not None:
            money_tok = money_match.group().strip()
            description = joined[: money_match.start()].strip()
            rows.append((pending_date, description, money_tok))
            pending_date = None
            pending_desc = []

    return rows


def _infer_year(day_month: str, statement_year: int, statement_month: int) -> date:
    day, month = (int(part) for part in day_month.split("/"))
    year = statement_year if month <= statement_month else statement_year - 1
    return date(year, month, day)


def _statement_reference_date(full_text: str) -> tuple[int, int]:
    match = re.search(r"(\d{2})/(\d{2})/(\d{4})", full_text)
    if match:
        _, month, year = match.groups()
        return int(year), int(month)
    today = date.today()
    return today.year, today.month


def parse_statement_pdf(file_bytes: bytes) -> list[tuple[date, str, Decimal]]:
    """Extrai (data, descrição, valor_com_sinal) de um extrato em PDF.

    Funciona com extratos tabulares onde cada linha tem data (DD/MM, sem
    ano), descrição e valor à direita, mesmo quando a descrição quebra em
    várias linhas de texto. O ano é inferido a partir da data de emissão do
    extrato (assume que qualquer mês maior que o mês do extrato é do ano
    anterior, já que faturas "em aberto" só olham pra trás no tempo).
    """
    results: list[tuple[date, str, Decimal]] = []

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        if not pdf.pages:
            raise PdfParseError("PDF vazio ou sem páginas legíveis")

        full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        statement_year, statement_month = _statement_reference_date(full_text)

        for page in pdf.pages:
            rows = _rows_from_rects(page)
            if not rows:
                rows = _rows_from_text_lines(page)

            for date_tok, description, money_tok in rows:
                description = re.sub(r"\s+", " ", description).strip()
                if _looks_like_junk(description):
                    continue
                try:
                    parsed_date = _infer_year(date_tok, statement_year, statement_month)
                except ValueError:
                    continue
                try:
                    amount = parse_amount(money_tok)
                except InvalidOperation:
                    continue
                if not description:
                    continue
                results.append((parsed_date, description, amount))

    if not results:
        raise PdfParseError(
            "Não consegui reconhecer nenhuma transação nesse PDF. "
            "O formato pode ser diferente do esperado (data, descrição e valor por linha)."
        )

    return results
