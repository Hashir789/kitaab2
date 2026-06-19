export type DeedCategoryType = 'hasanaat' | 'saiyyiaat';
export type HideType = 'none' | 'hide_from_all' | 'hide_from_graphs';

export interface DeedQueryInterface {
  deed_id: number;
}

export interface DeedItemQueryInterface {
  deed_item_id: number;
}

export interface DeedItemResult {
  name: string;
  deed_id: number;
  created_at: Date;
  hide_type: HideType;
  deed_item_id: number;
  display_order: number;
  description: string | null;
  children?: DeedItemResult[];
  parent_deed_item_id: number | null;
}