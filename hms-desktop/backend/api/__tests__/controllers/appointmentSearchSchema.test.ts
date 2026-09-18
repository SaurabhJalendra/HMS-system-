import { AppointmentStatus } from '@prisma/client';
import { appointmentSearchSchema } from '../../controllers/appointmentController';

describe('appointmentSearchSchema', () => {
  it('treats empty All Statuses / All Doctors filters as no filter', () => {
    const parsed = appointmentSearchSchema.parse({
      date: '',
      doctorId: '',
      status: '',
      page: '1',
      limit: '20',
    });

    expect(parsed.status).toBeUndefined();
    expect(parsed.doctorId).toBeUndefined();
    expect(parsed.date).toBeUndefined();
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });

  it('keeps a real status filter', () => {
    const parsed = appointmentSearchSchema.parse({
      status: AppointmentStatus.SCHEDULED,
    });
    expect(parsed.status).toBe(AppointmentStatus.SCHEDULED);
  });
});
