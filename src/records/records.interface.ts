export interface RecordResult {
  date: string;
  user_id: number;
  created_at: Date;
  record_id: number;
  deed_item_id: number;
  count_value: number | null;
  scale_item_id: number | null;
}

export interface DeedItemOwnerQueryInterface {
  deed_item_id: number;
}

export interface ScaleItemOwnerQueryInterface {
  scale_items_id: number;
}