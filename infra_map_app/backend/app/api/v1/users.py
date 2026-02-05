"""User API endpoints."""
from fastapi import APIRouter, Query
from sqlalchemy import desc, func, select

from app.api.deps import CurrentUser, DbSession
from app.db.models import User
from app.schemas.user import UserRanking, UserResponse, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: CurrentUser,
) -> User:
    """Get current user information."""
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_current_user(
    user_data: UserUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> User:
    """Update current user information."""
    from app.core.security import get_password_hash

    if user_data.username is not None:
        current_user.username = user_data.username
    if user_data.email is not None:
        current_user.email = user_data.email
    if user_data.password is not None:
        current_user.password_hash = get_password_hash(user_data.password)

    await db.commit()
    await db.refresh(current_user)

    return current_user


@router.get("/ranking", response_model=list[UserRanking])
async def get_user_ranking(
    db: DbSession,
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[dict]:
    """Get user contribution ranking."""
    # Query users ordered by contribution points
    result = await db.execute(
        select(User)
        .where(User.is_active == True)
        .order_by(desc(User.contribution_points))
        .offset(offset)
        .limit(limit)
    )
    users = result.scalars().all()

    # Build ranking response
    rankings = [
        {
            "rank": offset + idx + 1,
            "user_id": user.id,
            "username": user.username,
            "contribution_points": user.contribution_points,
        }
        for idx, user in enumerate(users)
    ]

    return rankings


@router.get("/stats")
async def get_user_stats(
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    """Get detailed statistics for current user."""
    from app.db.models import CaptureSession, InfrastructurePoint, Verification

    # Get total points reported
    points_result = await db.execute(
        select(func.count())
        .select_from(InfrastructurePoint)
        .where(InfrastructurePoint.reported_by == current_user.id)
    )
    total_points = points_result.scalar()

    # Get verified points
    verified_result = await db.execute(
        select(func.count())
        .select_from(InfrastructurePoint)
        .where(
            InfrastructurePoint.reported_by == current_user.id,
            InfrastructurePoint.status == "verified",
        )
    )
    verified_points = verified_result.scalar()

    # Get total verifications made
    verifications_result = await db.execute(
        select(func.count())
        .select_from(Verification)
        .where(Verification.user_id == current_user.id)
    )
    total_verifications = verifications_result.scalar()

    # Get total sessions
    sessions_result = await db.execute(
        select(func.count())
        .select_from(CaptureSession)
        .where(CaptureSession.user_id == current_user.id)
    )
    total_sessions = sessions_result.scalar()

    # Get user rank
    rank_result = await db.execute(
        select(func.count())
        .select_from(User)
        .where(User.contribution_points > current_user.contribution_points)
    )
    rank = rank_result.scalar() + 1

    return {
        "contribution_points": current_user.contribution_points,
        "rank": rank,
        "total_points_reported": total_points,
        "verified_points": verified_points,
        "total_verifications": total_verifications,
        "total_sessions": total_sessions,
        "member_since": current_user.created_at.isoformat(),
    }
