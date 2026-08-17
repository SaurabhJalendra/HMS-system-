import apiClient from '../config';
import {
  ApiResponse,
  LoginRequest,
  RegisterRequest,
  User,
} from '../types';

class AuthService {
  // Login user
  async login(credentials: LoginRequest): Promise<{ user: User; accessToken: string }> {
    const response = await apiClient.post<ApiResponse<{ user: User; accessToken: string }>>(
      '/auth/login',
      credentials
    );

    if (response.status !== 200 || !response.data.success || !response.data.data) {
      const message = response.data?.message || 'Invalid credentials';
      const error: any = new Error(message);
      error.response = { status: response.status, data: response.data };
      throw error;
    }

    return response.data.data;
  }

  // Register new user (Admin only)
  async register(userData: RegisterRequest): Promise<User> {
    const response = await apiClient.post<ApiResponse<{ user: User }>>(
      '/auth/register',
      userData
    );
    return response.data.data.user;
  }

  // Get current user info
  async getCurrentUser(): Promise<{ user: User }> {
    const response = await apiClient.get<ApiResponse<{ user: User }>>('/auth/me');
    return response.data.data;
  }

  // Refresh access token
  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await apiClient.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
      '/auth/refresh',
      { refreshToken }
    );
    return response.data.data;
  }

  // Change password
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiClient.post<ApiResponse>('/auth/change-password', {
      currentPassword,
      newPassword,
    });
  }

  // Logout user
  async logout(): Promise<void> {
    await apiClient.post<ApiResponse>('/auth/logout');
  }

  // Store tokens in localStorage
  storeTokens(accessToken: string, refreshToken?: string): void {
    localStorage.setItem('accessToken', accessToken);
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    }
  }

  // Get stored access token
  getAccessToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  // Get stored refresh token
  getRefreshToken(): string | null {
    return localStorage.getItem('refreshToken');
  }

  // Clear tokens from localStorage
  clearTokens(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  }

  // Forgot password - reset password for a user
  async forgotPassword(username: string, newPassword: string): Promise<void> {
    await apiClient.post<ApiResponse>('/auth/forgot-password', {
      username,
      newPassword
    });
  }

  // Register first admin (only when no users exist)
  async registerFirstAdmin(userData: { username: string; password: string; fullName: string }): Promise<User> {
    const response = await apiClient.post<ApiResponse<{ user: User }>>(
      '/auth/register-admin',
      userData
    );
    return response.data.data.user;
  }
}

export default new AuthService();