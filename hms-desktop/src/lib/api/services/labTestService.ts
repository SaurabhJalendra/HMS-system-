import apiClient from '../config';
import {
  ApiResponse,
  LabTest,
  LabTestCreateRequest,
  LabTestUpdateRequest,
  LabTestSearchParams,
  TestCatalog,
  TestCatalogCreateRequest,
  TestCatalogUpdateRequest,
} from '../types';

class LabTestService {
  // Lab Test Management

  // Get all lab tests with search and pagination
  async getLabTests(params?: LabTestSearchParams): Promise<{
    labTests: LabTest[];
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
      labTests: LabTest[];
      pagination: any;
    }>>('/lab-tests', { params });
    return response.data.data;
  }

  // Get lab test by ID
  async getLabTestById(id: string): Promise<{ labTest: LabTest }> {
    const response = await apiClient.get<ApiResponse<{ labTest: LabTest }>>(
      `/lab-tests/${id}`
    );
    return response.data.data;
  }

  // Create new lab test order
  async createLabTest(labTestData: LabTestCreateRequest): Promise<{ labTest: LabTest }> {
    const response = await apiClient.post<ApiResponse<{ labTest: LabTest }>>(
      '/lab-tests',
      labTestData
    );
    return response.data.data;
  }

  // Update lab test (status, results, notes)
  async updateLabTest(id: string, labTestData: LabTestUpdateRequest): Promise<{ labTest: LabTest }> {
    const response = await apiClient.put<ApiResponse<{ labTest: LabTest }>>(
      `/lab-tests/${id}`,
      labTestData
    );
    return response.data.data;
  }

  // Upload lab test report file (for MRI, CT Scan, X-Ray)
  async uploadLabTestReport(id: string, file: File): Promise<{ labTest: LabTest }> {
    const formData = new FormData();
    formData.append('reportFile', file);
    
    const response = await apiClient.post<ApiResponse<{ labTest: LabTest }>>(
      `/lab-tests/${id}/upload-report`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data.data;
  }

  // Get pending lab tests for lab technicians
  async getPendingLabTests(): Promise<{ labTests: LabTest[] }> {
    const response = await apiClient.get<ApiResponse<{ labTests: LabTest[] }>>(
      '/lab-tests/pending'
    );
    return response.data.data;
  }

  // Get lab test statistics
  async getLabTestStats(): Promise<{
    totalLabTests: number;
    labTestsByStatus: Array<{
      status: string;
      _count: { status: number };
    }>;
    labTestsByTest: Array<{
      testCatalogId: string;
      _count: { testCatalogId: number };
    }>;
    recentLabTests: number;
    labTestsByDoctor: Array<{
      orderedBy: string;
      doctorName: string;
      count: number;
    }>;
  }> {
    const response = await apiClient.get<ApiResponse<{
      totalLabTests: number;
      labTestsByStatus: Array<{
        status: string;
        _count: { status: number };
      }>;
      labTestsByTest: Array<{
        testCatalogId: string;
        _count: { testCatalogId: number };
      }>;
      recentLabTests: number;
      labTestsByDoctor: Array<{
        orderedBy: string;
        doctorName: string;
        count: number;
      }>;
    }>>('/lab-tests/stats');
    return response.data.data;
  }

  // Get lab tests by patient ID
  async getLabTestsByPatient(patientId: string): Promise<{ labTests: LabTest[] }> {
    const response = await apiClient.get<ApiResponse<{ labTests: LabTest[] }>>(
      '/lab-tests',
      { params: { patientId } }
    );
    return response.data.data;
  }

  // Get lab tests by doctor ID
  async getLabTestsByDoctor(doctorId: string): Promise<{ labTests: LabTest[] }> {
    const response = await apiClient.get<ApiResponse<{ labTests: LabTest[] }>>(
      '/lab-tests',
      { params: { orderedBy: doctorId } }
    );
    return response.data.data;
  }

  // Get lab tests by status
  async getLabTestsByStatus(status: string): Promise<{ labTests: LabTest[] }> {
    const response = await apiClient.get<ApiResponse<{ labTests: LabTest[] }>>(
      '/lab-tests',
      { params: { status } }
    );
    return response.data.data;
  }

  // Test Catalog Management

  // Get test catalog
  async getTestCatalog(isActive?: boolean, orderable = false): Promise<{ testCatalog: TestCatalog[] }> {
    const params: Record<string, boolean> = {};
    if (isActive !== undefined) params.isActive = isActive;
    if (orderable) params.orderable = true;
    const response = await apiClient.get<ApiResponse<{ testCatalog: TestCatalog[] }>>(
      '/lab-tests/catalog',
      { params }
    );
    return response.data.data;
  }

  // Create new test catalog item
  async createTestCatalogItem(catalogData: TestCatalogCreateRequest): Promise<{ testCatalogItem: TestCatalog }> {
    const response = await apiClient.post<ApiResponse<{ testCatalogItem: TestCatalog }>>(
      '/lab-tests/catalog',
      catalogData
    );
    return response.data.data;
  }

  // Update test catalog item
  async updateTestCatalogItem(id: string, catalogData: TestCatalogUpdateRequest): Promise<{ testCatalogItem: TestCatalog }> {
    const response = await apiClient.put<ApiResponse<{ testCatalogItem: TestCatalog }>>(
      `/lab-tests/catalog/${id}`,
      catalogData
    );
    return response.data.data;
  }

  // Search lab tests
  async searchLabTests(searchTerm: string): Promise<{ labTests: LabTest[] }> {
    const response = await apiClient.get<ApiResponse<{ labTests: LabTest[] }>>(
      '/lab-tests',
      { params: { search: searchTerm } }
    );
    return response.data.data;
  }

  // Update lab test status
  async updateLabTestStatus(id: string, status: string, results?: string, notes?: string): Promise<{ labTest: LabTest }> {
    const updateData: LabTestUpdateRequest = { status: status as any };
    if (results !== undefined) updateData.results = results;
    if (notes !== undefined) updateData.notes = notes;
    
    return this.updateLabTest(id, updateData);
  }

  // Complete lab test with results
  async completeLabTest(id: string, results: string, notes?: string): Promise<{ labTest: LabTest }> {
    return this.updateLabTestStatus(id, 'COMPLETED', results, notes);
  }

  // Start lab test
  async startLabTest(id: string, notes?: string): Promise<{ labTest: LabTest }> {
    return this.updateLabTestStatus(id, 'IN_PROGRESS', undefined, notes);
  }

  // Cancel lab test
  async cancelLabTest(id: string, notes?: string): Promise<{ labTest: LabTest }> {
    return this.updateLabTestStatus(id, 'CANCELLED', undefined, notes);
  }

  // Billing Integration Helpers
  
  async getLabTestsForBilling(patientId: string, includeCompleted = false): Promise<LabTest[]> {
    const status = includeCompleted 
      ? undefined 
      : 'PENDING';
    
    const params: LabTestSearchParams = { 
      patientId, 
      ...(status && { status: status as any }) 
    };
    
    const response = await this.getLabTests(params);
    return response.labTests;
  }

  convertLabTestToBillItem(test: LabTest): any {
    return {
      type: 'lab_test',
      id: test.id,
      name: test.testNameSnapshot,
      quantity: 1,
      price: test.priceSnapshot,
      total: test.priceSnapshot,
      category: 'LAB_TEST'
    };
  }

  convertLabTestsToBillItems(tests: LabTest[]): any[] {
    return tests.map(test => this.convertLabTestToBillItem(test));
  }

  // Test Scheduling
  async scheduleLabTest(testId: string, scheduledDate: string): Promise<{ labTest: LabTest }> {
    return this.updateLabTest(testId, { scheduledDate } as any);
  }

  async getScheduledTestsForDate(date: string): Promise<{ labTests: LabTest[] }> {
    const response = await apiClient.get<ApiResponse<{ labTests: LabTest[] }>>(
      '/lab-tests/scheduled',
      { params: { date } }
    );
    return response.data.data;
  }

  // Lab Technician Workflow
  async getTestsForTechnician(): Promise<{ labTests: LabTest[] }> {
    const response = await apiClient.get<ApiResponse<{ labTests: LabTest[] }>>(
      '/lab-tests?status=IN_PROGRESS'
    );
    return response.data.data;
  }

  // Advanced Reporting
  async getLabTestReport(startDate: string, endDate: string): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>('/lab-tests/report', {
      params: { startDate, endDate }
    });
    return response.data.data;
  }

  async getTestsByCategory(category?: string, startDate?: string, endDate?: string): Promise<{ labTests: LabTest[] }> {
    const response = await apiClient.get<ApiResponse<{ labTests: LabTest[] }>>('/lab-tests/by-category', {
      params: { category, startDate, endDate }
    });
    return response.data.data;
  }

  // Technician Test Selection
  async getAvailableTestsForTechnician(): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>('/lab-tests/technician/available-tests');
    return response.data.data;
  }

  async getTechnicianSelectedTests(technicianId: string): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>(`/lab-tests/technician/${technicianId}/selected-tests`);
    return response.data.data;
  }

  async setTechnicianTestSelections(data: {
    technicianId: string;
    testCatalogIds: string[];
    labType: string;
    datapointsByTest?: Record<string, Record<string, boolean>>;
    pricesByTest?: Record<string, number>;
  }): Promise<any> {
    const response = await apiClient.post<ApiResponse<any>>('/lab-tests/technician/set-selections', data);
    return response.data.data;
  }

  async downloadLabTestReport(id: string): Promise<void> {
    const response = await apiClient.get(`/lab-tests/${id}/report`, { responseType: 'blob' });
    const blob = new Blob([response.data]);
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  }
}

export default new LabTestService();