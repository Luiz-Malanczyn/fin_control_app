from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Account, User
from app.schemas import AccountCreate, AccountOut, AccountUpdate

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountOut])
def list_accounts(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Account]:
    return list(db.scalars(select(Account).where(Account.household_id == user.household_id)))


@router.post("", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def create_account(
    payload: AccountCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Account:
    account = Account(
        household_id=user.household_id,
        user_id=user.id,
        name=payload.name,
        type=payload.type,
        opening_balance=payload.opening_balance,
        opening_balance_date=payload.opening_balance_date,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.patch("/{account_id}", response_model=AccountOut)
def update_account(
    account_id: int,
    payload: AccountUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Account:
    account = db.get(Account, account_id)
    if account is None or account.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(account, field, value)

    db.commit()
    db.refresh(account)
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    account = db.get(Account, account_id)
    if account is None or account.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada")
    db.delete(account)
    db.commit()
