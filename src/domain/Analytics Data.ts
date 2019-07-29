/***
 * Analytics Data send via API
 */
export interface AnalyticsData {
  collection: string;
  eventName: string;
  eventData: any;
  meta: {
    ipV4?: string;
  },
  timeStamp: number;
}