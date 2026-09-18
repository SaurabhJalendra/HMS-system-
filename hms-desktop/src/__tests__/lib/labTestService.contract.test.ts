import { describe, expect, it } from 'vitest';
import labTestService from '../../lib/api/services/labTestService';

describe('labTestService contract', () => {
  it('exposes authenticated report download and orderable catalog lookup', () => {
    expect(typeof labTestService.downloadLabTestReport).toBe('function');
    expect(labTestService.getTestCatalog.length).toBeGreaterThanOrEqual(1);
  });
});
