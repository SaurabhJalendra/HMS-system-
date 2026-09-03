import apiClient from '../config';
import {
  ApiResponse,
  User,
  UserRole,
} from '../types';

interface CreateUserRequest {
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
  email?: string;
  phone?: string;
  department?: string;
  consultationFee?: number | null;
}

interface UpdateUserRequest {
  username?: string;
  fullName?: string;
  role?: UserRole;
  email?: string;
  phone?: string;
  department?: string;
  isActive?: boolean;
  consultationFee?: number | null;
}

interface UserStats {
  totalUsers: number;
  usersByRole: Array<{ role: UserRole; _count: { role: number } }>;
  activeUsers: number;
  inactiveUsers: number;
  recentUsers: number;
}

class UserService {
  // Create new user
  async createUser(userData: CreateUserRequest): Promise<User> {
    const response = await apiClient.post<ApiResponse<{ user: User }>>(
      '/users',
      userData
    );
    
    // Check if response is successful
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to create user');
    }
    
    // Check if data exists
    if (!response.data.data || !response.data.data.user) {
      throw new Error('Invalid response format from server');
    }
    
    return response.data.data.user;
  }

  // Get all users with pagination and search
  async getUsers(params?: {
    search?: string;
    role?: UserRole;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ users: User[]; pagination: any }> {
    const response = await apiClient.get<ApiResponse<{ users: User[]; pagination: any }>>(
      '/users',
      { params }
    );
    return response.data.data;
  }

  // Get user by ID
  async getUserById(id: string): Promise<User> {
    const response = await apiClient.get<ApiResponse<{ user: User }>>(
      `/users/${id}`
    );
    return response.data.data.user;
  }

  // Update user
  async updateUser(id: string, userData: UpdateUserRequest): Promise<User> {
    const response = await apiClient.put<ApiResponse<{ user: User }>>(
      `/users/${id}`,
      userData
    );
    return response.data.data.user;
  }

  // Delete user
  async deleteUser(id: string): Promise<void> {
    await apiClient.delete<ApiResponse>(`/users/${id}`);
  }

  // Reset user password
  async resetUserPassword(id: string, newPassword: string): Promise<void> {
    await apiClient.post<ApiResponse>(`/users/${id}/reset-password`, {
      newPassword
    });
  }

  // Toggle user active status
  async toggleUserStatus(id: string): Promise<User> {
    const response = await apiClient.post<ApiResponse<{ user: User }>>(
      `/users/${id}/toggle-status`
    );
    return response.data.data.user;
  }

  // Get user statistics
  async getUserStats(): Promise<UserStats> {
    const response = await apiClient.get<ApiResponse<UserStats>>('/users/stats');
    return response.data.data;
  }

  // Get users by role
  async getUsersByRole(role: UserRole): Promise<User[]> {
    const response = await this.getUsers({ role });
    return response.users;
  }

  // Search users
  async searchUsers(searchTerm: string): Promise<{ users: User[]; pagination: any }> {
    const response = await this.getUsers({ search: searchTerm });
    return response;
  }

  // Get active users only
  async getActiveUsers(): Promise<User[]> {
    const response = await this.getUsers({ isActive: true });
    return response.users;
  }

  // Get inactive users only
  async getInactiveUsers(): Promise<User[]> {
    const response = await this.getUsers({ isActive: false });
    return response.users;
  }

  // Get active doctors
  async getActiveDoctors(): Promise<User[]> {
    return this.getUsersByRole(UserRole.DOCTOR);
  }

  // Get active lab technicians
  async getActiveLabTechnicians(): Promise<User[]> {
    return this.getUsersByRole(UserRole.LAB_TECH);
  }

  // Get active pharmacists
  async getActivePharmacists(): Promise<User[]> {
    return this.getUsersByRole(UserRole.PHARMACY);
  }

  // Get active receptionists
  async getActiveReceptionists(): Promise<User[]> {
    return this.getUsersByRole(UserRole.RECEPTIONIST);
  }

  // Change current user's password
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiClient.post<ApiResponse>('/users/change-password', {
      currentPassword,
      newPassword
    });
  }
}

export default new UserService();
export type { CreateUserRequest, UpdateUserRequest, UserStats };