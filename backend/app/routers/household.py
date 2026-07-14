from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.invite_codes import new_invite_code
from app.models import Household, User
from app.schemas import HouseholdJoin, HouseholdOut, HouseholdRename

router = APIRouter(prefix="/household", tags=["household"])


def _to_out(household: Household, db: Session) -> HouseholdOut:
    members = list(db.scalars(select(User).where(User.household_id == household.id)))
    return HouseholdOut(
        id=household.id, name=household.name, invite_code=household.invite_code, members=members
    )


@router.get("/me", response_model=HouseholdOut)
def get_my_household(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> HouseholdOut:
    household = db.get(Household, user.household_id)
    return _to_out(household, db)


@router.patch("/me", response_model=HouseholdOut)
def rename_household(
    payload: HouseholdRename,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HouseholdOut:
    household = db.get(Household, user.household_id)
    household.name = payload.name
    db.commit()
    db.refresh(household)
    return _to_out(household, db)


@router.post("/me/regenerate-invite", response_model=HouseholdOut)
def regenerate_invite(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> HouseholdOut:
    household = db.get(Household, user.household_id)
    household.invite_code = new_invite_code()
    db.commit()
    db.refresh(household)
    return _to_out(household, db)


@router.post("/join", response_model=HouseholdOut)
def join_household(
    payload: HouseholdJoin,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HouseholdOut:
    household = db.scalar(select(Household).where(Household.invite_code == payload.invite_code.upper()))
    if household is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Código de convite inválido")

    user.household_id = household.id
    db.commit()
    db.refresh(household)
    return _to_out(household, db)
