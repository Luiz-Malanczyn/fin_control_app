from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Account, Transaction, TransactionSource, User
from app.schemas import TransactionCreate, TransactionOut, TransactionUpdate

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
    stmt = select(Transaction).where(Transaction.household_id == user.household_id)
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
    if account is None or account.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada")

    transaction = Transaction(
        household_id=user.household_id,
        user_id=user.id,
        account_id=payload.account_id,
        category_id=payload.category_id,
        group_id=payload.group_id,
        date=payload.date,
        description=payload.description,
        amount=payload.amount,
        kind=payload.kind,
        source=TransactionSource.manual,
        paid=True,
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


@router.patch("/{transaction_id}", response_model=TransactionOut)
def update_transaction(
    transaction_id: int,
    payload: TransactionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Transaction:
    transaction = db.get(Transaction, transaction_id)
    if transaction is None or transaction.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transação não encontrada")

    updates = payload.model_dump(exclude_unset=True)
    if "account_id" in updates:
        account = db.get(Account, updates["account_id"])
        if account is None or account.household_id != user.household_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada")

    for field, value in updates.items():
        setattr(transaction, field, value)

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
    if transaction is None or transaction.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transação não encontrada")
    db.delete(transaction)
    db.commit()
