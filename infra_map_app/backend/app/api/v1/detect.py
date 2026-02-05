"""Detection API endpoints for AI-based infrastructure detection."""
import io
import time
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from PIL import Image

from app.api.deps import CurrentUser, DbSession
from app.ml.detector import InfrastructureDetector
from app.schemas.point import DetectionResponse, DetectionResult

router = APIRouter(prefix="/detect", tags=["detection"])

# Initialize detector (lazy loading)
_detector: InfrastructureDetector | None = None


def get_detector() -> InfrastructureDetector:
    """Get or create detector instance."""
    global _detector
    if _detector is None:
        _detector = InfrastructureDetector()
    return _detector


@router.post("", response_model=DetectionResponse)
async def detect_infrastructure(
    file: Annotated[UploadFile, File(description="Image file to analyze")],
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    """Detect infrastructure in an uploaded image."""
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image",
        )

    # Read and validate image
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image file: {str(e)}",
        )

    # Run detection
    start_time = time.time()
    detector = get_detector()

    try:
        detections = detector.detect(image)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Detection failed: {str(e)}",
        )

    processing_time_ms = (time.time() - start_time) * 1000

    # Convert to response format
    detection_results = [
        DetectionResult(
            type=det["type"],
            subtype=det.get("subtype"),
            confidence=det["confidence"],
            bounding_box=det["bbox"],
        )
        for det in detections
    ]

    return {
        "detections": detection_results,
        "image_url": None,  # TODO: Upload to storage and return URL
        "processing_time_ms": processing_time_ms,
    }


@router.post("/batch", response_model=list[DetectionResponse])
async def detect_batch(
    files: Annotated[list[UploadFile], File(description="Image files to analyze")],
    current_user: CurrentUser,
    db: DbSession,
) -> list[dict]:
    """Detect infrastructure in multiple images."""
    if len(files) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 images per batch",
        )

    results = []
    detector = get_detector()

    for file in files:
        if not file.content_type or not file.content_type.startswith("image/"):
            results.append({
                "detections": [],
                "image_url": None,
                "processing_time_ms": 0,
                "error": "Invalid file type",
            })
            continue

        try:
            contents = await file.read()
            image = Image.open(io.BytesIO(contents))

            start_time = time.time()
            detections = detector.detect(image)
            processing_time_ms = (time.time() - start_time) * 1000

            detection_results = [
                DetectionResult(
                    type=det["type"],
                    subtype=det.get("subtype"),
                    confidence=det["confidence"],
                    bounding_box=det["bbox"],
                )
                for det in detections
            ]

            results.append({
                "detections": detection_results,
                "image_url": None,
                "processing_time_ms": processing_time_ms,
            })
        except Exception as e:
            results.append({
                "detections": [],
                "image_url": None,
                "processing_time_ms": 0,
                "error": str(e),
            })

    return results
