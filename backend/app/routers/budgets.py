from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Budget, Category, TransactionKind, User
from app.routers.dashboard import _month_bounds
from app.schemas import BudgetCreate, BudgetOut
from app.spending import household_items_in_range

router = APIRouter(prefix="/budgets", tags=["budgets"])


def _spent_by_category_this_month(db: Session, household_id: int) -> dict[int | None, Decimal]:
    today = date.today()
    month_start, month_end = _month_bounds(today)
    items = household_items_in_range(db, household_id, month_start, month_end)
    totals: dict[int | None, Decimal] = {}
    for item in items:
        if item.kind != TransactionKind.expense:
            continue
        totals[item.category_id] = totals.get(item.category_id, Decimal(0)) + item.amount
    return totals


def _to_out(budget: Budget, category_name: str, spent: Decimal) -> BudgetOut:
    remaining = budget.amount - spent
    percentage = float(spent / budget.amount * 100) if budget.amount else 0.0
    return BudgetOut(
        id=budget.id,
        category_id=budget.category_id,
        category_name=category_name,
        amount=budget.amount,
        spent=spent,
        remaining=remaining,
        percentage=percentage,
    )


@router.get("", response_model=list[BudgetOut])
def list_budgets(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[BudgetOut]:
    budgets = list(db.scalars(select(Budget).where(Budget.household_id == user.household_id)))
    if not budgets:
        return []

    category_ids = [b.category_id for b in budgets]
    categories = {
        c.id: c.name
        for c in db.scalars(select(Category).where(Category.id.in_(category_ids)))
    }

    spent_by_category = _spent_by_category_this_month(db, user.household_id)

    return [
        _to_out(b, categories.get(b.category_id, "Sem categoria"), spent_by_category.get(b.category_id, Decimal(0)))
        for b in budgets
    ]


@router.post("", response_model=BudgetOut, status_code=status.HTTP_201_CREATED)
def upsert_budget(
    payload: BudgetCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BudgetOut:
    category = db.get(Category, payload.category_id)
    if category is None or category.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoria não encontrada")

    budget = db.scalar(
        select(Budget).where(
            Budget.household_id == user.household_id, Budget.category_id == payload.category_id
        )
    )
    if budget is None:
        budget = Budget(household_id=user.household_id, user_id=user.id, category_id=payload.category_id, amount=payload.amount)
        db.add(budget)
    else:
        budget.amount = payload.amount

    db.commit()
    db.refresh(budget)

    spent = _spent_by_category_this_month(db, user.household_id).get(payload.category_id, Decimal(0))
    return _to_out(budget, category.name, spent)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(
    budget_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    budget = db.get(Budget, budget_id)
    if budget is None or budget.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Orçamento não encontrado")
    db.delete(budget)
    db.commit()
