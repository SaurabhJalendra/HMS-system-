import apiClient from '../config';
import type { ApiResponse } from '../types';

export interface HospitalConfig {
  id: string;
  hospitalName: string;
  hospitalCode?: string;
  
  // Address Details
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  
  // Contact Information
  phone?: string;
  email?: string;
  emergencyContact?: string;
  
  // Regulatory Information
  hospitalLicenseNumber?: string;
  taxId?: string;
  
  // Branding
  logoUrl?: string;
  
  // Operational Settings
  timezone: string;
  defaultLanguage: string;
  currency: string;
  displayCurrency?: string; // Display currency for UI (if different from base currency)
  taxRate?: number;
  medicineMarkupPercentage?: number;
  /** Fallback OPD consultation fee when a doctor has no personal fee. */
  defaultConsultationFee?: number | string | null;
  
  // Appointment Settings
  appointmentSlotDuration: number;
  defaultDoctorConsultationDuration: number;
  workingHours?: any;
  
  // Payment Settings
  defaultPaymentTerms?: string;
  defaultPaymentMode?: string;
  enableInsurance: boolean;
  
  // Module Settings
  modulesEnabled?: any;
  labTestsEnabled: boolean;
  ipdEnabled: boolean;
  billingEnabled: boolean;
  
  // Custom Fields
  patientCustomFields?: any;
  
  createdAt?: string;
  updatedAt?: string;
}

export interface LabTestConfig {
  id: string;
  hospitalId: string;
  testCategory: string;
  categoryEnabled: boolean;
  defaultPrice?: number;
  notes?: string;
}

export interface MedicineConfig {
  id: string;
  hospitalId: string;
  category: string;
  categoryEnabled: boolean;
  defaultLowStockThreshold: number;
  enableAutoOrder: boolean;
  autoOrderThreshold?: number;
  notes?: string;
}

export interface SetupStatus {
  hasHospitalConfig: boolean;
  hasUsers: boolean;
  userCount: number;
}

class ConfigService {
  // ========== SETUP STATUS ==========
  async checkSetupStatus(): Promise<SetupStatus> {
    const response = await apiClient.get<ApiResponse<SetupStatus>>('/config/setup-status');
    return response.data.data;
  }

  // ========== HOSPITAL CONFIG ==========
  async getHospitalConfig(): Promise<{ config: HospitalConfig }> {
    const response = await apiClient.get<ApiResponse<{ config: HospitalConfig }>>('/config/hospital');
    return response.data.data;
  }

  async updateHospitalConfig(config: Partial<HospitalConfig>): Promise<{ config: HospitalConfig }> {
    const response = await apiClient.put<ApiResponse<{ config: HospitalConfig }>>('/config/hospital', config);
    return response.data.data;
  }

  async uploadHospitalLogo(formData: FormData): Promise<{ config: HospitalConfig; logoUrl: string }> {
    // Get token for manual header setting
    const token = localStorage.getItem('accessToken');
    const headers: any = {};
    if (token) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }
    // Don't set Content-Type - let browser set it with boundary for multipart/form-data
    
    const response = await apiClient.post<ApiResponse<{ config: HospitalConfig; logoUrl: string }>>(
      '/config/hospital/logo',
      formData,
      { headers }
    );
    return response.data.data;
  }

  // ========== LAB TEST CONFIG ==========
  async getLabTestConfig(): Promise<{ configs: LabTestConfig[] }> {
    const response = await apiClient.get<ApiResponse<{ configs: LabTestConfig[] }>>('/config/lab-tests');
    return response.data.data;
  }

  async addLabTestConfig(config: Omit<LabTestConfig, 'id' | 'hospitalId'>): Promise<{ config: LabTestConfig }> {
    const response = await apiClient.post<ApiResponse<{ config: LabTestConfig }>>('/config/lab-tests', config);
    return response.data.data;
  }

  async updateLabTestConfig(configId: string, config: Partial<LabTestConfig>): Promise<{ config: LabTestConfig }> {
    const response = await apiClient.put<ApiResponse<{ config: LabTestConfig }>>(`/config/lab-tests/${configId}`, config);
    return response.data.data;
  }

  // ========== MEDICINE CONFIG ==========
  async getMedicineConfig(): Promise<{ configs: MedicineConfig[] }> {
    const response = await apiClient.get<ApiResponse<{ configs: MedicineConfig[] }>>('/config/medicines');
    return response.data.data;
  }

  async addMedicineConfig(config: Omit<MedicineConfig, 'id' | 'hospitalId'>): Promise<{ config: MedicineConfig }> {
    const response = await apiClient.post<ApiResponse<{ config: MedicineConfig }>>('/config/medicines', config);
    return response.data.data;
  }

  async updateMedicineConfig(configId: string, config: Partial<MedicineConfig>): Promise<{ config: MedicineConfig }> {
    const response = await apiClient.put<ApiResponse<{ config: MedicineConfig }>>(`/config/medicines/${configId}`, config);
    return response.data.data;
  }
}

export default new ConfigService();

