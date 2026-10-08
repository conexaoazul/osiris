import { describe, expect, it } from 'vitest';
import { farmBoundingBoxes, firmsAreaPath } from './firms-area';

describe('NASA FIRMS targeted area queries', () => {
  it('returns bounded farm area instead of the world', () => {
    const boxes = farmBoundingBoxes({ latitude: -12.9, longitude: -38.5 }, 10);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].south).toBeLessThan(-12.9);
    expect(boxes[0].east).toBeGreaterThan(-38.5);
    expect(firmsAreaPath('VIIRS_NOAA21_NRT', boxes[0], 1)).toContain('VIIRS_NOAA21_NRT/');
  });
  it('splits antimeridian-crossing boxes', () => {
    const boxes = farmBoundingBoxes({ latitude: 0, longitude: 179.99 }, 10);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].east).toBe(180);
    expect(boxes[1].west).toBe(-180);
  });
  it('rejects excessive radius and day range', () => {
    expect(() => farmBoundingBoxes({ latitude: 0, longitude: 0 }, 1000)).toThrow();
    const box = farmBoundingBoxes({ latitude: 0, longitude: 0 }, 10)[0];
    expect(() => firmsAreaPath('VIIRS_NOAA20_NRT', box, 6)).toThrow();
  });
});
