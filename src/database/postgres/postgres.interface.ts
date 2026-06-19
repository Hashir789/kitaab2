export interface TransactionClient {
  query: <T = any>(text: string, params?: any[]) => Promise<T[]>;
}