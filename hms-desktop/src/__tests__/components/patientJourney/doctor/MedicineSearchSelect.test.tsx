import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import MedicineSearchSelect from '../../../../components/patientJourney/doctor/MedicineSearchSelect';

const medicines = [
  { id: 'med-1', name: 'Paracetamol', code: 'PCM', genericName: 'Acetaminophen' },
  { id: 'med-2', name: 'Ibuprofen', code: 'IBU' },
];

describe('MedicineSearchSelect', () => {
  it('prevents Enter from submitting while it opens the dropdown', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <MedicineSearchSelect medicines={medicines} valueId="" onChange={vi.fn()} />
      </form>,
    );

    const input = screen.getByRole('textbox', { name: /medicine/i });
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /paracetamol/i })).toBeInTheDocument();
  });

  it('clears a stale selection when the user edits its text', () => {
    const onChange = vi.fn();
    render(
      <MedicineSearchSelect
        medicines={medicines}
        valueId="med-1"
        onChange={onChange}
      />,
    );

    const input = screen.getByRole('textbox', { name: /medicine/i });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Ibup' } });

    expect(onChange).toHaveBeenCalledWith('', '');
    expect(input).toHaveValue('Ibup');
  });
});
