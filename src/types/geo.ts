/**
 * Geospatial & Administrative Hierarchy Types
 * Supports nationwide coverage (~6,700 blocks, downscale to ~250k panchayats)
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface AdminHierarchyNode {
  stateId: string;
  stateName: string;
  districtId: string;
  districtName: string;
  blockId: string;
  blockName: string;
  panchayatId?: string;
  panchayatName?: string;
}

export interface BlockBoundaryFeature {
  type: 'Feature';
  properties: {
    blockId: string;
    blockName: string;
    districtName: string;
    stateName: string;
    currentRiskLevel?: 'low' | 'moderate' | 'high' | 'severe';
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

export interface MapViewportState {
  center: [number, number]; // [lng, lat]
  zoom: number;
  pitch: number;
  bearing: number;
}
