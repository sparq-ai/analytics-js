import { ISearchResponse } from "./domain/ISearchResponse";
declare class StAnalyticsClient {
    private appUniqueId;
    private searchToken;
    private localUserId;
    private trackingRestClient;
    private localUserCookieKey;
    private globalEventProperties;
    private cachedEvents;
    private isPageLoaded;
    private userIdLoadThreshold;
    private isUserIdThresholdCompleted;
    constructor(appUniqueId: string, searchToken: string);
    private waitForLoad;
    private startProcessingCachedEvents;
    /***
     * request new user id from server
     */
    private generateUserId;
    setUser(userId: string): this;
    /***
     * get local user id if exists else create new
     */
    private getUserId;
    /***
     * save local user id cookie to browser
     * @param userId
     */
    private saveLocalUserIdCookieToBrowser;
    /***
     * assign global properties to be send in each event request
     * @param properties
     */
    setGlobalProps(properties: {
        [prop: string]: any;
    }): void;
    /***
     * send event to server
     * @param eventName
     * @param eventData
     */
    sendEvent(eventName: string, eventData: {
        [prop: string]: any;
    }, collectionUniqueId?: string): Promise<void>;
    private canSendEventToServer;
    private processCachedEvents;
    private sendEventToServer;
    searchQuery(searchResponse: ISearchResponse, label: string, collectionUniqueId?: string): Promise<void>;
    emptySearchResults(searchResponse: ISearchResponse, isFilterApplied: boolean, collectionUniqueId?: string): Promise<void>;
}
export = StAnalyticsClient;
