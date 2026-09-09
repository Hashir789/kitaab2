export interface DeedItemQueryInterface {
  deed_item_id: number;
}

export interface ScaleQueryInterface {
  scale_id: number;
}

export interface ScaleItemQueryInterface {
  scale_items_id: number;
}

export interface ScaleItemResult {
  name: string;
  scale_id: number;
  created_at: Date;
  display_order: number;
  scale_items_id: number;
  description: string | null;
}

export interface DeedScaleStatusResult {
  is_locked: boolean;
  type: 'scale' | 'count' | null;
}

export interface DeedScaleStatusQueryInterface {
  is_locked: boolean;
  type: 'scale' | 'count' | null;
}