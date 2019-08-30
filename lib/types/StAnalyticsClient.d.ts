import { AxiosInstance } from "axios";
import { IUserIdResponse } from "./domain/IUserIdResponse";
import { IAnalyticsData } from "./domain/IAnalyticsData";
import { ISearchResponse } from "./domain/ISearchResponse";
declare const _default: {
    new (appUniqueId: string, searchToken: string, collectionUniqueId?: string): {
        localUserId: string;
        trackingRestClient: AxiosInstance;
        localUserCookieKey: string;
        globalEventProperties: {
            [prop: string]: any;
        };
        cachedEvents: IAnalyticsData[];
        isPageLoaded: boolean;
        userIdLoadThreshold: number;
        isUserIdThresholdCompleted: boolean;
        appUniqueId: string;
        searchToken: string;
        collectionUniqueId?: string;
        waitForLoad(): void;
        startProcessingCachedEvents(): void;
        /***
         * request new user id from server
         */
        generateUserId(): Promise<IUserIdResponse>;
        setUser(userId: string): any;
        /***
         * get local user id if exists else create new
         */
        getUserId(): Promise<void>;
        /***
         * save local user id cookie to browser
         * @param userId
         */
        saveLocalUserIdCookieToBrowser(userId: string): void;
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
        }): Promise<void>;
        canSendEventToServer(): boolean;
        processCachedEvents(): Promise<void>;
        sendEventToServer(event: IAnalyticsData): Promise<void>;
        searchQuery(searchResponse: ISearchResponse, label: string): Promise<void>;
        emptySearchResults(searchResponse: ISearchResponse, isFilterApplied: boolean): Promise<void>;
    };
};
export = _default;
