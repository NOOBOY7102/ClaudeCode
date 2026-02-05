"""Infrastructure point schemas for request/response validation."""
from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field


class InfrastructureType(str, Enum):
    """Types of infrastructure."""
    TACTILE_PAVING = "tactile_paving"
    CROSSWALK = "crosswalk"
    TRAFFIC_LIGHT = "traffic_light"
    SLOPE = "slope"
    MANHOLE = "manhole"
    UTILITY_POLE = "utility_pole"
    STREET_LIGHT = "street_light"
    BUS_STOP = "bus_stop"


class TactilePavingSubtype(str, Enum):
    """Subtypes of tactile paving."""
    WARNING = "warning"  # Dot pattern (warning blocks)
    GUIDING = "guiding"  # Line pattern (guiding blocks)


class PointStatus(str, Enum):
    """Status of infrastructure point."""
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class Location(BaseModel):
    """Geographic location."""
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class PointBase(BaseModel):
    """Base point schema."""
    type: InfrastructureType
    subtype: str | None = None
    location: Location
    confidence: float = Field(..., ge=0, le=1)


class PointCreate(PointBase):
    """Schema for creating a new point."""
    image_url: str | None = None
    session_id: UUID | None = None


class PointUpdate(BaseModel):
    """Schema for updating a point."""
    type: InfrastructureType | None = None
    subtype: str | None = None
    location: Location | None = None
    status: PointStatus | None = None


class PointResponse(PointBase):
    """Schema for point response."""
    id: UUID
    status: PointStatus
    image_url: str | None
    reported_by: UUID | None
    verified_by: UUID | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PointsQueryParams(BaseModel):
    """Query parameters for fetching points."""
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    radius: float = Field(default=500, ge=1, le=10000)  # meters
    type: InfrastructureType | None = None
    status: PointStatus | None = None
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)


class PointsResponse(BaseModel):
    """Schema for points list response."""
    points: list[PointResponse]
    total: int
    bounds: dict


class DetectionResult(BaseModel):
    """Schema for detection result."""
    type: InfrastructureType
    subtype: str | None
    confidence: float
    bounding_box: dict  # x, y, width, height


class DetectionResponse(BaseModel):
    """Schema for detection API response."""
    detections: list[DetectionResult]
    image_url: str | None
    processing_time_ms: float
