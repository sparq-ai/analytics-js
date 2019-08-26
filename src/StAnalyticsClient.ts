import Axios, {AxiosInstance} from "axios";
import {IUserIdResponse} from "./domain/IUserIdResponse";
import * as cookies from "browser-cookies";
import {JSONHelper} from "./util/JSONHelper";
import {IAnalyticsData} from "./domain/IAnalyticsData";
import * as logger from "./util/Logger";
import {ISearchResponse} from "./domain/ISearchResponse";
import Events from "./domain/Events";


export = class StAnalyticsClient {
  private localUserId: string;
  private trackingRestClient!: AxiosInstance;
  private localUserCookieKey = "uId";
  private globalEventProperties: { [prop: string]: any };
  private cachedEvents: IAnalyticsData[] = [];
  private isPageLoaded: boolean = false;
  private userIdLoadThreshold: number = 5000;
  private isUserIdThresholdCompleted: boolean = false;

  constructor(private collectionUniqueId: string, private searchToken: string) {
    this.trackingRestClient = Axios.create({
      baseURL: process.env.ST_TRACKING_SERVER,
      headers: {
        "authorization": "Bearer " + this.searchToken,
        "content-type": "application/json"
      }
    });
    this.getUserId();
    this.waitForLoad();
  }


  private waitForLoad() {
    if (typeof window !== 'undefined') {
      document.onreadystatechange = () => {
        if (document.readyState === "complete") {
          this.isPageLoaded = true;
          this.startProcessingCachedEvents();
        } else {
          window.onload = () => {
            this.isPageLoaded = true;
            this.startProcessingCachedEvents();
          };
        }
      };
      setTimeout(() => {
        this.isPageLoaded = true;
        this.startProcessingCachedEvents();
      }, 5000);
    } else {
      this.isPageLoaded = true;
      this.startProcessingCachedEvents();
    }
  }

  private startProcessingCachedEvents() {
    if (this.canSendEventToServer()) {
      this.processCachedEvents();
    }
  }


  /***
   * request new user id from server
   */
  private async generateUserId(): Promise<IUserIdResponse | null> {
    let userIdResponse = await this.trackingRestClient.post("/u", {collection: this.collectionUniqueId}).catch(x => x.response);
    if (userIdResponse.status === 200) {
      let userIdBody: IUserIdResponse = userIdResponse.data;
      return userIdBody;
    } else {
      logger.error(`Failed to get UserId for Search client.Received Response: ${userIdResponse.status}`);
      return null;
    }
  }


  public setUser(userId: string) {
    this.localUserId = userId;
    if (typeof window !== 'undefined') {
      this.saveLocalUserIdCookieToBrowser(this.localUserId);
    } else {
      this.isUserIdThresholdCompleted = true;
      this.startProcessingCachedEvents();
    }
    return this;
  }

  /***
   * get local user id if exists else create new
   */
  private async getUserId() {

    //wait for max userIdLoadThreshold interval for userId to get loaded
    setInterval(() => {
      this.isUserIdThresholdCompleted = true;
      this.startProcessingCachedEvents();
    }, this.userIdLoadThreshold);

    if (typeof window !== 'undefined' && !this.localUserId) {
      this.localUserId = cookies.get(this.localUserCookieKey);
      if (!this.localUserId) {
        let userIdBody = await this.generateUserId();
        if (userIdBody) {
          this.saveLocalUserIdCookieToBrowser(userIdBody.data.userId);
          this.localUserId = userIdBody.data.userId;
        }
      } else {
        //re-initialize cookie
        this.saveLocalUserIdCookieToBrowser(this.localUserId);
      }
    } else {
      this.localUserId = require('os').hostname();
      this.isUserIdThresholdCompleted = true;
      this.startProcessingCachedEvents();
    }
  }

  /***
   * save local user id cookie to browser
   * @param userId
   */
  private saveLocalUserIdCookieToBrowser(userId: string) {
    cookies.set(this.localUserCookieKey, userId, {
      path: "/",
      expires: 367 * 2
    });
    this.isUserIdThresholdCompleted = true;
    this.startProcessingCachedEvents();
  }


  /***
   * assign global properties to be send in each event request
   * @param properties
   */
  public setGlobalProps(properties: { [prop: string]: any }) {
    if (!JSONHelper.isValidJson(properties))
      logger.error("Invalid data provided for global Event properties");
    this.globalEventProperties = properties;
  }

  /***
   * send event to server
   * @param eventName
   * @param eventData
   */
  public async sendEvent(eventName: string, eventData: { [prop: string]: any }) {
    let analyticsData: IAnalyticsData = {
      collection: this.collectionUniqueId,
      eventName: eventName,
      eventData: eventData,
      meta: {},
      timeStamp: new Date().valueOf()
    };
    //give preference to event properties upon global event properties
    analyticsData.eventData = Object.assign({}, this.globalEventProperties, analyticsData.eventData);
    if (this.canSendEventToServer())
      await this.sendEventToServer(analyticsData);
    else {
      this.cachedEvents.push(analyticsData);
    }

  }

  private canSendEventToServer(): boolean {
    return this.isPageLoaded && this.isUserIdThresholdCompleted;
  }


  private async processCachedEvents() {
    while (this.cachedEvents.length) {
      await this.sendEventToServer(this.cachedEvents.shift())
    }
  }

  private async sendEventToServer(event: IAnalyticsData) {
    let trackingResponse = await this.trackingRestClient.post("events", event, {
      headers: {
        "x-st-user": this.localUserId
      }
    }).catch(x => x.response);
    if (trackingResponse.status !== 200)
      logger.error(`Failed to send tracking data.Received Response: ${trackingResponse.status}`);
  }


  searchQuery(searchResponse: ISearchResponse, label: string) {
    let topToResults: any = searchResponse.results.slice(0, Math.min(searchResponse.totalHits, 10)).map((result, index) => {
      return {
        rank: index,
        label: result[label]
      }
    });

    return this.sendEvent(Events.searchQuery, {
      search: {
        query: searchResponse.query.query,
        queryId: searchResponse.uniqueId,
        responseTime: searchResponse.responseTime,
        totalHits: searchResponse.totalHits,
        items: topToResults
      }
    })
  }

  emptySearchResults(searchResponse: ISearchResponse) {
    if (searchResponse.totalHits > 0) {
      console.log("Invalid Event");
    }

    return this.sendEvent(Events.emptySearchQuery, {
      search: {
        query: searchResponse.query.query,
        queryId: searchResponse.uniqueId,
        responseTime: searchResponse.responseTime
      }
    });
  }

}
