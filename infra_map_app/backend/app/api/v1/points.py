"""Infrastructure points API endpoints."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from geoalchemy2.functions import ST_DWithin, ST_GeogFromText, ST_X, ST_Y
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession
from app.db.models import InfrastructurePoint, Verification
from app.schemas.point import (
    PointCreate,
    PointResponse,
    PointsResponse,
    PointStatus,
    PointUpdate,
    InfrastructureType,
)

router = APIRouter(prefix="/points", tags=["points"])


@router.get("", response_model=PointsResponse)
async def get_points(
    db: DbSession,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: float = Query(500, ge=1, le=10000),
    type: InfrastructureType | None = None,
    status: PointStatus | None = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> dict:
    """Get infrastructure points within a radius."""
    # Build point geography
    point_wkt = f"POINT({lng} {lat})"

    # Base query
    query = select(InfrastructurePoint).where(
        ST_DWithin(
            InfrastructurePoint.location,
            ST_GeogFromText(point_wkt),
            radius,
        )
    )

    # Apply filters
    if type:
        query = query.where(InfrastructurePoint.type == type.value)
    if status:
        query = query.where(InfrastructurePoint.status == status.value)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Apply pagination
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    points = result.scalars().all()

    # Convert points to response format
    point_responses = []
    for point in points:
        # Extract lat/lng from geography
        coord_query = select(
            ST_Y(point.location).label("lat"),
            ST_X(point.location).label("lng"),
        )
        coord_result = await db.execute(coord_query)
        coords = coord_result.first()

        point_responses.append({
            "id": point.id,
            "type": point.type,
            "subtype": point.subtype,
            "location": {"lat": coords.lat, "lng": coords.lng},
            "confidence": point.confidence,
            "status": point.status,
            "image_url": point.image_url,
            "reported_by": point.reported_by,
            "verified_by": point.verified_by,
            "created_at": point.created_at,
            "updated_at": point.updated_at,
        })

    return {
        "points": point_responses,
        "total": total,
        "bounds": {
            "center": {"lat": lat, "lng": lng},
            "radius": radius,
        },
    }


@router.post("", response_model=PointResponse, status_code=status.HTTP_201_CREATED)
async def create_point(
    point_data: PointCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    """Create a new infrastructure point."""
    # Create point geography
    point_wkt = f"POINT({point_data.location.lng} {point_data.location.lat})"

    point = InfrastructurePoint(
        type=point_data.type.value,
        subtype=point_data.subtype,
        location=ST_GeogFromText(point_wkt),
        confidence=point_data.confidence,
        image_url=point_data.image_url,
        reported_by=current_user.id,
        session_id=point_data.session_id,
    )

    db.add(point)

    # Update user contribution points
    current_user.contribution_points += 1

    await db.commit()
    await db.refresh(point)

    return {
        "id": point.id,
        "type": point.type,
        "subtype": point.subtype,
        "location": point_data.location,
        "confidence": point.confidence,
        "status": point.status,
        "image_url": point.image_url,
        "reported_by": point.reported_by,
        "verified_by": point.verified_by,
        "created_at": point.created_at,
        "updated_at": point.updated_at,
    }


@router.get("/{point_id}", response_model=PointResponse)
async def get_point(
    point_id: UUID,
    db: DbSession,
) -> dict:
    """Get a specific infrastructure point."""
    result = await db.execute(
        select(InfrastructurePoint).where(InfrastructurePoint.id == point_id)
    )
    point = result.scalar_one_or_none()

    if not point:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Point not found",
        )

    # Extract coordinates
    coord_query = select(
        ST_Y(point.location).label("lat"),
        ST_X(point.location).label("lng"),
    )
    coord_result = await db.execute(coord_query)
    coords = coord_result.first()

    return {
        "id": point.id,
        "type": point.type,
        "subtype": point.subtype,
        "location": {"lat": coords.lat, "lng": coords.lng},
        "confidence": point.confidence,
        "status": point.status,
        "image_url": point.image_url,
        "reported_by": point.reported_by,
        "verified_by": point.verified_by,
        "created_at": point.created_at,
        "updated_at": point.updated_at,
    }


@router.patch("/{point_id}", response_model=PointResponse)
async def update_point(
    point_id: UUID,
    point_data: PointUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    """Update an infrastructure point."""
    result = await db.execute(
        select(InfrastructurePoint).where(InfrastructurePoint.id == point_id)
    )
    point = result.scalar_one_or_none()

    if not point:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Point not found",
        )

    # Update fields
    if point_data.type is not None:
        point.type = point_data.type.value
    if point_data.subtype is not None:
        point.subtype = point_data.subtype
    if point_data.location is not None:
        point_wkt = f"POINT({point_data.location.lng} {point_data.location.lat})"
        point.location = ST_GeogFromText(point_wkt)
    if point_data.status is not None:
        point.status = point_data.status.value
        if point_data.status == PointStatus.VERIFIED:
            point.verified_by = current_user.id

    await db.commit()
    await db.refresh(point)

    # Extract coordinates
    coord_query = select(
        ST_Y(point.location).label("lat"),
        ST_X(point.location).label("lng"),
    )
    coord_result = await db.execute(coord_query)
    coords = coord_result.first()

    return {
        "id": point.id,
        "type": point.type,
        "subtype": point.subtype,
        "location": {"lat": coords.lat, "lng": coords.lng},
        "confidence": point.confidence,
        "status": point.status,
        "image_url": point.image_url,
        "reported_by": point.reported_by,
        "verified_by": point.verified_by,
        "created_at": point.created_at,
        "updated_at": point.updated_at,
    }


@router.delete("/{point_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_point(
    point_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> None:
    """Delete an infrastructure point."""
    result = await db.execute(
        select(InfrastructurePoint).where(InfrastructurePoint.id == point_id)
    )
    point = result.scalar_one_or_none()

    if not point:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Point not found",
        )

    # Only allow deletion by the reporter or superusers
    if point.reported_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this point",
        )

    await db.delete(point)
    await db.commit()


@router.post("/{point_id}/verify", status_code=status.HTTP_201_CREATED)
async def verify_point(
    point_id: UUID,
    is_correct: bool,
    comment: str | None = None,
    db: DbSession = None,
    current_user: CurrentUser = None,
) -> dict:
    """Verify an infrastructure point."""
    result = await db.execute(
        select(InfrastructurePoint).where(InfrastructurePoint.id == point_id)
    )
    point = result.scalar_one_or_none()

    if not point:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Point not found",
        )

    # Create verification record
    verification = Verification(
        point_id=point_id,
        user_id=current_user.id,
        is_correct=is_correct,
        comment=comment,
    )
    db.add(verification)

    # Update user contribution points
    current_user.contribution_points += 1

    # Update point status based on verifications
    verify_count = await db.execute(
        select(func.count())
        .select_from(Verification)
        .where(Verification.point_id == point_id, Verification.is_correct == True)
    )
    positive_count = verify_count.scalar()

    if positive_count >= 3:  # Require 3 positive verifications
        point.status = "verified"
        point.verified_by = current_user.id

    await db.commit()

    return {"message": "Verification recorded", "is_correct": is_correct}
