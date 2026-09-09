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

export interface ScaleItemStatResult {
  name: string;
  count: number;
  percentage: number;
  scale_item_id: number;
}

export interface DailyCountStatResult {
  date: string;
  count: number;
}

export interface DeedRecordRangeItemResult {
  name: string;
  total: number;
  deed_item_id: number;
  type: 'scale' | 'count' | null;
  scales: ScaleItemStatResult[] | null;
  children?: DeedRecordRangeItemResult[];
  daily_counts: DailyCountStatResult[] | null;
}

export interface DeedScaleRow {
  name: string;
  deed_item_id: number;
  display_order: number;
  scale_items_id: number | null;
  type: 'scale' | 'count' | null;
  scale_item_name: string | null;
  parent_deed_item_id: number | null;
  scale_item_display_order: number | null;
}

export interface RecordRow {
  date: string;
  deed_item_id: number;
  count_value: number | null;
  scale_item_id: number | null;
}

export interface InternalDeedNode {
  name: string;
  deed_item_id: number;
  display_order: number;
  children: InternalDeedNode[];
  type: 'scale' | 'count' | null;
  parent_deed_item_id: number | null;
  directScaleCounts: Map<number, number>;
  directDailyCounts: Map<string, number>;
  aggregatedDailyCounts: Map<string, number>;
  aggregatedScaleCounts: Map<number, number>;
  scaleItems: Map<number, { scale_item_id: number; name: string }>;
}