// Common API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data: T;
}

// IPD Types
export enum WardType {
  GENERAL = 'GENERAL',
  ICU = 'ICU',
  CCU = 'CCU',
  NICU = 'NICU',
  PICU = 'PICU',
  SURGICAL = 'SURGICAL',
  MEDICAL = 'MEDICAL',
  MATERNITY = 'MATERNITY',
  PSYCHIATRIC = 'PSYCHIATRIC',
  ONCOLOGY = 'ONCOLOGY',
  DAY_CARE = 'DAY_CARE'
}

export enum BedType {
  STANDARD = 'STANDARD',
  ICU = 'ICU',
  CCU = 'CCU',
  NICU = 'NICU',
  PICU = 'PICU',
  ISOLATION = 'ISOLATION',
  PRIVATE = 'PRIVATE',
  SEMI_PRIVATE = 'SEMI_PRIVATE',
  WARD = 'WARD',
  EMERGENCY = 'EMERGENCY'
}

export enum AdmissionType {
  EMERGENCY = 'EMERGENCY',
  ELECTIVE = 'ELECTIVE',
  TRANSFER = 'TRANSFER',
  OBSERVATION = 'OBSERVATION',
  SURGICAL = 'SURGICAL',
  MEDICAL = 'MEDICAL'
}

export enum AdmissionStatus {
  ADMITTED = 'ADMITTED',
  DISCHARGED = 'DISCHARGED',
  TRANSFERRED = 'TRANSFERRED'
}

export interface Ward {
  id: string;
  name: string;
  type: WardType;
  capacity: number;
  currentOccupancy: number;
  description?: string;
  floor?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  beds?: Bed[];
  _count?: {
    beds: number;
    admissions: number;
  };
}

export interface Bed {
  id: string;
  wardId: string;
  bedNumber: string;
  bedType: BedType;
  isOccupied: boolean;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  ward?: {
    id: string;
    name: string;
    type: WardType;
  };
  admissions?: Admission[];
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
  dischargeNotes?: string;
  admittedBy: string;
  dischargedBy?: string;
  createdAt: string;
  updatedAt: string;
  patient?: {
    id: string;
    name: string;
    age: number;
    gender: string;
    phone: string;
    address?: string;
    bloodGroup?: string;
    allergies?: string;
    chronicConditions?: string;
  };
  ward?: {
    id: string;
    name: string;
    type: WardType;
    capacity: number;
    currentOccupancy: number;
  };
  bed?: {
    id: string;
    bedNumber: string;
    bedType: BedType;
    isOccupied: boolean;
  };
  admittedByUser?: {
    id: string;
    fullName: string;
    role: string;
  };
  dischargedByUser?: {
    id: string;
    fullName: string;
    role: string;
  };
}

export interface CreateWardRequest {
  name: string;
  type: WardType;
  capacity: number;
  description?: string;
  floor?: string;
}

export interface UpdateWardRequest {
  name?: string;
  type?: WardType;
  capacity?: number;
  description?: string;
  floor?: string;
  isActive?: boolean;
}

export interface CreateBedRequest {
  wardId: string;
  bedNumber: string;
  bedType: BedType;
  notes?: string;
}

export interface UpdateBedRequest {
  bedNumber?: string;
  bedType?: BedType;
  isOccupied?: boolean;
  isActive?: boolean;
  notes?: string;
}

export interface CreateAdmissionRequest {
  patientId: string;
  wardId: string;
  bedId: string;
  admissionDate: string;
  admissionType: AdmissionType;
  admissionReason: string;
  notes?: string;
}

export interface UpdateAdmissionRequest {
  wardId?: string;
  bedId?: string;
  admissionType?: AdmissionType;
  admissionReason?: string;
  status?: AdmissionStatus;
  notes?: string;
  dischargeNotes?: string;
}

export interface WardStats {
  totalWards: number;
  wardsByType: Array<{
    type: WardType;
    _count: { type: number };
  }>;
  activeWards: number;
  totalCapacity: number;
  totalOccupancy: number;
  availableBeds: number;
  occupancyRate: number;
}

export interface BedStats {
  totalBeds: number;
  bedsByType: Array<{
    bedType: BedType;
    _count: { bedType: number };
  }>;
  occupiedBeds: number;
  availableBeds: number;
  bedsByWard: Array<{
    wardId: string;
    _count: { wardId: number };
  }>;
  occupancyRate: number;
}

export interface AdmissionStats {
  totalAdmissions: number;
  currentAdmissions: number;
  dischargedToday: number;
  admissionsByType: Array<{
    admissionType: AdmissionType;
    _count: { admissionType: number };
  }>;
  admissionsByWard: Array<{
    wardId: string;
    _count: { wardId: number };
  }>;
  averageStayDuration: number;
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
}

// User Types
export enum UserRole {
  ADMIN = 'ADMIN',
  DOCTOR = 'DOCTOR',
  NURSE = 'NURSE',
  LAB_TECH = 'LAB_TECH',
  PHARMACY = 'PHARMACY',
  RECEPTIONIST = 'RECEPTIONIST',
  WARD_MANAGER = 'WARD_MANAGER',
  NURSING_SUPERVISOR = 'NURSING_SUPERVISOR',
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  email?: string | null;
  phone?: string | null;
  /** Personal OPD fee (INR). Null = hospital default. */
  consultationFee?: number | string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
}

// Patient Types
export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  phone: string;
  aadharCardNumber?: string; // Indian patients: 16-digit Aadhar
  passportNumber?: string;  // Foreign patients: passport number
  address: string;
  bloodGroup?: string;
  allergies?: string;
  chronicConditions?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  /** Free text: name of person who referred this patient */
  referredBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePatientRequest {
  name: string;
  age?: number;
  dateOfBirth?: string;
  gender: Gender;
  phone: string;
  aadharCardNumber?: string; // Indian patients
  passportNumber?: string;   // Foreign patients
  address: string;
  bloodGroup?: string;
  allergies?: string;
  chronicConditions?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  referredBy?: string;
}

export interface UpdatePatientRequest extends Partial<CreatePatientRequest> {}

// Appointment Types
export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
  patient?: Patient;
  doctor?: User;
  /** Present when list API includes relations (e.g. OPD queue) */
  consultations?: Array<{ id: string; heldUntil?: string | null }>;
  prescriptions?: Array<{ id: string; prescriptionNumber: string; status: string }>;
}

export interface CreateAppointmentRequest {
  patientId: string;
  doctorId: string;
  date: string;
  time: string;
  status?: AppointmentStatus;
}

export interface UpdateAppointmentRequest {
  date?: string;
  time?: string;
  status?: AppointmentStatus;
}

// Consultation Types
export interface Consultation {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  diagnosis: string;
  notes?: string;
  /** OPD consultation fee snapshotted at create (doctor fee, else hospital default). */
  fee?: number | string;
  consultationDate: string;
  createdAt: string;
  /** When set, OPD visit is paused (e.g. awaiting lab) until cleared. */
  heldUntil?: string | null;
  appointment?: Appointment;
  patient?: Patient;
  doctor?: User;
}

export interface CreateConsultationRequest {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  diagnosis: string;
  notes?: string;
  /** ISO datetime — consultation on hold; appointment stays in progress. */
  heldUntil?: string;
}

export interface UpdateConsultationRequest {
  diagnosis?: string;
  notes?: string;
  /** Set to null to clear hold when continuing to prescription. */
  heldUntil?: string | null;
}

export interface ConsultationSearchParams {
  patientId?: string;
  doctorId?: string;
  appointmentId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// Prescription Types
export interface Medicine {
  name: string;
  dosage: string;
  duration: string;
  quantity: number;
  instructions?: string;
}

export interface Prescription {
  id: string;
  patientId: string;
  doctorId: string;
  appointmentId?: string;
  consultationId?: string;
  medicines: Medicine[];
  isDispensed: boolean;
  createdAt: string;
  updatedAt: string;
  patient?: Patient;
  doctor?: User;
  appointment?: Appointment;
  consultation?: Consultation;
}

export interface CreatePrescriptionRequest {
  patientId: string;
  doctorId: string;
  appointmentId?: string;
  consultationId?: string;
  medicines: Medicine[];
  notes?: string;
}

export interface UpdatePrescriptionRequest {
  medicines?: Medicine[];
  notes?: string;
  isDispensed?: boolean;
}

export interface DispenseMedicineRequest {
  medicineName: string;
  quantityDispensed: number;
}

// Lab Test Types
export enum LabTestStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface TestCatalog {
  id: string;
  testName: string;
  description?: string;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LabTest {
  id: string;
  patientId: string;
  orderedBy: string;
  testCatalogId: string;
  testNameSnapshot: string;
  priceSnapshot: number;
  status: LabTestStatus;
  results?: string;
  createdAt: string;
  completedAt?: string;
  updatedAt: string;
  consultationId?: string | null;
  appointmentId?: string | null;
  patient?: Patient;
  orderedByUser?: User;
  testCatalog?: TestCatalog;
}

export interface CreateLabTestRequest {
  patientId: string;
  orderedBy: string;
  testCatalogId: string;
  notes?: string;
  consultationId?: string;
  appointmentId?: string;
}

export interface UpdateLabTestRequest {
  status?: LabTestStatus;
  results?: string;
  notes?: string;
}

export interface LabTestSearchParams {
  patientId?: string;
  orderedBy?: string;
  status?: LabTestStatus;
  testCatalogId?: string;
  page?: number;
  limit?: number;
}

export interface CreateTestCatalogRequest {
  testName: string;
  description?: string;
  price: number;
  isActive?: boolean;
}

export interface UpdateTestCatalogRequest {
  testName?: string;
  description?: string;
  price?: number;
  isActive?: boolean;
}

// Medicine Inventory Types
export interface MedicineInventory {
  id: string;
  name: string;
  quantity: number;
  price: number;
  lowStockThreshold: number;
  category?: string;
  manufacturer?: string;
  batchNumber?: string;
  expiryDate?: string;
  description?: string;
  dosage?: string;
  unit?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MedicineWithStatus extends MedicineInventory {
  stockStatus: 'OK' | 'LOW';
}

export interface CreateMedicineRequest {
  name: string;
  quantity: number;
  price: number;
  lowStockThreshold?: number;
}

export interface UpdateMedicineRequest {
  name?: string;
  quantity?: number;
  price?: number;
  lowStockThreshold?: number;
}

export interface MedicineSearchParams {
  search?: string;
  lowStock?: boolean;
  page?: number;
  limit?: number;
}

export interface UpdateStockRequest {
  quantity: number;
  operation: 'add' | 'subtract' | 'set';
  reason?: string;
}

export interface MedicineStats {
  totalMedicines: number;
  lowStockMedicines: number;
  totalInventoryValue: number;
  recentTransactions: number;
  totalQuantity: number;
}

// Prescription Types
export enum PrescriptionStatus {
  PENDING = 'PENDING',
  DISPENSED = 'DISPENSED',
  CANCELLED = 'CANCELLED',
}

export interface PrescriptionItem {
  id: string;
  medicineId: string;
  medicineName: string;
  quantity: number;
  dosage: string;
  instructions: string;
  price: number;
}

export interface Prescription {
  id: string;
  patientId: string;
  doctorId: string;
  status: PrescriptionStatus;
  items: PrescriptionItem[];
  totalAmount: number;
  notes?: string;
  createdAt: string;
  dispensedAt?: string;
  patient?: Patient;
  doctor?: User;
}

export interface CreatePrescriptionRequest {
  patientId: string;
  doctorId: string;
  items: Array<{
    medicineId: string;
    quantity: number;
    dosage: string;
    instructions: string;
  }>;
  notes?: string;
}

export interface UpdatePrescriptionRequest {
  status?: PrescriptionStatus;
  notes?: string;
}

export interface PrescriptionSearchParams {
  patientId?: string;
  doctorId?: string;
  status?: PrescriptionStatus;
  page?: number;
  limit?: number;
}

export interface PrescriptionStats {
  totalPrescriptions: number;
  pendingPrescriptions: number;
  /** Matches pending (active, not yet dispensed) — returned for dashboard UI */
  activePrescriptions?: number;
  dispensedPrescriptions: number;
  cancelledPrescriptions: number;
  totalRevenue: number;
  recentPrescriptions: number;
  dispensedToday?: number;
}

// Billing Types
export interface BillItem {
  description: string;
  quantity: number;
  unitPrice: number;
  category: 'CONSULTATION' | 'MEDICINE' | 'LAB_TEST' | 'PROCEDURE' | 'OTHER';
}

export interface Bill {
  id: string;
  patientId: string;
  receptionistId: string;
  items: BillItem[];
  subtotal: number;
  tax: number;
  totalAmount: number;
  paymentMode: 'CASH' | 'CARD' | 'UPI' | 'NET_BANKING' | 'INSURANCE';
  paymentStatus: 'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
  patient?: {
    id: string;
    name: string;
    phone: string;
    address: string;
    age?: number;
    gender?: string;
  };
  receptionist?: {
    fullName: string;
  };
}

export interface CreateBillRequest {
  patientId: string;
  items: BillItem[];
  paymentMode?: 'CASH' | 'CARD' | 'UPI' | 'NET_BANKING' | 'INSURANCE';
}

export interface UpdateBillRequest {
  paymentStatus?: 'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED';
  paymentMode?: 'CASH' | 'CARD' | 'UPI' | 'NET_BANKING' | 'INSURANCE';
}

export interface BillSearchParams {
  search?: string;
  status?: 'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED';
  patientId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface BillingStats {
  totalBills: number;
  pendingBills: number;
  paidBills: number;
  totalRevenue: number;
  monthlyRevenue: number;
  averageBillAmount: number;
}

export interface InvoiceData {
  billNumber: string;
  billDate: string;
  patient: any;
  items: BillItem[];
  subtotal: number;
  tax: number;
  totalAmount: number;
  paymentStatus: string;
  paymentMode: string;
  receptionist?: any;
}

// Billing Types
export enum PaymentMode {
  CASH = 'CASH',
  CARD = 'CARD',
  UPI = 'UPI',
  NET_BANKING = 'NET_BANKING',
  INSURANCE = 'INSURANCE',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  PARTIAL = 'PARTIAL',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
}

export enum ExpenseCategory {
  SALARY = 'SALARY',
  ELECTRICITY = 'ELECTRICITY',
  RENT = 'RENT',
  MAINTENANCE = 'MAINTENANCE',
  EQUIPMENT = 'EQUIPMENT',
  SUPPLIES = 'SUPPLIES',
  OTHER = 'OTHER',
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  expenseDate: string;
  paymentStatus: PaymentStatus;
  paidAt?: string | null;
  userId?: string | null;
  user?: { id: string; fullName: string; role: string } | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProfitLossReport {
  range: { from: string; to: string };
  revenue: { opd: number; ipd: number; total: number };
  expenses: { manual: number; medicinePurchases: number; total: number };
  profitOrLoss: number;
}

export interface BillItem {
  type: 'medicine' | 'lab_test' | 'consultation';
  id: string;
  name: string;
  quantity?: number;
  price: number;
  total: number;
}

export interface Bill {
  id: string;
  patientId: string;
  receptionistId: string;
  items: BillItem[];
  subtotal: number;
  tax: number;
  totalAmount: number;
  paymentMode: PaymentMode;
  paymentStatus: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  patient?: Patient;
  receptionist?: User;
}

export interface CreateBillRequest {
  patientId: string;
  receptionistId: string;
  items: BillItem[];
  paymentMode: PaymentMode;
  paymentStatus?: PaymentStatus;
}

export interface UpdateBillRequest {
  items?: BillItem[];
  paymentMode?: PaymentMode;
  paymentStatus?: PaymentStatus;
}

// Audit Types
export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  tableName: string;
  recordId: string;
  oldValue?: any;
  newValue?: any;
  timestamp: string;
  user?: User;
}

// System Config Types
export interface SystemConfig {
  id: string;
  configKey: string;
  configValue: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateSystemConfigRequest {
  configValue: string;
}

// Statistics Types
export interface PatientStats {
  totalPatients: number;
  patientsByGender: Array<{ gender: Gender; _count: { gender: number } }>;
  patientsByAgeGroup: Array<{ age_group: string; count: number }>;
  recentPatients: number;
}

export interface AppointmentStats {
  totalAppointments: number;
  appointmentsByStatus: Array<{ status: AppointmentStatus; _count: { status: number } }>;
  appointmentsByDate: Array<{ appointment_date: string; count: number }>;
  todayAppointments: number;
}

export interface PrescriptionStats {
  totalPrescriptions: number;
  prescriptionsByStatus: Array<{ isDispensed: boolean; _count: { isDispensed: number } }>;
  prescriptionsByDoctor: Array<{ doctorId: string; _count: { doctorId: number } }>;
  recentPrescriptions: number;
}

export interface LabTestStats {
  totalLabTests: number;
  labTestsByStatus: Array<{ status: LabTestStatus; _count: { status: number } }>;
  labTestsByTest: Array<{ testCatalogId: string; _count: { testCatalogId: number } }>;
  recentLabTests: number;
}
