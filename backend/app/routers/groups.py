from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Transaction, TransactionGroup, TransactionKind, User
from app.schemas import TransactionGroupCreate, TransactionGroupOut, TransactionGroupUpdate

router = APIRouter(prefix="/groups", tags=["groups"])


def _pending_amounts(db: Session, household_id: int) -> dict[int, Decimal]:
    """Soma das despesas ainda não pagas de cada grupo do lar -- quanto falta
    pagar de cada fatura agora, usada tanto na listagem quanto depois de uma
    ação de pagar fatura pra devolver o valor atualizado (deve zerar)."""
    rows = db.execute(
        select(Transaction.group_id, Transaction.amount).where(
            Transaction.household_id == household_id,
            Transaction.group_id.is_not(None),
            Transaction.kind == TransactionKind.expense,
            Transaction.paid.is_(False),
        )
    )
    totals: dict[int, Decimal] = {}
    for group_id, amount in rows:
        totals[group_id] = totals.get(group_id, Decimal(0)) + amount
    return totals


def _to_out(group: TransactionGroup, pending: Decimal) -> TransactionGroupOut:
    return TransactionGroupOut(
        id=group.id,
        name=group.name,
        is_credit_card=group.is_credit_card,
        due_day=group.due_day,
        pending_amount=pending,
    )


@router.get("", response_model=list[TransactionGroupOut])
def list_groups(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[TransactionGroupOut]:
    groups = list(
        db.scalars(
            select(TransactionGroup)
            .where(TransactionGroup.household_id == user.household_id)
            .order_by(TransactionGroup.name)
        )
    )
    pending = _pending_amounts(db, user.household_id)
    return [_to_out(g, pending.get(g.id, Decimal(0))) for g in groups]


@router.post("", response_model=TransactionGroupOut, status_code=status.HTTP_201_CREATED)
def create_group(
    payload: TransactionGroupCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TransactionGroupOut:
    group = TransactionGroup(
        household_id=user.household_id,
        user_id=user.id,
        name=payload.name,
        is_credit_card=payload.is_credit_card,
        due_day=payload.due_day,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return _to_out(group, Decimal(0))


@router.patch("/{group_id}", response_model=TransactionGroupOut)
def update_group(
    group_id: int,
    payload: TransactionGroupUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TransactionGroupOut:
    group = db.get(TransactionGroup, group_id)
    if group is None or group.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grupo não encontrado")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(group, field, value)

    db.commit()
    db.refresh(group)
    pending = _pending_amounts(db, user.household_id)
    return _to_out(group, pending.get(group.id, Decimal(0)))


@router.post("/{group_id}/pay", response_model=TransactionGroupOut)
def pay_group(
    group_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TransactionGroupOut:
    """Marca de uma vez todas as despesas em aberto do grupo como pagas --
    o equivalente a pagar a fatura inteira, sem precisar marcar compra por
    compra. Não mexe em receitas nem em despesas que já estavam pagas."""
    group = db.get(TransactionGroup, group_id)
    if group is None or group.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grupo não encontrado")

    db.execute(
        update(Transaction)
        .where(
            Transaction.household_id == user.household_id,
            Transaction.group_id == group_id,
            Transaction.kind == TransactionKind.expense,
            Transaction.paid.is_(False),
        )
        .values(paid=True)
    )
    db.commit()
    return _to_out(group, Decimal(0))


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    group = db.get(TransactionGroup, group_id)
    if group is None or group.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grupo não encontrado")
    db.delete(group)
    db.commit()
