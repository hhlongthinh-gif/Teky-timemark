export interface GeoLocation {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
  address?: string;
}

export interface CapturedImage {
  originalDataUrl: string;
  processedDataUrl: string | null;
  location?: GeoLocation;
  timestamp: Date;
  personnelName: string;
  deviceName: string;
}

export enum AppState {
  IDLE = 'IDLE',
  CAMERA = 'CAMERA',
  PREVIEW = 'PREVIEW',
  ANALYZING = 'ANALYZING',
}