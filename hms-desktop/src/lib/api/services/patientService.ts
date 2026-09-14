import apiClient from '../config';
import {
  ApiResponse,
  PaginatedResponse,
  Patient,
  CreatePatientRequest,
  UpdatePatientRequest,
  PatientStats,
} from '../types';

class PatientService {
  // Create new patient
  async createPatient(patientData: CreatePatientRequest): Promise<Patient> {
    const response = await apiClient.post<ApiResponse<{ patient: Patient }>>(
      '/patients',
      patientData
    );
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to create patient');
    }
    return response.data.data.patient;
  }

  // Get all patients with pagination and search
  async getPatients(params?: {
    search?: string;
    gender?: string;
    bloodGroup?: string;
    createdFrom?: string;
    page?: number;
    limit?: number;
  }): Promise<{ patients: Patient[]; pagination: any }> {
    const response = await apiClient.get<ApiResponse<{ patients: Patient[]; pagination: any }>>(
      '/patients',
      { params }
    );
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to fetch patients');
    }
    return response.data.data;
  }

  // Get patient by ID
  async getPatientById(id: string): Promise<Patient> {
    const response = await apiClient.get<ApiResponse<{ patient: Patient }>>(
      `/patients/${id}`
    );
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to fetch patient');
    }
    return response.data.data.patient;
  }

  // Update patient
  async updatePatient(id: string, patientData: UpdatePatientRequest): Promise<Patient> {
    const response = await apiClient.put<ApiResponse<{ patient: Patient }>>(
      `/patients/${id}`,
      patientData
    );
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to update patient');
    }
    return response.data.data.patient;
  }

  // Delete patient
  async deletePatient(id: string, force: boolean = false): Promise<void> {
    const params = force ? { force: 'true' } : {};
    const response = await apiClient.delete<ApiResponse>(`/patients/${id}`, { params });
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to delete patient');
    }
  }

  // Search patients by phone number
  async searchPatientsByPhone(phone: string): Promise<Patient[]> {
    const response = await apiClient.get<ApiResponse<{ patients: Patient[] }>>(
      `/patients/search/${phone}`
    );
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to search patients');
    }
    return response.data.data.patients;
  }

  // Search patients (general search)
  async searchPatients(searchTerm: string): Promise<{ patients: Patient[]; pagination: any }> {
    const response = await apiClient.get<ApiResponse<{ patients: Patient[]; pagination: any }>>(
      '/patients',
      { params: { search: searchTerm } }
    );
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to search patients');
    }
    return response.data.data;
  }

  // Get patient statistics
  async getPatientStats(): Promise<PatientStats> {
    const response = await apiClient.get<ApiResponse<PatientStats>>('/patients/stats');
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to fetch patient stats');
    }
    return response.data.data;
  }
}

export default new PatientService();
