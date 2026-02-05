"""SQLAlchemy database models."""
import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    """Base class for all models."""
    pass


class User(Base):
    """User model."""

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    contribution_points = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    reported_points = relationship(
        "InfrastructurePoint",
        back_populates="reporter",
        foreign_keys="InfrastructurePoint.reported_by",
    )
    verified_points = relationship(
        "InfrastructurePoint",
        back_populates="verifier",
        foreign_keys="InfrastructurePoint.verified_by",
    )
    sessions = relationship("CaptureSession", back_populates="user")
    verifications = relationship("Verification", back_populates="user")


class InfrastructurePoint(Base):
    """Infrastructure point model (e.g., tactile paving)."""

    __tablename__ = "infrastructure_points"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type = Column(String(50), nullable=False, index=True)  # 'tactile_paving', 'crosswalk', etc.
    subtype = Column(String(50))  # 'warning', 'guiding'
    location = Column(
        Geography(geometry_type="POINT", srid=4326),
        nullable=False,
        index=True,
    )
    confidence = Column(Float, nullable=False)  # AI detection confidence
    status = Column(String(20), default="pending", index=True)  # 'pending', 'verified', 'rejected'
    image_url = Column(String(500))

    # Foreign keys
    reported_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    verified_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    session_id = Column(UUID(as_uuid=True), ForeignKey("capture_sessions.id"))

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    reporter = relationship(
        "User",
        back_populates="reported_points",
        foreign_keys=[reported_by],
    )
    verifier = relationship(
        "User",
        back_populates="verified_points",
        foreign_keys=[verified_by],
    )
    session = relationship("CaptureSession", back_populates="points")
    verifications = relationship("Verification", back_populates="point")


class CaptureSession(Base):
    """Capture session model for tracking user mapping sessions."""

    __tablename__ = "capture_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    start_time = Column(DateTime, nullable=False, default=datetime.utcnow)
    end_time = Column(DateTime)
    route = Column(Geography(geometry_type="LINESTRING", srid=4326))  # Path taken
    points_detected = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="sessions")
    points = relationship("InfrastructurePoint", back_populates="session")


class Verification(Base):
    """Verification model for user validations of detected points."""

    __tablename__ = "verifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    point_id = Column(
        UUID(as_uuid=True),
        ForeignKey("infrastructure_points.id"),
        nullable=False,
    )
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    is_correct = Column(Boolean, nullable=False)
    comment = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    point = relationship("InfrastructurePoint", back_populates="verifications")
    user = relationship("User", back_populates="verifications")
