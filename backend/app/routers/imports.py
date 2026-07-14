from collections import Counter
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.csv_import import (
    CsvParseError,
    apply_amount_convention,
    detect_csv_mapping,
    parse_csv_rows,
    read_csv_dicts,
)
from app.database import get_db
from app.deps import get_current_user
from app.models import Account, ImportBatch, ImportStatus, Transaction, TransactionKind, TransactionSource, User
from app.pdf_import import PdfParseError, parse_statement_pdf
from app.schemas import (
    AmountConvention,
    ImportColumnMapping,
    ImportPreview,
    ImportPreviewRow,
    ImportResult,
)

router = APIRouter(prefix="/transactions/import", tags=["imports"])

_PREVIEW_LIMIT = 30


def _is_pdf(filename: str | None, content_type: str | None) -> bool:
    if content_type == "application/pdf":
        return True
    return bool(filename) and filename.lower().endswith(".pdf")


def _rows_from_csv(
    file_bytes: bytes,
    date_column: str | None,
    description_column: str | None,
    amount_column: str | None,
    date_format: str | None,
    amount_convention: AmountConvention | None,
) -> tuple[list[str] | None, ImportColumnMapping, list[tuple[date, str, Decimal]], list[str]]:
    fieldnames, dict_rows = read_csv_dicts(file_bytes)
    detected = detect_csv_mapping(fieldnames, dict_rows[:20])
    mapping = ImportColumnMapping(
        date_column=date_column or detected["date_column"],
        description_column=description_column or detected["description_column"],
        amount_column=amount_column or detected["amount_column"],
        date_format=date_format or detected["date_format"],
        amount_convention=amount_convention or detected["amount_convention"],
    )
    rows, errors = parse_csv_rows(fieldnames, dict_rows, mapping)
    return fieldnames, mapping, rows, errors


@router.post("/detect", response_model=ImportPreview)
def detect_import(
    file: UploadFile = File(...),
    date_column: str | None = Query(default=None),
    description_column: str | None = Query(default=None),
    amount_column: str | None = Query(default=None),
    date_format: str | None = Query(default=None),
    amount_convention: AmountConvention | None = Query(default=None),
    user: User = Depends(get_current_user),
) -> ImportPreview:
    file_bytes = file.file.read()

    if _is_pdf(file.filename, file.content_type):
        convention = amount_convention or "expense_positive"
        try:
            raw_rows = parse_statement_pdf(file_bytes)
        except PdfParseError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
        mapping = ImportColumnMapping(amount_convention=convention)
        preview_rows = _build_preview_rows(raw_rows, convention)
        return ImportPreview(
            file_type="pdf",
            columns=None,
            mapping=mapping,
            rows=preview_rows[:_PREVIEW_LIMIT],
            row_count=len(raw_rows),
            errors=[],
        )

    try:
        columns, mapping, raw_rows, errors = _rows_from_csv(
            file_bytes, date_column, description_column, amount_column, date_format, amount_convention
        )
    except CsvParseError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    preview_rows = _build_preview_rows(raw_rows, mapping.amount_convention)
    return ImportPreview(
        file_type="csv",
        columns=columns,
        mapping=mapping,
        rows=preview_rows[:_PREVIEW_LIMIT],
        row_count=len(raw_rows),
        errors=errors[:_PREVIEW_LIMIT],
    )


def _build_preview_rows(
    raw_rows: list[tuple[date, str, Decimal]], convention: AmountConvention
) -> list[ImportPreviewRow]:
    preview = []
    for parsed_date, description, signed_amount in raw_rows[:_PREVIEW_LIMIT]:
        amount, kind_value = apply_amount_convention(signed_amount, convention)
        preview.append(
            ImportPreviewRow(date=parsed_date, description=description, amount=amount, kind=TransactionKind(kind_value))
        )
    return preview


@router.post("", response_model=ImportResult, status_code=status.HTTP_201_CREATED)
def import_transactions(
    account_id: int,
    file: UploadFile = File(...),
    date_column: str | None = Query(default=None),
    description_column: str | None = Query(default=None),
    amount_column: str | None = Query(default=None),
    date_format: str | None = Query(default=None),
    amount_convention: AmountConvention = Query(default="income_positive"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ImportResult:
    account = db.get(Account, account_id)
    if account is None or account.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada")

    file_bytes = file.file.read()

    if _is_pdf(file.filename, file.content_type):
        try:
            raw_rows = parse_statement_pdf(file_bytes)
        except PdfParseError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
        parse_errors: list[str] = []
    else:
        try:
            _, _, raw_rows, parse_errors = _rows_from_csv(
                file_bytes, date_column, description_column, amount_column, date_format, amount_convention
            )
        except CsvParseError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    return _commit_rows(db, user, account_id, file.filename, raw_rows, amount_convention, parse_errors)


def _commit_rows(
    db: Session,
    user: User,
    account_id: int,
    filename: str | None,
    raw_rows: list[tuple[date, str, Decimal]],
    amount_convention: AmountConvention,
    parse_errors: list[str],
) -> ImportResult:
    # Quantas vezes cada (data, descrição, valor, tipo) já foi lançada nessa conta,
    # pra não duplicar quando extratos se sobrepõem (ex: fatura mensal + extrato
    # consolidado cobrindo o mesmo período). Usa contagem, não presença: duas
    # transações genuinamente iguais no mesmo dia (ex: dois Pix idênticos de R$3
    # para o mesmo destinatário) não podem virar uma só.
    existing_counts: Counter[tuple] = Counter(
        (t.date, t.description, t.amount, t.kind)
        for t in db.scalars(
            select(Transaction).where(
                Transaction.household_id == user.household_id, Transaction.account_id == account_id
            )
        )
    )
    seen_counts: Counter[tuple] = Counter()

    batch = ImportBatch(
        household_id=user.household_id,
        user_id=user.id,
        filename=filename or "extrato",
        status=ImportStatus.processing,
    )
    db.add(batch)
    db.flush()

    row_count = 0
    skipped_duplicates = 0

    for parsed_date, description, signed_amount in raw_rows:
        amount, kind_value = apply_amount_convention(signed_amount, amount_convention)
        kind = TransactionKind(kind_value)

        key = (parsed_date, description, amount, kind)
        seen_counts[key] += 1
        if seen_counts[key] <= existing_counts[key]:
            skipped_duplicates += 1
            continue

        db.add(
            Transaction(
                household_id=user.household_id,
                user_id=user.id,
                account_id=account_id,
                date=parsed_date,
                description=description,
                amount=amount,
                kind=kind,
                source=TransactionSource.import_,
                import_batch_id=batch.id,
            )
        )
        row_count += 1

    batch.row_count = row_count
    batch.status = ImportStatus.done
    db.commit()

    return ImportResult(
        import_id=batch.id,
        row_count=row_count,
        skipped_duplicates=skipped_duplicates,
        errors=parse_errors,
        status=batch.status,
    )
