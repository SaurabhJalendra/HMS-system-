// Information content for ZenHosp — aligned with actual modules, APIs, and UI flows
export const infoContent = {
  patients: {
    title: 'Patient Management',
    description:
      'Register and search patients, view profiles, and maintain identifiers and clinical context used across OPD, IPD, prescriptions, labs, and billing.',
    sections: {
      overview: {
        title: 'Patient records',
        content:
          'Create patients with a stable display ID (derived from name and ID document), keep contact details unique, and maintain allergies and chronic conditions (including catalog links where used). Records are shared by reception, doctors, pharmacy, lab, and IPD/OT.',
      },
      personalInfo: {
        title: 'Registration details',
        content:
          'Capture legal name, date of birth, gender, phone (unique), address, and optional Aadhaar or passport for the human-readable patient ID. Emergency contacts help admissions and follow-up.',
      },
      medicalHistory: {
        title: 'Clinical context',
        content:
          'Use consultation and prescription history for continuity of care. Free-text fields may coexist with structured allergy and chronic-condition data from catalogs.',
      },
      allergies: {
        title: 'Allergies',
        content:
          'Record drug and non-drug allergies where applicable. This supports safer prescribing; severe allergies should always be confirmed at the point of care.',
      },
      chronicConditions: {
        title: 'Chronic conditions',
        content:
          'Track long-term diagnoses (e.g. diabetes, hypertension) to inform treatment plans and reporting.',
      },
      emergencyContact: {
        title: 'Emergency contact',
        content:
          'Name and phone for next of kin or guardian—used during admissions, procedures, and critical events.',
      },
    },
    fields: {
      name: {
        title: 'Patient name',
        content: 'Full name as used on official ID; it participates in the readable patient identifier.',
      },
      age: {
        title: 'Age',
        content: 'Derived from date of birth in this app; used for dosing and eligibility context.',
      },
      gender: {
        title: 'Gender',
        content: 'Recorded for clinical documentation and reporting.',
      },
      phone: {
        title: 'Phone',
        content: 'Must be unique—primary channel for appointments and reminders.',
      },
      address: {
        title: 'Address',
        content: 'Residential or correspondence address for records and billing.',
      },
      bloodGroup: {
        title: 'Blood group',
        content: 'Optional; important for transfusion and surgical planning.',
      },
    },
  },

  opdFlow: {
    title: 'OPD Flow',
    description:
      'End-to-end outpatient journey: reception registers or finds the patient and books an appointment; the doctor works the day’s queue, records consultation, orders labs, and writes prescriptions.',
    sections: {
      receptionist: {
        title: 'Reception',
        content:
          'Search or register the patient, pick doctor and slot, then confirm—patient appears in the doctor’s queue for that day.',
      },
      doctor: {
        title: 'Doctor',
        content:
          'Open today’s queue, run the consultation (diagnosis and notes), optionally order lab tests, and complete the prescription writer. Flow ties patient, appointment, and clinical documents together.',
      },
    },
    fields: {},
  },

  appointments: {
    title: 'Appointments',
    description:
      'View and manage scheduled visits: filter by doctor, date, and status; create or update appointments consistent with hospital working hours and slot length from Configuration.',
    sections: {
      overview: {
        title: 'Scheduling',
        content:
          'Lists and forms use the live patient and user (doctor) directories. Status moves through scheduled, completed, cancelled, etc., and feeds the OPD queue.',
      },
      scheduling: {
        title: 'New appointment',
        content:
          'Choose patient and doctor, date and time. Conflicts depend on existing bookings and your hospital’s slot and working-hour settings.',
      },
      calendar: {
        title: 'Lists and filters',
        content:
          'Use search and filters to manage daily workload; completed appointments can link to consultations.',
      },
      status: {
        title: 'Status',
        content:
          'Tracks lifecycle of the visit (e.g. scheduled, completed, cancelled) for reporting and queue display.',
      },
    },
    fields: {
      patient: {
        title: 'Patient',
        content: 'The person attending; must exist in Patient Management.',
      },
      doctor: {
        title: 'Doctor',
        content: 'Staff user with a doctor role; determines whose queue shows the visit.',
      },
      date: {
        title: 'Date',
        content: 'Service date for the outpatient visit.',
      },
      time: {
        title: 'Time',
        content: 'Slot time; granularity follows hospital appointment slot duration (Configuration).',
      },
      reason: {
        title: 'Reason',
        content: 'Short reason or chief complaint for reception and triage context.',
      },
    },
  },

  consultations: {
    title: 'Consultations',
    description:
      'Create and browse doctor–patient consultations, usually tied to an appointment, with diagnosis and notes stored for history and billing reference.',
    sections: {
      overview: {
        title: 'Consultation list',
        content:
          'Filter and open encounters. New consultations pick patient, doctor, and appointment when applicable so OPD billing can pull the correct visit.',
      },
      linkage: {
        title: 'Appointment link',
        content:
          'Linking to an appointment keeps the timeline coherent and helps reception/billing associate charges with the right visit.',
      },
    },
    fields: {
      appointmentId: {
        title: 'Appointment',
        content: 'Optional but recommended: binds this consultation to a scheduled slot.',
      },
      patientId: {
        title: 'Patient',
        content: 'Who was seen; drives history and downstream prescriptions and labs.',
      },
      doctorId: {
        title: 'Doctor',
        content: 'Clinician responsible for the encounter.',
      },
      diagnosis: {
        title: 'Diagnosis',
        content: 'Primary clinical diagnosis for this visit (required on create).',
      },
      notes: {
        title: 'Notes',
        content: 'Free-text plan, exam findings, or instructions.',
      },
    },
  },

  prescriptions: {
    title: 'Prescriptions',
    description:
      'Doctors create multi-line Rx with medicine catalog items, dose, frequency, and duration. Pharmacy (or Admin) dispenses: status moves to Dispensed, stock is reduced by computed units, and transactions are logged. Pending and safety checks support workflow.',
    sections: {
      overview: {
        title: 'Prescription list',
        content:
          'Search and filter by patient, doctor, and status. Open a record to print or review lines tied to the medicine catalog.',
      },
      creation: {
        title: 'Creating prescriptions',
        content:
          'Typically from OPD Flow after consultation: each line uses catalog medicine id, quantity per dose, frequency (e.g. 1-0-1), duration in days, and optional dosage/instructions.',
      },
      medications: {
        title: 'Line items',
        content:
          'Multiple medicines per Rx. Pricing on the Rx may use per-line quantity × unit price; inventory deduction on dispense uses quantity × doses-per-day × duration.',
      },
      safety: {
        title: 'Safety checks',
        content:
          'When provided by the backend, interaction and allergy-style warnings appear for the selected patient and medicines—always verify clinically before dispensing.',
      },
      dispensing: {
        title: 'Dispensing',
        content:
          'Pharmacy marks the prescription Dispensed when medication is handed out. The system reduces catalog stock accordingly and writes medicine transaction rows. Insufficient stock blocks dispense until inventory is adjusted or orders received.',
      },
    },
    fields: {
      patient: {
        title: 'Patient',
        content: 'Recipient of the medication; used for history and safety checks.',
      },
      medicine: {
        title: 'Medicine',
        content: 'Chosen from Medicine Management catalog (id, name, stock, price).',
      },
      quantity: {
        title: 'Quantity (per dose)',
        content: 'Units taken each time the frequency fires (e.g. tablets per dose).',
      },
      frequency: {
        title: 'Frequency',
        content:
          'How often per day—e.g. hyphen pattern 1-0-1 (doses summed) or abbreviations BD, TDS, QID—used with duration to compute total dispensed units.',
      },
      duration: {
        title: 'Duration (days)',
        content: 'Length of therapy in days; combined with frequency for total units on dispense.',
      },
      dosage: {
        title: 'Dosage strength',
        content: 'Optional text such as 500 mg or 10 ml for the label.',
      },
      instructions: {
        title: 'Instructions',
        content: 'Patient-facing directions (timing, hydration, etc.).',
      },
      withFood: {
        title: 'Meal timing',
        content: 'Whether to take with food, before meals, etc., when captured.',
      },
    },
  },

  labTests: {
    title: 'Laboratory',
    description:
      'Order tests from the hospital test catalog, track status from ordered through completed, enter or view results, and manage the catalog of available tests and prices.',
    sections: {
      overview: {
        title: 'Lab workspace',
        content:
          'Work with patient-linked lab orders, technician workflow, and catalog maintenance depending on your role.',
      },
      ordering: {
        title: 'Ordering',
        content:
          'Select patient, tests, ordering clinician, and priority; orders appear in worklists for processing.',
      },
      results: {
        title: 'Results',
        content:
          'Record values and interpretations; completed results feed clinical review and may support billing.',
      },
      reports: {
        title: 'Reports & PDF',
        content:
          'Generate or view printable summaries where the UI exposes export—use for patient handoff or records.',
      },
    },
    fields: {
      testType: {
        title: 'Test',
        content: 'Entry from test catalog (name, category, price).',
      },
      patient: {
        title: 'Patient',
        content: 'Subject of the order.',
      },
      doctor: {
        title: 'Ordering doctor',
        content: 'Responsible clinician on the requisition.',
      },
      priority: {
        title: 'Priority',
        content: 'Routine vs urgent/stat for lab triage.',
      },
      instructions: {
        title: 'Instructions',
        content: 'Fasting, timing, or collection notes.',
      },
    },
  },

  medicines: {
    title: 'Medicine Management',
    description:
      'Maintain the pharmacy catalog: list/search medicines, add or edit items, manage on-hand quantity (manual adjustments, purchase orders when marked Delivered, and automatic deduction when prescriptions are dispensed). Inventory tab shows stats, low-stock alerts, transaction history, and optional sync from dispensed prescriptions. Import catalog from file when needed.',
    sections: {
      overview: {
        title: 'Basic product details',
        content:
          'When adding a medicine, set brand name, generic (salt), manufacturer, and category so the item appears correctly in prescriptions and stock reports.',
      },
      inventory: {
        title: 'Pricing & stock',
        content:
          'Set unit price (billing may apply hospital markup from Configuration), opening or current stock, and low-stock threshold. On-hand quantity decreases when pharmacy dispenses and increases on stock operations or when a purchase order is set to Delivered. Use Inventory → “Sync stock from dispensed prescriptions” if legacy data left totals out of step with dispensed Rx.',
      },
      suppliers: {
        title: 'Suppliers & orders',
        content:
          'Maintain suppliers and raise purchase orders; receiving updates inventory for line items.',
      },
      stock: {
        title: 'Stock adjustments',
        content:
          'Use Update Stock (add / subtract / set) with a reason for audits; low-stock badges compare quantity to threshold.',
      },
    },
    fields: {
      name: {
        title: 'Medicine name',
        content: 'Brand or trade name shown in UI and on labels.',
      },
      genericName: {
        title: 'Generic name',
        content: 'INN / salt name for clinical clarity.',
      },
      manufacturer: {
        title: 'Manufacturer',
        content: 'Marketing authorization holder or labeler.',
      },
      category: {
        title: 'Category',
        content: 'Therapeutic or form class for filtering and reporting.',
      },
      price: {
        title: 'Price',
        content: 'Base unit price before optional hospital markup.',
      },
      quantity: {
        title: 'Stock quantity',
        content: 'Current units on hand in the catalog.',
      },
      lowStockThreshold: {
        title: 'Low-stock threshold',
        content: 'When on-hand quantity is at or below this value, the item is treated as low stock.',
      },
    },
  },

  billing: {
    title: 'Billing',
    description:
      'Build OPD invoices for a patient and date range: pull consultations, dispensed prescriptions, lab tests, and manual lines; apply tax/discount, generate PDF, and record payment. Admins can open Profit & Loss using expenses and revenue-style data.',
    sections: {
      overview: {
        title: 'OPD billing',
        content:
          'Pick patient and optional date range, load billable items by section, select lines, then save or export. Consultation lines use the fee stored on that visit (the doctor’s fee at consult time, otherwise the hospital default).',
      },
      billCreation: {
        title: 'Bill lines',
        content:
          'Consultation, pharmacy, laboratory, and other charges combine into one invoice with modes such as cash, card, or UPI.',
      },
      payments: {
        title: 'Payments',
        content:
          'Record how the patient paid and track payment status on the bill.',
      },
      reports: {
        title: 'Profit & Loss',
        content:
          'Admin-only view summarizing financial performance with expenses and income-style figures where configured.',
      },
    },
    fields: {
      patient: {
        title: 'Patient',
        content: 'Who the invoice is for; drives which services appear when loading items.',
      },
      services: {
        title: 'Line items',
        content: 'Selectable consultations, Rx, labs, or manual charges with amounts.',
      },
      paymentMode: {
        title: 'Payment mode',
        content: 'Cash, card, insurance, transfer, etc., per hospital setup.',
      },
      amount: {
        title: 'Amount',
        content: 'Totals include subtotal, tax, discounts, and grand total.',
      },
    },
  },

  ot: {
    title: 'Operation Theatre (OT)',
    description:
      'Manage theatres, schedule surgeries, assign teams, complete pre- and post-operative checklists, OT consumables inventory, and OT-related billing—integrated with IPD when patients are admitted.',
    sections: {
      overview: {
        title: 'OT overview',
        content:
          'Navigate from the OT dashboard to rooms, scheduling, active cases, pre/post care, staff, inventory, and billing submodules. Access is role-gated (e.g. doctor, nurse, admin).',
      },
      scheduling: {
        title: 'Surgery scheduling',
        content:
          'Book procedures with surgeon, room, time, and priority (elective / urgent / emergency); link to patients and admissions where applicable.',
      },
      preOp: {
        title: 'Pre-operative',
        content:
          'Checklists: consent, labs, anesthesia clearance, fasting, allergies—must be satisfied before proceeding.',
      },
      postOp: {
        title: 'Post-operative',
        content:
          'Recovery documentation, complications, and handover notes for ward or discharge.',
      },
      billing: {
        title: 'OT billing',
        content:
          'Capture surgery-related charges; may complement IPD billing for inpatients.',
      },
    },
    fields: {
      procedure: {
        title: 'Procedure',
        content: 'Catalog or free-text procedure defining the operation.',
      },
      surgeon: {
        title: 'Surgeon',
        content: 'Lead operating surgeon (staff user).',
      },
      otRoom: {
        title: 'OT room',
        content: 'Physical theatre with availability and maintenance state.',
      },
      priority: {
        title: 'Priority',
        content: 'Elective vs urgent vs emergency for sequencing and resource use.',
      },
    },
  },

  ipd: {
    title: 'Inpatient (IPD)',
    description:
      'Inpatient hub: dashboard, wards and beds, admissions and transfers, daily rounds and vitals, nursing shifts, discharge summaries, and inpatient billing—permissions vary by nurse, ward manager, doctor, reception, and admin.',
    sections: {
      overview: {
        title: 'IPD dashboard',
        content:
          'Entry point to submodules you are allowed to use; each tile opens ward, bed, admission, clinical, nursing, discharge, or billing tools.',
      },
      admissions: {
        title: 'Admissions',
        content:
          'Admit from patient records, assign ward and bed, capture admission type and diagnosis; discharge frees the bed.',
      },
      bedManagement: {
        title: 'Beds',
        content:
          'Define bed types and status; allocate to admissions and track occupancy.',
      },
      care: {
        title: 'Patient care',
        content:
          'Daily rounds and vital signs for admitted patients.',
      },
      discharge: {
        title: 'Discharge',
        content:
          'Prepare discharge summaries and complete the inpatient episode.',
      },
    },
    fields: {
      ward: {
        title: 'Ward',
        content: 'Nursing unit or floor grouping beds.',
      },
      bed: {
        title: 'Bed',
        content: 'Specific bed within a ward for the stay.',
      },
      admissionType: {
        title: 'Admission type',
        content: 'Emergency, elective, transfer, etc.',
      },
      diagnosis: {
        title: 'Admission diagnosis',
        content: 'Reason for hospitalization as recorded at admission.',
      },
    },
  },

  users: {
    title: 'User Management',
    description:
      'Admin-only directory of staff accounts: create and edit users with roles (Admin, Doctor, Receptionist, Lab, Pharmacy, Nurse, Ward Manager, Nursing Supervisor), activation flag, and professional fields for clinicians.',
    sections: {
      overview: {
        title: 'Accounts',
        content:
          'Users authenticate with username/password; role controls module access from the dashboard and navigation. Doctors require a personal consultation fee, which is copied onto each OPD visit bill.',
      },
      roles: {
        title: 'Roles',
        content:
          'Each role maps to a fixed set of modules (e.g. pharmacy sees patients, prescriptions, medicines; lab sees lab tests).',
      },
      permissions: {
        title: 'Access',
        content:
          'Enforced in the app shell and API; change role to move someone between workflows.',
      },
      security: {
        title: 'Security',
        content:
          'Deactivate accounts to revoke login; users can change password from profile where enabled.',
      },
    },
    fields: {
      username: {
        title: 'Username',
        content: 'Unique login identifier.',
      },
      fullName: {
        title: 'Full name',
        content: 'Displayed name across the app and on clinical documents.',
      },
      role: {
        title: 'Role',
        content: 'Determines which modules and IPD/OT submodules appear.',
      },
      isActive: {
        title: 'Active',
        content: 'Inactive users cannot sign in.',
      },
    },
  },

  configuration: {
    title: 'Configuration',
    description:
          'Hospital profile and operations: identity, logo, address, timezone, currencies, appointment slots, default consultation fee (fallback when a doctor has no personal fee), module toggles, and bank/invoice footer fields used on PDFs. Changes apply app-wide after save.',
    sections: {
      overview: {
        title: 'Hospital profile',
        content:
          'Legal and marketing name, code, contacts, license/tax ids, logo upload, languages, timezone, base and optional display currency, and tax or markup knobs that affect appointments, billing, and pharmacy pricing display.',
      },
      appointments: {
        title: 'Scheduling defaults',
        content:
          'Slot duration, default consult length, working days/hours—used when booking appointments and validating slots.',
      },
      modules: {
        title: 'Feature toggles',
        content:
          'Enable or align lab, IPD, billing, appointments, consultations, prescriptions, and pharmacy flags stored with hospital settings.',
      },
      banking: {
        title: 'Bank & invoice footer',
        content:
          'GSTIN, PAN, bank account, IFSC, UPI, payment terms, and footer text that can appear on generated invoices.',
      },
    },
    fields: {},
  },

  dashboard: {
    title: 'Dashboard',
    description:
      'Role-aware home: admins see user/patient/appointment counts and short lists; doctors see queue and workload summaries; reception, lab, and pharmacy see tiles relevant to their duties. Use Available Modules to jump into authorized areas.',
    sections: {
      overview: {
        title: 'Home',
        content:
          'Widgets load from live APIs where implemented; clock and quick actions help common tasks.',
      },
      metrics: {
        title: 'Metrics',
        content:
          'Counts and summaries depend on role—not every metric is shown to every user.',
      },
      quickActions: {
        title: 'Quick actions',
        content:
          'Shortcuts into patients, appointments, or other allowed modules in one click.',
      },
      notifications: {
        title: 'Alerts',
        content:
          'Reserved for operational alerts when populated; check module-specific screens for low stock, pending labs, etc.',
      },
    },
  },
};

const MODULE_ALIASES: Record<string, keyof typeof infoContent> = {
  catalog: 'configuration',
};

// Helper function to get information content
export const getInfoContent = (module: string, section = null, field = null) => {
  const key = (MODULE_ALIASES[module] || module) as keyof typeof infoContent;
  if (!infoContent[key]) {
    return {
      title: 'Information not available',
      content: `No help text is defined for “${module}”.`,
    };
  }

  const mod = infoContent[key];

  if (field && mod.fields && mod.fields[field as keyof typeof mod.fields]) {
    return mod.fields[field as keyof typeof mod.fields] as { title: string; content: string };
  }

  if (section && mod.sections && mod.sections[section as keyof typeof mod.sections]) {
    return mod.sections[section as keyof typeof mod.sections] as { title: string; content: string };
  }

  return {
    title: mod.title,
    content: mod.description,
  };
};

// Helper function to get all available modules
export const getAvailableModules = () => {
  return Object.keys(infoContent);
};

// Helper function to get all sections for a module
export const getModuleSections = (module: string) => {
  const key = (MODULE_ALIASES[module] || module) as keyof typeof infoContent;
  if (!infoContent[key] || !infoContent[key].sections) {
    return [];
  }
  return Object.keys(infoContent[key].sections!);
};

// Helper function to get all fields for a module
export const getModuleFields = (module: string) => {
  const key = (MODULE_ALIASES[module] || module) as keyof typeof infoContent;
  if (!infoContent[key] || !infoContent[key].fields) {
    return [];
  }
  return Object.keys(infoContent[key].fields!);
};
