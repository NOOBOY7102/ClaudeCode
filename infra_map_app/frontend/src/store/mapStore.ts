import { create } from 'zustand';
import type { Location, InfrastructurePoint } from '../types';

interface MapState {
  // Current position
  currentPosition: Location | null;
  setCurrentPosition: (position: Location | null) => void;

  // Map center
  center: Location;
  setCenter: (center: Location) => void;

  // Zoom level
  zoom: number;
  setZoom: (zoom: number) => void;

  // Points
  points: InfrastructurePoint[];
  setPoints: (points: InfrastructurePoint[]) => void;
  addPoint: (point: InfrastructurePoint) => void;

  // Selected point
  selectedPoint: InfrastructurePoint | null;
  setSelectedPoint: (point: InfrastructurePoint | null) => void;

  // Filters
  showTactilePaving: boolean;
  showVerifiedOnly: boolean;
  toggleTactilePaving: () => void;
  toggleVerifiedOnly: () => void;

  // Loading state
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

// Default center: Tokyo Station
const DEFAULT_CENTER: Location = {
  lat: 35.6812,
  lng: 139.7671,
};

export const useMapStore = create<MapState>((set) => ({
  // Current position
  currentPosition: null,
  setCurrentPosition: (position) => set({ currentPosition: position }),

  // Map center
  center: DEFAULT_CENTER,
  setCenter: (center) => set({ center }),

  // Zoom level
  zoom: 16,
  setZoom: (zoom) => set({ zoom }),

  // Points
  points: [],
  setPoints: (points) => set({ points }),
  addPoint: (point) =>
    set((state) => ({
      points: [...state.points, point],
    })),

  // Selected point
  selectedPoint: null,
  setSelectedPoint: (point) => set({ selectedPoint: point }),

  // Filters
  showTactilePaving: true,
  showVerifiedOnly: false,
  toggleTactilePaving: () =>
    set((state) => ({ showTactilePaving: !state.showTactilePaving })),
  toggleVerifiedOnly: () =>
    set((state) => ({ showVerifiedOnly: !state.showVerifiedOnly })),

  // Loading state
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
}));
