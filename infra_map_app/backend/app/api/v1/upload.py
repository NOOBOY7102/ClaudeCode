"""File upload API endpoints."""
import io
import uuid
from typing import Annotated

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from PIL import Image

from app.api.deps import CurrentUser, DbSession
from app.core.config import settings

router = APIRouter(prefix="/upload", tags=["upload"])


def get_s3_client():
    """Get S3/MinIO client."""
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
    )


def ensure_bucket_exists(client, bucket_name: str):
    """Ensure S3 bucket exists."""
    try:
        client.head_bucket(Bucket=bucket_name)
    except ClientError:
        client.create_bucket(Bucket=bucket_name)


@router.post("")
async def upload_image(
    file: Annotated[UploadFile, File(description="Image file to upload")],
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    """Upload an image to storage."""
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

        # Strip EXIF data for privacy
        data = list(image.getdata())
        image_no_exif = Image.new(image.mode, image.size)
        image_no_exif.putdata(data)

        # Convert to JPEG
        output = io.BytesIO()
        image_no_exif.convert("RGB").save(output, format="JPEG", quality=85)
        output.seek(0)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image file: {str(e)}",
        )

    # Generate unique filename
    file_id = str(uuid.uuid4())
    filename = f"{current_user.id}/{file_id}.jpg"

    # Upload to S3/MinIO
    try:
        client = get_s3_client()
        ensure_bucket_exists(client, settings.S3_BUCKET)

        client.upload_fileobj(
            output,
            settings.S3_BUCKET,
            filename,
            ExtraArgs={"ContentType": "image/jpeg"},
        )

        # Generate URL
        if settings.S3_ENDPOINT:
            url = f"{settings.S3_ENDPOINT}/{settings.S3_BUCKET}/{filename}"
        else:
            url = f"https://{settings.S3_BUCKET}.s3.amazonaws.com/{filename}"

        return {
            "url": url,
            "filename": filename,
            "size": len(contents),
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(e)}",
        )


@router.delete("/{filename:path}")
async def delete_image(
    filename: str,
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    """Delete an uploaded image."""
    # Verify ownership
    if not filename.startswith(str(current_user.id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this file",
        )

    try:
        client = get_s3_client()
        client.delete_object(Bucket=settings.S3_BUCKET, Key=filename)
        return {"message": "File deleted successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Delete failed: {str(e)}",
        )
