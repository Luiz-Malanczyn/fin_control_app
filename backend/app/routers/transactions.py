import csv
import io
from collections import Counter
from datetime import date
from decimal import InvalidOperation

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.csv_import import apply_amount_convention, parse_amount, parse_date
from app.database import get_db
from app.deps import get_current_user
from app.models import (
    Account,
    ImportBatch,
    ImportStatus,
    Transaction,
    TransactionKind,
    TransactionSource,
    User,
)
from app.schemas import (
    AmountConvention,
    ImportColumnMapping,
    ImportResult,
    TransactionCreate,
    TransactionOut,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=list[TransactionOut])
def list_transactions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    category_id: int | None = Query(default=None),
    group_id: int | None = Query(default=None),
    account_id: int | None = Query(default=None),
) -> list[Transaction]:
    stmt = select(Transaction).where(Transaction.user_id == user.id)
    if date_from is not None:
        stmt = stmt.where(Transaction.date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Transaction.date <= date_to)
    if category_id is not None:
        stmt = stmt.where(Transaction.category_id == category_id)
    if group_id is not None:
        stmt = stmt.where(Transaction.group_id == group_id)
    if account_id is not None:
        stmt = stmt.where(Transaction.account_id == account_id)
    stmt = stmt.order_by(Transaction.date.desc())
    return list(db.scalars(stmt))


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: TransactionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Transaction:
    account = db.get(Account, payload.account_id)
    if account is None or account.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada")

    transaction = Transaction(
        user_id=user.id,
        account_id=payload.account_id,
        category_id=payload.category_id,
        group_id=payload.group_id,
        date=payload.date,
        description=payload.description,
        amount=payload.amount,
        kind=payload.kind,
        source=TransactionSource.manual,
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    transaction = db.get(Transaction, transaction_id)
    if transaction is None or transaction.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transação não encontrada")
    db.delete(transaction)
    db.commit()


@router.post("/import", response_model=ImportResult, status_code=status.HTTP_201_CREATED)
def import_transactions(
    account_id: int,
    file: UploadFile = File(...),
    date_column: str = Query(default="date"),
    description_column: str = Query(default="description"),
    amount_column: str = Query(default="amount"),
    date_format: str = Query(default="%Y-%m-%d"),
    amount_convention: AmountConvention = Query(default="income_positive"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ImportResult:
    mapping = ImportColumnMapping(
        date_column=date_column,
        description_column=description_column,
        amount_column=amount_column,
        date_format=date_format,
        amount_convention=amount_convention,
    )
    account = db.get(Account, account_id)
    if account is None or account.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada")

    raw = file.file.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))
    if reader.fieldnames is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Arquivo CSV vazio ou inválido")

    required = {mapping.date_column, mapping.description_column, mapping.amount_column}
    missing = required - set(reader.fieldnames)
    if missing:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Colunas não encontradas no CSV: {', '.join(sorted(missing))}. "
            f"Colunas disponíveis: {', '.join(reader.fieldnames)}",
        )

    # Quantas vezes cada (data, descrição, valor, tipo) já foi lançada nessa conta,
    # pra não duplicar quando extratos se sobrepõem (ex: fatura mensal + extrato
    # consolidado cobrindo o mesmo período). Usa contagem, não presença: duas
    # transações genuinamente iguais no mesmo dia (ex: dois Pix idênticos de R$3
    # para o mesmo destinatário) não podem virar uma só.
    existing_counts: Counter[tuple] = Counter(
        (t.date, t.description, t.amount, t.kind)
        for t in db.scalars(
            select(Transaction).where(
                Transaction.user_id == user.id, Transaction.account_id == account_id
            )
        )
    )
    seen_counts: Counter[tuple] = Counter()

    batch = ImportBatch(
        user_id=user.id, filename=file.filename or "extrato.csv", status=ImportStatus.processing
    )
    db.add(batch)
    db.flush()

    row_count = 0
    skipped_duplicates = 0
    errors: list[str] = []

    for row_number, row in enumerate(reader, start=2):
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

        amount, kind_value = apply_amount_convention(parsed_amount, mapping.amount_convention)
        kind = TransactionKind(kind_value)

        key = (parsed_date, description, amount, kind)
        seen_counts[key] += 1
        if seen_counts[key] <= existing_counts[key]:
            skipped_duplicates += 1
            continue

        db.add(
            Transaction(
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
        errors=errors,
        status=batch.status,
    )
