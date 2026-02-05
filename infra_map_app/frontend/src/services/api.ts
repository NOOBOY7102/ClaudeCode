import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';
import type {
  Token,
  User,
  LoginCredentials,
  RegisterData,
  PointsResponse,
  InfrastructurePoint,
  DetectionResponse,
  UserStats,
  UserRanking,
} from '../types';

const API_BASE_URL = '/api/v1';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token.access_token}`;
  }
  return config;
});

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && originalRequest) {
      const token = useAuthStore.getState().token;
      if (token?.refresh_token) {
        try {
          const newToken = await authService.refresh(token.refresh_token);
          useAuthStore.getState().setToken(newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken.access_token}`;
          return api(originalRequest);
        } catch {
          useAuthStore.getState().logout();
        }
      }
    }

    return Promise.reject(error);
  }
);

// Auth service
export const authService = {
  async register(data: RegisterData): Promise<User> {
    const response = await api.post<User>('/auth/register', data);
    return response.data;
  },

  async login(credentials: LoginCredentials): Promise<Token> {
    const formData = new FormData();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);

    const response = await api.post<Token>('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.data;
  },

  async refresh(refreshToken: string): Promise<Token> {
    const response = await api.post<Token>('/auth/refresh', null, {
      params: { refresh_token: refreshToken },
    });
    return response.data;
  },
};

// Points service
export const pointsService = {
  async getPoints(
    lat: number,
    lng: number,
    radius: number = 500,
    type?: string,
    status?: string
  ): Promise<PointsResponse> {
    const params: Record<string, string | number> = { lat, lng, radius };
    if (type) params.type = type;
    if (status) params.status = status;

    const response = await api.get<PointsResponse>('/points', { params });
    return response.data;
  },

  async getPoint(id: string): Promise<InfrastructurePoint> {
    const response = await api.get<InfrastructurePoint>(`/points/${id}`);
    return response.data;
  },

  async createPoint(data: {
    type: string;
    subtype?: string;
    location: { lat: number; lng: number };
    confidence: number;
    image_url?: string;
  }): Promise<InfrastructurePoint> {
    const response = await api.post<InfrastructurePoint>('/points', data);
    return response.data;
  },

  async verifyPoint(
    id: string,
    isCorrect: boolean,
    comment?: string
  ): Promise<void> {
    await api.post(`/points/${id}/verify`, null, {
      params: { is_correct: isCorrect, comment },
    });
  },

  async deletePoint(id: string): Promise<void> {
    await api.delete(`/points/${id}`);
  },
};

// Detection service
export const detectionService = {
  async detect(file: File): Promise<DetectionResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<DetectionResponse>('/detect', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async detectBatch(files: File[]): Promise<DetectionResponse[]> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    const response = await api.post<DetectionResponse[]>(
      '/detect/batch',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return response.data;
  },
};

// User service
export const userService = {
  async getMe(): Promise<User> {
    const response = await api.get<User>('/users/me');
    return response.data;
  },

  async getStats(): Promise<UserStats> {
    const response = await api.get<UserStats>('/users/stats');
    return response.data;
  },

  async getRanking(limit: number = 10): Promise<UserRanking[]> {
    const response = await api.get<UserRanking[]>('/users/ranking', {
      params: { limit },
    });
    return response.data;
  },
};

export default api;
