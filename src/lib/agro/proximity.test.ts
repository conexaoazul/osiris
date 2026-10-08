import { describe, expect, it } from 'vitest';
import { distanceKm, nearbyHotspots, validatePoint } from './proximity';

describe('Blue Agro geospatial proximity', () => {
  it('returns zero at the same point', () => {
    expect(distanceKm({ latitude: -12.9, longitude: -38.5 }, { latitude: -12.9, longitude: -38.5 })).toBe(0);
  });
  it('handles longitude wrap across antimeridian', () => {
    expect(distanceKm({ latitude: 0, longitude: 179.9 }, { latitude: 0, longitude: -179.9 })).toBeLessThan(23);
  });
  it('filters and sorts nearby observations', () => {
    const farm = { latitude: -12.9, longitude: -38.5 };
    const result = nearbyHotspots(farm, [
      { id: 'far', source: 'nasa-firms', latitude: -20, longitude: -40 },
      { id: 'near', source: 'nasa-firms', latitude: -12.901, longitude: -38.5 },
      { id: 'exact', source: 'nasa-firms', ...farm },
    ], 5);
    expect(result.map(({ id }) => id)).toEqual(['exact', 'near']);
    expect(result[1].distanceKm).toBeGreaterThan(0);
  });
  it('rejects invalid coordinates and unsafe radii', () => {
    expect(() => validatePoint({ latitude: NaN, longitude: 0 })).toThrow(RangeError);
    expect(() => validatePoint({ latitude: 91, longitude: 0 })).toThrow(RangeError);
    expect(() => nearbyHotspots({ latitude: 0, longitude: 0 }, [], 501)).toThrow(RangeError);
  });
});
