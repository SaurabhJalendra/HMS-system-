import apiClient from '../config';
import { 
  Bill, 
  CreateBillRequest, 
  UpdateBillRequest, 
  BillSearchParams, 
  BillingStats, 
  InvoiceData,
  ApiResponse,
  PaginatedResponse 
} from '../types';

const billingService = {
  // Create a new bill
  async createBill(billData: CreateBillRequest): Promise<Bill> {
    const response = await apiClient.post<ApiResponse<Bill>>('/billing', billData);
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to save bill');
    }
    return response.data.data;
  },

  // Get all bills with filtering and pagination
  async getBills(params: BillSearchParams = {}): Promise<PaginatedResponse<Bill>> {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<Bill>>>('/billing', {
      params,
    });
    return response.data.data;
  },

  // Get bill by ID
  async getBillById(id: string): Promise<Bill> {
    const response = await apiClient.get<ApiResponse<Bill>>(`/billing/${id}`);
    return response.data.data;
  },

  // Update bill
  async updateBill(id: string, billData: UpdateBillRequest): Promise<Bill> {
    const response = await apiClient.put<ApiResponse<Bill>>(`/billing/${id}`, billData);
    return response.data.data;
  },

  // Delete bill
  async deleteBill(id: string): Promise<void> {
    await apiClient.delete<ApiResponse>(`/billing/${id}`);
  },

  // Get billing statistics
  async getBillingStats(period: number = 30): Promise<BillingStats> {
    const response = await apiClient.get<ApiResponse<BillingStats>>('/billing/stats', {
      params: { period },
    });
    return response.data.data;
  },

  // Generate invoice data
  async generateInvoice(id: string): Promise<InvoiceData> {
    const response = await apiClient.get<ApiResponse<InvoiceData>>(`/billing/${id}/invoice`);
    return response.data.data;
  },

  // Get bills by patient
  async getBillsByPatient(patientId: string): Promise<Bill[]> {
    const response = await apiClient.get<ApiResponse<Bill[]>>('/billing', {
      params: { patientId },
    });
    return response.data.data;
  },

  // Get pending bills
  async getPendingBills(): Promise<Bill[]> {
    const response = await apiClient.get<ApiResponse<Bill[]>>('/billing', {
      params: { status: 'PENDING' },
    });
    return response.data.data;
  },

  // Get paid bills
  async getPaidBills(): Promise<Bill[]> {
    const response = await apiClient.get<ApiResponse<Bill[]>>('/billing', {
      params: { status: 'PAID' },
    });
    return response.data.data;
  },

  // Mark bill as paid
  async markBillAsPaid(id: string, paymentMethod: string): Promise<Bill> {
    return this.updateBill(id, {
      paymentStatus: 'PAID',
      paymentMode: paymentMethod as any,
    });
  },

  // Cancel bill
  async cancelBill(id: string): Promise<Bill> {
    return this.updateBill(id, {
      paymentStatus: 'CANCELLED',
    });
  },
};

export default billingService;