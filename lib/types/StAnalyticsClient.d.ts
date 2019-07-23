import { AxiosInstance } from "axios";
import { UserIdResponse } from "./domain/UserIdResponse";
declare const _default: {
    new (collectionUniqueId: string, searchToken: string): {
        localUserId: string;
        trackingRestClient: AxiosInstance;
        ipv4Address: string;
        localUserCookieKey: string;
        globalEventProperties: {
            [prop: string]: any;
        };
        collectionUniqueId: string;
        searchToken: string;
        /***
         * request new user id from server
         */
        requestUserId(): Promise<UserIdResponse>;
        user(userId: string): any;
        /***
         * get local user id if exists else create new
         */
        fetchLocalUserId(): Promise<void>;
        /***
         * save local user id cookie to browser
         * @param userId
         */
        saveLocalUserIdCookieToBrowser(userId: string): void;
        /***
         * get ipv4 address
         */
        getIpAddress(): Promise<void>;
        /***
         * assign global properties to be send in each event request
         * @param properties
         */
        setGlobalEventProperties(properties: {
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
    };
};
export = _default;
