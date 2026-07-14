from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Category, User
from app.schemas import CategoryCreate, CategoryOut

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Category]:
    return list(db.scalars(select(Category).where(Category.household_id == user.household_id)))


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Category:
    if payload.parent_id is not None:
        parent = db.get(Category, payload.parent_id)
        if parent is None or parent.household_id != user.household_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoria pai não encontrada")

    category = Category(
        household_id=user.household_id,
        user_id=user.id,
        name=payload.name,
        parent_id=payload.parent_id,
        color=payload.color,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    category = db.get(Category, category_id)
    if category is None or category.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoria não encontrada")
    db.delete(category)
    db.commit()
