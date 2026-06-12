export interface MarkerData {
  id: string;
  lat: number;
  lng: number;
  title: string;
  description: string;
  color: string;
  iconType: 'pin' | 'star' | 'circle' | 'square' | 'flag';
  category?: string;
  createdAt: number;
}

export interface MapPackage {
  name: string;
  downloadedAt: number;
  zoomMin: number;
  zoomMax: number;
  tilesCount: number;
  pins: MarkerData[];
  tiles: { [key: string]: string }; // Key: "z/x/y", Value: Base64 data URL
}
