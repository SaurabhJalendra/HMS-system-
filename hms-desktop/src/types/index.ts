/**
 * HMS Application Type Definitions
 * Centralized type definitions for the entire application
 */

// ============================================
// USER & AUTHENTICATION TYPES
// ============================================

export type UserRole = 
  | 'ADMIN' 
  | 'DOCTOR' 
  | 'LAB_TECH' 
  | 'PHARMACY' 
  | 'RECEPTIONIST' 
  | 'NURSE' 
  | 'WARD_MANAGER' 
  | 'NURSING_SUPERVISOR';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  qualifications?: string;
  registrationNumber?: string;
  phone?: string;
  email?: string;
  consultationFee?: number | string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

// ============================================
// PATIENT TYPES
// ============================================

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type PatientType = 'OUTPATIENT' | 'INPATIENT' | 'EMERGENCY';

export interface Patient {
  id: string;
  name: string;
  patientNumber?: string | null; // Display ID: e.g. alex_carry_5849 (normalized name + last 4 of Aadhar/Passport)
  age: number;
  gender: Gender;
  phone: string;
  address: string;
  bloodGroup?: string;
  allergies?: string;
  chronicConditions?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  /** Name of person who referred this patient (free text) */
  referredBy?: string | null;
  patientType: PatientType;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// APPOINTMENT TYPES
// ============================================

export type AppointmentStatus = 
  | 'SCHEDULED' 
  | 'CONFIRMED' 
  | 'IN_PROGRESS' 
  | 'COMPLETED' 
  | 'CANCELLED' 
  | 'NO_SHOW';

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  patient?: Patient;
  doctor?: User;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// CONSULTATION TYPES
// ============================================

export interface Consultation {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  diagnosis: string;
  notes?: string;
  temperature?: number;
  bloodPressure?: string;
  followUpDate?: string;
  consultationDate: string;
  patient?: Patient;
  doctor?: User;
  appointment?: Appointment;
  createdAt: string;
}

// ============================================
// PRESCRIPTION TYPES
// ============================================

export type PrescriptionStatus = 'ACTIVE' | 'DISPENSED' | 'CANCELLED' | 'EXPIRED';

export interface PrescriptionItem {
  id: string;
  prescriptionId: string;
  medicineId: string;
  quantity: number;
  frequency: string;
  duration: number;
  instructions?: string;
  dosage?: string;
  withFood?: string;
  startDate?: string;
  endDate?: string;
  rowOrder: number;
  medicine?: Medicine;
}

export interface Prescription {
  id: string;
  patientId: string;
  doctorId: string;
  appointmentId?: string;
  consultationId?: string;
  prescriptionNumber: string;
  status: PrescriptionStatus;
  notes?: string;
  totalAmount: number;
  isDispensed: boolean;
  dispensedAt?: string;
  dispensedBy?: string;
  patient?: Patient;
  doctor?: User;
  prescriptionItems?: PrescriptionItem[];
  createdAt: string;
  updatedAt: string;
}

// ============================================
// MEDICINE TYPES
// ============================================

export interface Medicine {
  id: string;
  code: string;
  name: string;
  genericName?: string;
  manufacturer?: string;
  category?: string;
  therapeuticClass?: string;
  atcCode?: string;
  price: number;
  stockQuantity: number;
  lowStockThreshold: number;
  expiryDate?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// LAB TEST TYPES
// ============================================

export type LabTestStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface TestCatalog {
  id: string;
  testName: string;
  description?: string;
  category?: string;
  price: number;
  units?: string;
  referenceRange?: string;
  isActive: boolean;
}

export interface LabTest {
  id: string;
  patientId: string;
  orderedBy: string;
  testCatalogId: string;
  testNameSnapshot: string;
  priceSnapshot: number;
  status: LabTestStatus;
  scheduledDate?: string;
  results?: string;
  reportFile?: string;
  notes?: string;
  performedBy?: string;
  patient?: Patient;
  orderedByUser?: User;
  performedByUser?: User;
  testCatalog?: TestCatalog;
  createdAt: string;
  completedAt?: string;
  updatedAt: string;
}

// ============================================
// BILLING TYPES
// ============================================

export type PaymentMode = 'CASH' | 'CARD' | 'UPI' | 'NET_BANKING' | 'INSURANCE';
export type PaymentStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'REFUNDED' | 'CANCELLED';

export interface BillItem {
  category: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface Bill {
  id: string;
  patientId: string;
  receptionistId: string;
  invoiceNumber?: string;
  items: BillItem[];
  subtotal: number;
  tax: number;
  totalAmount: number;
  paymentMode: PaymentMode;
  paymentStatus: PaymentStatus;
  patient?: Patient;
  receptionist?: User;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// IPD (INPATIENT) TYPES
// ============================================

export type WardType = 
  | 'GENERAL' 
  | 'ICU' 
  | 'PRIVATE' 
  | 'EMERGENCY' 
  | 'PEDIATRIC' 
  | 'MATERNITY' 
  | 'SURGICAL' 
  | 'CARDIAC' 
  | 'NEUROLOGY' 
  | 'ORTHOPEDIC' 
  | 'DAY_CARE';

export type BedType = 'GENERAL' | 'ICU' | 'PRIVATE' | 'SEMI_PRIVATE' | 'ISOLATION';

export type AdmissionType = 'EMERGENCY' | 'PLANNED' | 'TRANSFER' | 'OBSERVATION' | 'DAY_CARE';

export type AdmissionStatus = 
  | 'ADMITTED' 
  | 'DISCHARGED' 
  | 'TRANSFERRED' 
  | 'CANCELLED' 
  | 'ABSENT_WITHOUT_LEAVE';

export type ShiftType = 'MORNING' | 'AFTERNOON' | 'NIGHT' | 'GENERAL';

export interface Ward {
  id: string;
  name: string;
  hospitalId: string;
  type: WardType;
  capacity: number;
  currentOccupancy: number;
  isActive: boolean;
  description?: string;
  floor?: string;
  dailyRate?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Bed {
  id: string;
  wardId: string;
  bedNumber: string;
  bedType: BedType;
  isOccupied: boolean;
  isActive: boolean;
  notes?: string;
  ward?: Ward;
  createdAt: string;
  updatedAt: string;
}

export interface Admission {
  id: string;
  patientId: string;
  wardId: string;
  bedId: string;
  admissionDate: string;
  dischargeDate?: string;
  admissionType: AdmissionType;
  admissionReason: string;
  status: AdmissionStatus;
  notes?: string;
  admittedBy: string;
  dischargedBy?: string;
  dischargeNotes?: string;
  isDayCare: boolean;
  procedureStartTime?: string;
  procedureEndTime?: string;
  recoveryStartTime?: string;
  recoveryEndTime?: string;
  expectedDischargeTime?: string;
  homeSupportAvailable?: boolean;
  patient?: Patient;
  ward?: Ward;
  bed?: Bed;
  admittedByUser?: User;
  dischargedByUser?: User;
  createdAt: string;
  updatedAt: string;
}

export interface DailyRound {
  id: string;
  admissionId: string;
  doctorId: string;
  roundDate: string;
  diagnosis: string;
  treatment: string;
  notes?: string;
  nextRoundDate?: string;
  isCompleted: boolean;
  admission?: Admission;
  doctor?: User;
  createdAt: string;
  updatedAt: string;
}

export interface VitalSign {
  id: string;
  admissionId: string;
  recordedBy: string;
  temperature?: number;
  bloodPressure?: string;
  heartRate?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  weight?: number;
  height?: number;
  notes?: string;
  recordedAt: string;
  admission?: Admission;
  recordedByUser?: User;
  createdAt: string;
}

export interface NursingShift {
  id: string;
  admissionId: string;
  nurseId: string;
  shiftType: ShiftType;
  shiftDate: string;
  startTime: string;
  endTime?: string;
  notes?: string;
  medications?: any;
  isCompleted: boolean;
  admission?: Admission;
  nurse?: User;
  createdAt: string;
  updatedAt: string;
}

export interface DischargeSummary {
  id: string;
  admissionId: string;
  patientId: string;
  doctorId: string;
  admissionDate: string;
  dischargeDate: string;
  diagnosis: string;
  treatmentGiven: string;
  proceduresPerformed?: string;
  medicationsPrescribed?: string;
  followUpInstructions?: string;
  nextAppointmentDate?: string;
  notes?: string;
  admission?: Admission;
  patient?: Patient;
  doctor?: User;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// HOSPITAL CONFIGURATION TYPES
// ============================================

export interface HospitalConfig {
  id: string;
  hospitalName: string;
  hospitalCode?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
  emergencyContact?: string;
  hospitalLicenseNumber?: string;
  taxId?: string;
  logoUrl?: string;
  timezone: string;
  defaultLanguage: string;
  currency: string;
  taxRate?: number;
  appointmentSlotDuration: number;
  defaultDoctorConsultationDuration: number;
  workingHours?: any;
  defaultPaymentTerms?: string;
  defaultPaymentMode?: PaymentMode;
  enableInsurance: boolean;
  medicineMarkupPercentage?: number;
  modulesEnabled?: any;
  labTestsEnabled: boolean;
  ipdEnabled: boolean;
  billingEnabled: boolean;
  patientCustomFields?: any;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
}

export interface PaginatedResponse<T = any> {
  success: boolean;
  message: string;
  data: {
    items?: T[];
    [key: string]: any;
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  };
}

// ============================================
// FORM & UI TYPES
// ============================================

export interface SelectOption {
  value: string;
  label: string;
}

export interface FormField {
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  required?: boolean;
  options?: SelectOption[];
  validation?: any;
}

// ============================================
// MODULE TYPES
// ============================================

export type ModuleName = 
  | 'dashboard'
  | 'opdFlow'
  | 'patients'
  | 'appointments'
  | 'consultations'
  | 'prescriptions'
  | 'labTests'
  | 'medicines'
  | 'billing'
  | 'ipd'
  | 'ot'
  | 'users'
  | 'configuration';

// ============================================
// OT (OPERATION THEATRE) TYPES
// ============================================

export type OTStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'CLEANING';
export type SurgeryStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'POSTPONED';
export type SurgeryPriority = 'ELECTIVE' | 'URGENT' | 'EMERGENCY';
export type SurgeryTeamRole = 'SURGEON' | 'ASSISTANT_SURGEON' | 'ANESTHESIOLOGIST' | 'SCRUB_NURSE' | 'CIRCULATING_NURSE' | 'TECHNICIAN';

export interface ProcedureCatalog {
  id: string;
  code: string;
  name: string;
  category: string;
  defaultDuration?: number;
  isActive: boolean;
}

export interface OperationTheatre {
  id: string;
  name: string;
  hospitalId: string;
  type: string;
  location?: string;
  status: OTStatus;
  isActive: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Surgery {
  id: string;
  patientId: string;
  admissionId?: string;
  operationTheatreId?: string;
  procedureCatalogId?: string;
  procedureName: string;
  surgeonId: string;
  scheduledAt: string;
  startTime?: string;
  endTime?: string;
  status: SurgeryStatus;
  priority: SurgeryPriority;
  notes?: string;
  anesthesiaType?: string;
  complications?: string;
  surgicalNotes?: string;
  implantsUsed?: string;
  patient?: Patient;
  surgeon?: User;
  operationTheatre?: OperationTheatre;
  procedureCatalog?: ProcedureCatalog;
  admission?: Admission;
  teamMembers?: SurgeryTeamMember[];
  preOpChecklist?: PreOperativeChecklist;
  postOpRecord?: PostOperativeRecord;
  inventoryUsage?: OTInventoryUsage[];
  createdAt: string;
  updatedAt: string;
}

export interface SurgeryTeamMember {
  id: string;
  surgeryId: string;
  userId: string;
  role: SurgeryTeamRole;
  isLead: boolean;
  user?: User;
}

export interface PreOperativeChecklist {
  id: string;
  surgeryId: string;
  consentSigned: boolean;
  labTestsCompleted: boolean;
  anesthesiaClearance: boolean;
  bloodAvailable: boolean;
  fastingConfirmed: boolean;
  allergyReview: boolean;
  notes?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PostOperativeRecord {
  id: string;
  surgeryId: string;
  recoveryNotes?: string;
  complications?: string;
  dischargeInstructions?: string;
  painLevel?: number;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface OTInventoryUsage {
  id: string;
  surgeryId: string;
  itemName: string;
  quantity: number;
  unit?: string;
  notes?: string;
  createdAt: string;
}

export interface ModuleAccess {
  [key: string]: UserRole[];
}
































