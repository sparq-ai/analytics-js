/***
 * Analytics Data send via API
 */
export interface IAnalyticsData {
    collection: string;
    app: string;
    eventName: string;
    eventData: any;
    meta: {
        ipV4?: string;
    };
    timeStamp: number;
}
