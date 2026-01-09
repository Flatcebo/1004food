/**
 * API 관련 타입 정의
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface Product {
  id: number;
  type: string | null;
  postType: string | null;
  name: string;
  code: string;
  pkg: string | null;
  price: number | null;
  salePrice: number | null;
  supplyPrice: number | null;
  postFee: number | null;
  purchase: string | null;
  billType: string | null;
  category: string | null;
  productType: string | null;
  sabangName: string | null;
  etc: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOption {
  id: number;
  name: string;
}

export interface ProductCreateRequest {
  type: string | null;
  postType: string | null;
  name: string;
  code: string;
  pkg: string | null;
  price: number | null;
  salePrice: number | null;
  postFee: number | null;
  purchase: string | null;
  billType: string | null;
  category: string | null;
  productType: string | null;
  sabangName: string | null;
  etc: string | null;
}
