import apiClient from '../config';
import {
  ApiResponse,
  Prescription,
  PrescriptionSearchParams,
  PrescriptionStats,
} from '../types';

function requireSuccessfulResponse<T>(
  response: { status: number; data: ApiResponse<T> },
  fallbackMessage: string,
): T {
  if (response.status >= 400 || response.data?.success === false) {
    const error: any = new Error(response.data?.message || fallbackMessage);
    error.response = { status: response.status, data: response.data };
    throw error;
  }
  return response.data.data;
}

class PrescriptionService {
  async getPrescriptions(params?: PrescriptionSearchParams): Promise<{
    prescriptions: Prescription[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }> {
    const response = await apiClient.get<ApiResponse<{
      prescriptions: Prescription[];
      pagination: any;
    }>>('/prescriptions', { params });
    return requireSuccessfulResponse(response, 'Failed to load prescriptions');
  }

  async getPrescriptionById(id: string): Promise<{ prescription: Prescription }> {
    const response = await apiClient.get<ApiResponse<{ prescription: Prescription }>>(
      `/prescriptions/${id}`
    );
    return requireSuccessfulResponse(response, 'Failed to load prescription');
  }

  async createPrescription(prescriptionData: any): Promise<{ prescription: Prescription }> {
    const response = await apiClient.post<ApiResponse<{ prescription: Prescription }>>(
      '/prescriptions',
      prescriptionData
    );
    return requireSuccessfulResponse(response, 'Prescription creation failed');
  }

  async updatePrescription(id: string, prescriptionData: any): Promise<{ prescription: Prescription }> {
    const response = await apiClient.put<ApiResponse<{ prescription: Prescription }>>(
      `/prescriptions/${id}`,
      prescriptionData
    );
    return requireSuccessfulResponse(response, 'Failed to update prescription');
  }

  async getPendingPrescriptions(): Promise<{ prescriptions: Prescription[] }> {
    const response = await apiClient.get<ApiResponse<{ prescriptions: Prescription[] }>>(
      '/prescriptions/pending'
    );
    return requireSuccessfulResponse(response, 'Failed to load pending prescriptions');
  }

  async getPrescriptionStats(): Promise<PrescriptionStats> {
    const response = await apiClient.get<ApiResponse<PrescriptionStats>>('/prescriptions/stats');
    return requireSuccessfulResponse(response, 'Failed to load prescription statistics');
  }

  async getPrescriptionsByPatient(patientId: string): Promise<{ prescriptions: Prescription[] }> {
    const response = await apiClient.get<ApiResponse<{ prescriptions: Prescription[] }>>(
      '/prescriptions',
      { params: { patientId } }
    );
    return requireSuccessfulResponse(response, 'Failed to load patient prescriptions');
  }

  async getPrescriptionsByDoctor(doctorId: string): Promise<{ prescriptions: Prescription[] }> {
    const response = await apiClient.get<ApiResponse<{ prescriptions: Prescription[] }>>(
      '/prescriptions',
      { params: { doctorId } }
    );
    return requireSuccessfulResponse(response, 'Failed to load doctor prescriptions');
  }

  async getPrescriptionsByStatus(status: string): Promise<{ prescriptions: Prescription[] }> {
    const response = await apiClient.get<ApiResponse<{ prescriptions: Prescription[] }>>(
      '/prescriptions',
      { params: { status } }
    );
    return requireSuccessfulResponse(response, 'Failed to filter prescriptions');
  }

  async searchPrescriptions(searchTerm: string): Promise<{ prescriptions: Prescription[] }> {
    const response = await apiClient.get<ApiResponse<{ prescriptions: Prescription[] }>>(
      '/prescriptions',
      { params: { search: searchTerm } }
    );
    return requireSuccessfulResponse(response, 'Failed to search prescriptions');
  }

  async dispensePrescription(id: string, notes?: string): Promise<{ prescription: Prescription }> {
    const response = await apiClient.post<ApiResponse<{ prescription: Prescription }>>(
      `/prescriptions/${id}/dispense`,
      { notes }
    );
    return requireSuccessfulResponse(response, 'Failed to dispense prescription');
  }

  async cancelPrescription(id: string, reason?: string): Promise<{ prescription: Prescription }> {
    const response = await apiClient.post<ApiResponse<{ prescription: Prescription }>>(
      `/prescriptions/${id}/cancel`,
      { reason }
    );
    return requireSuccessfulResponse(response, 'Failed to cancel prescription');
  }

  async deletePrescription(id: string): Promise<{ message: string }> {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(
      `/prescriptions/${id}`
    );
    return requireSuccessfulResponse(response, 'Failed to delete prescription');
  }

  async getInventoryAudit(id: string): Promise<any> {
    const response = await apiClient.get<ApiResponse<{ audit: any }>>(
      `/prescriptions/${id}/inventory-audit`,
    );
    return requireSuccessfulResponse(response, 'Failed to check medicine inventory').audit;
  }

  async getTemplates(): Promise<{ templates: any[] }> {
    const response = await apiClient.get<ApiResponse<{ templates: any[] }>>(
      '/prescriptions/templates',
    );
    return requireSuccessfulResponse(response, 'Failed to load prescription templates');
  }

  async createTemplate(templateData: {
    name: string;
    description?: string;
    templateData: any[];
  }): Promise<{ template: any }> {
    const response = await apiClient.post<ApiResponse<{ template: any }>>(
      '/prescriptions/templates',
      templateData,
    );
    return requireSuccessfulResponse(response, 'Failed to create prescription template');
  }

  async deleteTemplate(id: string): Promise<void> {
    const response = await apiClient.delete<ApiResponse<unknown>>(
      `/prescriptions/templates/${id}`,
    );
    requireSuccessfulResponse(response, 'Failed to delete prescription template');
  }
}

export default new PrescriptionService();