import csv
import io
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

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
    signed_amounts: bool = Query(default=True),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ImportResult:
    mapping = ImportColumnMapping(
        date_column=date_column,
        description_column=description_column,
        amount_column=amount_column,
        date_format=date_format,
        signed_amounts=signed_amounts,
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
            f"Colunas não encontradas no CSV: {', '.join(sorted(missing))}",
        )

    batch = ImportBatch(
        user_id=user.id, filename=file.filename or "extrato.csv", status=ImportStatus.processing
    )
    db.add(batch)
    db.flush()

    row_count = 0
    for row_number, row in enumerate(reader, start=2):
        raw_date = row[mapping.date_column].strip()
        raw_amount = row[mapping.amount_column].strip().replace(".", "").replace(",", ".")
        description = row[mapping.description_column].strip()

        try:
            parsed_date = datetime.strptime(raw_date, mapping.date_format).date()
        except ValueError as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Data inválida na linha {row_number}: '{raw_date}'",
            ) from exc

        try:
            parsed_amount = Decimal(raw_amount)
        except InvalidOperation as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Valor inválido na linha {row_number}: '{raw_amount}'",
            ) from exc

        if mapping.signed_amounts:
            kind = TransactionKind.income if parsed_amount >= 0 else TransactionKind.expense
            amount = abs(parsed_amount)
        else:
            kind = TransactionKind.expense
            amount = abs(parsed_amount)

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

    return ImportResult(import_id=batch.id, row_count=row_count, status=batch.status)
