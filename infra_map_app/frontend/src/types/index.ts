// User types
export interface User {
  id: string;
  username: string;
  email: string;
  contribution_points: number;
  is_active: boolean;
  created_at: string;
}

export interface UserStats {
  contribution_points: number;
  rank: number;
  total_points_reported: number;
  verified_points: number;
  total_verifications: number;
  total_sessions: number;
  member_since: string;
}

export interface UserRanking {
  rank: number;
  user_id: string;
  username: string;
  contribution_points: number;
}

// Auth types
export interface Token {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
}

// Location types
export interface Location {
  lat: number;
  lng: number;
}

// Infrastructure point types
export type InfrastructureType =
  | 'tactile_paving'
  | 'crosswalk'
  | 'traffic_light'
  | 'slope'
  | 'manhole'
  | 'utility_pole'
  | 'street_light'
  | 'bus_stop';

export type TactilePavingSubtype = 'warning' | 'guiding';

export type PointStatus = 'pending' | 'verified' | 'rejected';

export interface InfrastructurePoint {
  id: string;
  type: InfrastructureType;
  subtype: string | null;
  location: Location;
  confidence: number;
  status: PointStatus;
  image_url: string | null;
  reported_by: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PointsResponse {
  points: InfrastructurePoint[];
  total: number;
  bounds: {
    center: Location;
    radius: number;
  };
}

// Detection types
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionResult {
  type: InfrastructureType;
  subtype: string | null;
  confidence: number;
  bounding_box: BoundingBox;
}

export interface DetectionResponse {
  detections: DetectionResult[];
  image_url: string | null;
  processing_time_ms: number;
}

// Map types
export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}
