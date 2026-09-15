import apiClient from '../config';
import type { ApiResponse } from '../types';

export interface Allergy {
  id: string;
  code: string;
  name: string;
  category: string;
  description?: string | null;
  isActive: boolean;
}

export interface ChronicCondition {
  id: string;
  code: string;
  name: string;
  category: string;
  icdCode?: string | null;
  description?: string | null;
  isActive: boolean;
}

export interface Diagnosis {
  id: string;
  icdCode: string;
  name: string;
  category: string;
  isActive: boolean;
}

export interface Medicine {
  id: string;
  code: string;
  name: string;
  genericName?: string;
  manufacturer?: string;
  category: string;
  therapeuticClass?: string;
  atcCode?: string;
  price: number;
  stockQuantity: number;
  lowStockThreshold: number;
  expiryDate?: string;
  isActive: boolean;
}

export interface PatientAllergy {
  id: string;
  patientId: string;
  allergyId: string;
  severity: string;
  onsetDate?: string;
  notes?: string;
  allergy: Allergy;
}

export interface PatientChronicCondition {
  id: string;
  patientId: string;
  conditionId: string;
  diagnosisDate: string;
  currentStatus: string;
  notes?: string;
  condition: ChronicCondition;
}

export type CreateAllergyCatalogEntry = {
  code?: string;
  name: string;
  category: string;
  description?: string | null;
};

export type CreateChronicConditionCatalogEntry = {
  code?: string;
  name: string;
  category: string;
  icdCode?: string | null;
  description?: string | null;
};

class CatalogService {
  private noCacheParams(params: Record<string, any> = {}) {
    return {
      ...params,
      _ts: Date.now(),
    };
  }

  // ========== ALLERGY CATALOG ==========
  async getAllAllergies(): Promise<{ allergies: Allergy[] }> {
    const response = await apiClient.get<ApiResponse<{ allergies: Allergy[] }>>('/catalog/allergies', {
      params: this.noCacheParams(),
    });
    return response.data.data;
  }

  async addAllergy(allergy: CreateAllergyCatalogEntry): Promise<{ allergy: Allergy }> {
    const response = await apiClient.post<ApiResponse<{ allergy: Allergy }>>('/catalog/allergies', allergy);
    return response.data.data;
  }

  // ========== CHRONIC CONDITION CATALOG ==========
  async getAllChronicConditions(): Promise<{ conditions: ChronicCondition[] }> {
    const response = await apiClient.get<ApiResponse<{ conditions: ChronicCondition[] }>>('/catalog/chronic-conditions', {
      params: this.noCacheParams(),
    });
    return response.data.data;
  }

  async addChronicCondition(condition: CreateChronicConditionCatalogEntry): Promise<{ condition: ChronicCondition }> {
    const response = await apiClient.post<ApiResponse<{ condition: ChronicCondition }>>('/catalog/chronic-conditions', condition);
    return response.data.data;
  }

  // ========== DIAGNOSIS CATALOG ==========
  async getAllDiagnoses(category?: string): Promise<{ diagnoses: Diagnosis[] }> {
    const params = category ? { category } : {};
    const response = await apiClient.get<ApiResponse<{ diagnoses: Diagnosis[] }>>('/catalog/diagnoses', { params: this.noCacheParams(params) });
    return response.data.data;
  }

  async addDiagnosis(diagnosis: Omit<Diagnosis, 'id' | 'isActive'>): Promise<{ diagnosis: Diagnosis }> {
    const response = await apiClient.post<ApiResponse<{ diagnosis: Diagnosis }>>('/catalog/diagnoses', diagnosis);
    return response.data.data;
  }

  // ========== MEDICINE CATALOG ==========
  async getAllMedicines(category?: string, lowStock?: boolean): Promise<{ medicines: Medicine[] }> {
    const params: any = {};
    if (category) params.category = category;
    if (lowStock !== undefined) params.lowStock = lowStock.toString();
    
    const response = await apiClient.get<ApiResponse<{ medicines: Medicine[] }>>('/catalog/medicines', { params: this.noCacheParams(params) });
    return response.data.data;
  }

  async addMedicine(medicine: Omit<Medicine, 'id' | 'isActive'>): Promise<{ medicine: Medicine }> {
    const response = await apiClient.post<ApiResponse<{ medicine: Medicine }>>('/catalog/medicines', medicine);
    return response.data.data;
  }

  async updateMedicineStock(medicineId: string, stockQuantity: number): Promise<{ medicine: Medicine }> {
    const response = await apiClient.put<ApiResponse<{ medicine: Medicine }>>(`/catalog/medicines/${medicineId}/stock`, { stockQuantity });
    return response.data.data;
  }

  // ========== PATIENT ALLERGIES ==========
  async getPatientAllergies(patientId: string): Promise<{ allergies: PatientAllergy[] }> {
    const response = await apiClient.get<ApiResponse<{ allergies: PatientAllergy[] }>>(`/catalog/patients/${patientId}/allergies`, {
      params: this.noCacheParams(),
    });
    return response.data.data;
  }

  async addPatientAllergy(patientId: string, allergyData: { allergyId: string; severity: string; onsetDate?: string; notes?: string }): Promise<{ allergy: PatientAllergy }> {
    const response = await apiClient.post<ApiResponse<{ allergy: PatientAllergy }>>(`/catalog/patients/${patientId}/allergies`, allergyData);
    return response.data.data;
  }

  async deletePatientAllergy(patientId: string, allergyId: string): Promise<void> {
    await apiClient.delete<ApiResponse>(`/catalog/patients/${patientId}/allergies/${allergyId}`);
  }

  // ========== PATIENT CHRONIC CONDITIONS ==========
  async getPatientChronicConditions(patientId: string): Promise<{ conditions: PatientChronicCondition[] }> {
    const response = await apiClient.get<ApiResponse<{ conditions: PatientChronicCondition[] }>>(`/catalog/patients/${patientId}/chronic-conditions`, {
      params: this.noCacheParams(),
    });
    return response.data.data;
  }

  async addPatientChronicCondition(patientId: string, conditionData: { conditionId: string; diagnosisDate: string; currentStatus: string; notes?: string }): Promise<{ condition: PatientChronicCondition }> {
    const response = await apiClient.post<ApiResponse<{ condition: PatientChronicCondition }>>(`/catalog/patients/${patientId}/chronic-conditions`, conditionData);
    return response.data.data;
  }

  async deletePatientChronicCondition(patientId: string, conditionId: string): Promise<void> {
    await apiClient.delete<ApiResponse>(`/catalog/patients/${patientId}/chronic-conditions/${conditionId}`);
  }
}

export default new CatalogService();

