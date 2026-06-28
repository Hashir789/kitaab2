export interface DeedItemQueryInterface {
  deed_item_id: number;
}

export interface ScaleQueryInterface {
  scale_id: number;
}

export interface ScaleItemResult {
  name: string;
  scale_id: number;
  created_at: Date;
  display_order: number;
  scale_items_id: number;
  description: string | null;
}