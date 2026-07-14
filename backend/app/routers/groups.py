from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import TransactionGroup, User
from app.schemas import TransactionGroupCreate, TransactionGroupOut

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("", response_model=list[TransactionGroupOut])
def list_groups(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[TransactionGroup]:
    return list(db.scalars(select(TransactionGroup).where(TransactionGroup.user_id == user.id)))


@router.post("", response_model=TransactionGroupOut, status_code=status.HTTP_201_CREATED)
def create_group(
    payload: TransactionGroupCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TransactionGroup:
    group = TransactionGroup(user_id=user.id, name=payload.name)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    group = db.get(TransactionGroup, group_id)
    if group is None or group.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grupo não encontrado")
    db.delete(group)
    db.commit()
