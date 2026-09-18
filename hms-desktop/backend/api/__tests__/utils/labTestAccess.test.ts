import { UserRole } from '@prisma/client';
import {
  assertOwnTechnicianId,
  capLimit,
  isAllLabType,
  mapCategoryToLabType,
} from '../../utils/labTestAccess';

describe('labTestAccess helpers', () => {
  it('maps clinical categories onto lab types', () => {
    expect(mapCategoryToLabType('MRI')).toBe('MRI');
    expect(mapCategoryToLabType('Cardiology')).toBe('General');
    expect(mapCategoryToLabType('Ultrasound')).toBe('Ultrasound');
  });

  it('recognizes ALL lab-type saves', () => {
    expect(isAllLabType('ALL TESTS')).toBe(true);
    expect(isAllLabType('General')).toBe(false);
  });

  it('caps pagination limits', () => {
    expect(capLimit(1000)).toBe(100);
    expect(capLimit(undefined)).toBe(20);
  });

  it('blocks a lab technician from changing another technician assignment', () => {
    expect(() =>
      assertOwnTechnicianId(
        { user: { id: 'tech-1', role: UserRole.LAB_TECH } } as any,
        'tech-2',
      ),
    ).toThrow('Lab technicians can only manage their own test selections');
  });
});
