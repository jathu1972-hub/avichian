export interface RegisterVerifyRequest {
  regNo: string;
  name: string;
  mobile: string;
  email: string;
}

export interface RegisterOtpRequest extends RegisterVerifyRequest {}

export interface RegisterCompleteRequest {
  regNo: string;
  otp: string;
  password: string;
  bio?: string;
}

export interface LoginPasswordRequest {
  regNo: string;
  password: string;
  rememberMe?: boolean;
}

export interface StaffLoginRequest {
  staffId: string;
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface SuperAdminLoginRequest {
  adminId: string;
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginEmailOtpRequest {
  email: string;
}

export interface LoginEmailOtpVerifyRequest {
  email: string;
  otp: string;
  rememberMe?: boolean;
}

export interface LoginOtpRequestRequest {
  mobile: string;
}

export interface LoginOtpVerifyRequest {
  mobile: string;
  otp: string;
}

export interface ForgotPasswordRequest {
  regNo: string;
}

export interface ResetPasswordRequest {
  regNo: string;
  otp: string;
  password: string;
}

export interface MfaVerifyRequest {
  code: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}