"""Capture session API endpoints."""
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from geoalchemy2.functions import ST_GeogFromText, ST_MakeLine
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.db.models import CaptureSession, InfrastructurePoint

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def start_session(
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    """Start a new capture session."""
    session = CaptureSession(
        user_id=current_user.id,
        start_time=datetime.utcnow(),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return {
        "id": session.id,
        "user_id": session.user_id,
        "start_time": session.start_time.isoformat(),
        "points_detected": 0,
    }


@router.patch("/{session_id}")
async def update_session(
    session_id: UUID,
    end_session: bool = False,
    db: DbSession = None,
    current_user: CurrentUser = None,
) -> dict:
    """Update a capture session."""
    result = await db.execute(
        select(CaptureSession).where(
            CaptureSession.id == session_id,
            CaptureSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    if end_session:
        session.end_time = datetime.utcnow()

    # Count points detected in this session
    points_result = await db.execute(
        select(InfrastructurePoint).where(
            InfrastructurePoint.session_id == session_id
        )
    )
    points = points_result.scalars().all()
    session.points_detected = len(points)

    await db.commit()
    await db.refresh(session)

    return {
        "id": session.id,
        "user_id": session.user_id,
        "start_time": session.start_time.isoformat(),
        "end_time": session.end_time.isoformat() if session.end_time else None,
        "points_detected": session.points_detected,
    }


@router.get("/{session_id}")
async def get_session(
    session_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    """Get session details."""
    result = await db.execute(
        select(CaptureSession).where(CaptureSession.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    # Get points for this session
    points_result = await db.execute(
        select(InfrastructurePoint).where(
            InfrastructurePoint.session_id == session_id
        )
    )
    points = points_result.scalars().all()

    return {
        "id": session.id,
        "user_id": session.user_id,
        "start_time": session.start_time.isoformat(),
        "end_time": session.end_time.isoformat() if session.end_time else None,
        "points_detected": len(points),
        "points": [
            {
                "id": p.id,
                "type": p.type,
                "subtype": p.subtype,
                "confidence": p.confidence,
            }
            for p in points
        ],
    }


@router.get("")
async def list_sessions(
    db: DbSession,
    current_user: CurrentUser,
    limit: int = 10,
    offset: int = 0,
) -> dict:
    """List user's capture sessions."""
    result = await db.execute(
        select(CaptureSession)
        .where(CaptureSession.user_id == current_user.id)
        .order_by(CaptureSession.start_time.desc())
        .offset(offset)
        .limit(limit)
    )
    sessions = result.scalars().all()

    return {
        "sessions": [
            {
                "id": s.id,
                "start_time": s.start_time.isoformat(),
                "end_time": s.end_time.isoformat() if s.end_time else None,
                "points_detected": s.points_detected,
            }
            for s in sessions
        ],
        "total": len(sessions),
    }
