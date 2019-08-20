import { AxiosInstance } from "axios";
import { IUserIdResponse } from "./domain/IUserIdResponse";
import { IAnalyticsData } from "./domain/IAnalyticsData";
import { ISearchResponse } from "./domain/ISearchResponse";
declare const _default: {
    new (collectionUniqueId: string, searchToken: string): {
        localUserId: string;
        trackingRestClient: AxiosInstance;
        localUserCookieKey: string;
        globalEventProperties: {
            [prop: string]: any;
        };
        events: IAnalyticsData[];
        pollIntervalLimit: number;
        pollInterval: any;
        isSendingData: boolean;
        collectionUniqueId: string;
        searchToken: string;
        /***
         * set interval to send analytics data
         * @param interval
         */
        setPollInterval(interval: number): Promise<void>;
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
         * send event to server with polling
         * @param eventName
         * @param eventData
         */
        sendEvent(eventName: string, eventData: {
            [prop: string]: any;
        }): void;
        sendCachedEvents(): Promise<void>;
        /***
         * fn to set cached events to server
         */
        pollEvents(): Promise<void>;
        sleep(interval: number): Promise<{}>;
        searchQuery(searchResponse: ISearchResponse, label: string): void;
        emptySearchResults(searchResponse: ISearchResponse): void;
    };
};
export = _default;
