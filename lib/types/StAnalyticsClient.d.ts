import { AxiosInstance } from "axios";
import { IUserIdResponse } from "./domain/IUserIdResponse";
declare const _default: {
    new (collectionUniqueId: string, searchToken: string): {
        localUserId: string;
        trackingRestClient: AxiosInstance;
        localUserCookieKey: string;
        globalEventProperties: {
            [prop: string]: any;
        };
        collectionUniqueId: string;
        searchToken: string;
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
    };
};
export = _default;
