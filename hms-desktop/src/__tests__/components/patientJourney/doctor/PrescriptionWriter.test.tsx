import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import PrescriptionWriter from '../../../../components/patientJourney/doctor/PrescriptionWriter';
import type { Appointment } from '../../../../lib/api/types';
import catalogService from '../../../../lib/api/services/catalogService';
import prescriptionService from '../../../../lib/api/services/prescriptionService';

vi.mock('../../../../lib/hooks/useCriticalUpdateLock', () => ({
  useCriticalUpdateLock: vi.fn(),
}));

vi.mock('../../../../lib/api/services/catalogService', () => ({
  default: {
    getAllMedicines: vi.fn(),
  },
}));

vi.mock('../../../../lib/api/services/prescriptionService', () => ({
  default: {
    createPrescription: vi.fn(),
  },
}));

const activeMedicine = {
  id: 'med-1',
  code: 'PCM',
  name: 'Paracetamol',
  genericName: 'Acetaminophen',
  manufacturer: 'Example',
  category: 'Tablet',
  price: 2,
  stockQuantity: 100,
  lowStockThreshold: 10,
  isActive: true,
};

const inactiveMedicine = {
  ...activeMedicine,
  id: 'med-inactive',
  code: 'OLD',
  name: 'Inactive medicine',
  isActive: false,
};

const appointment = {
  id: 'appointment-1',
  patientId: 'patient-1',
  doctorId: 'doctor-1',
  patient: { id: 'patient-1', name: 'Test Patient' },
} as Appointment;

function renderWriter(overrides: Partial<React.ComponentProps<typeof PrescriptionWriter>> = {}) {
  return render(
    <PrescriptionWriter
      appointment={appointment}
      consultationId="consultation-1"
      doctorId="doctor-1"
      onDone={vi.fn()}
      onBack={vi.fn()}
      {...overrides}
    />,
  );
}

async function selectMedicine(inputIndex: number) {
  const inputs = await screen.findAllByRole('textbox', { name: /medicine/i });
  fireEvent.focus(inputs[inputIndex]);
  fireEvent.click(await screen.findByRole('button', { name: /paracetamol/i }));
}

describe('PrescriptionWriter', () => {
  beforeEach(() => {
    vi.mocked(catalogService.getAllMedicines).mockReset();
    vi.mocked(prescriptionService.createPrescription).mockReset();
    vi.mocked(catalogService.getAllMedicines).mockResolvedValue({
      medicines: [activeMedicine, inactiveMedicine],
    });
    vi.mocked(prescriptionService.createPrescription).mockResolvedValue({} as never);
  });

  it('rejects an incomplete row instead of silently dropping it', async () => {
    renderWriter();
    await selectMedicine(0);

    fireEvent.click(screen.getByRole('button', { name: /add medicine/i }));
    expect(screen.getByText('Medicine 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Medicine 2 of 2')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Units per dose')).toHaveLength(2);
    expect(screen.getAllByLabelText('Frequency')).toHaveLength(2);
    expect(screen.getAllByLabelText('Days')).toHaveLength(2);
    expect(screen.getAllByLabelText('Dosage')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /save prescription/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Complete medicine line 2 before saving.',
    );
    expect(prescriptionService.createPrescription).not.toHaveBeenCalled();
  });

  it('blocks duplicate selected medicines', async () => {
    renderWriter();
    await selectMedicine(0);
    fireEvent.click(screen.getByRole('button', { name: /add medicine/i }));
    await selectMedicine(1);

    fireEvent.click(screen.getByRole('button', { name: /save prescription/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Each medicine can only be added once.',
    );
    expect(prescriptionService.createPrescription).not.toHaveBeenCalled();
  });

  it('shows catalog errors, retries, and excludes inactive medicines', async () => {
    vi.mocked(catalogService.getAllMedicines)
      .mockRejectedValueOnce(new Error('Catalog unavailable'))
      .mockResolvedValueOnce({ medicines: [activeMedicine, inactiveMedicine] });

    renderWriter();

    expect(await screen.findByRole('alert')).toHaveTextContent('Catalog unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    const input = await screen.findByRole('textbox', { name: /medicine/i });
    fireEvent.focus(input);
    expect(await screen.findByRole('button', { name: /paracetamol/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /inactive medicine/i })).not.toBeInTheDocument();
    expect(catalogService.getAllMedicines).toHaveBeenCalledTimes(2);
  });

  it('guards a missing patient id before submission', async () => {
    renderWriter({
      appointment: { ...appointment, patientId: '', patient: undefined },
    });

    fireEvent.click(await screen.findByRole('button', { name: /save prescription/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Patient information is missing.',
    );
    expect(prescriptionService.createPrescription).not.toHaveBeenCalled();
  });
});
