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
  private events: IAnalyticsData[] = [];
  private pollIntervalLimit = 5000;
  private pollInterval;
  private isSendingData = false;

  constructor(private collectionUniqueId: string, private searchToken: string) {
    this.trackingRestClient = Axios.create({
      baseURL: process.env.ST_TRACKING_SERVER,
      headers: {
        "authorization": "Bearer " + this.searchToken,
        "content-type": "application/json"
      }
    });
    this.getUserId();
    this.pollEvents();
  }

  /***
   * set interval to send analytics data
   * @param interval
   */
  public async setPollInterval(interval: number) {
    this.pollIntervalLimit = interval;
    await this.pollEvents();
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
    }
    return this;
  }

  /***
   * get local user id if exists else create new
   */
  private async getUserId() {
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
  }


  /***
   * assign global properties to be send in each event request
   * @param properties
   */
  public setGlobalProps(properties: { [prop: string]: any }) {
    if (!JSONHelper.isValidJson(JSON.stringify(properties)))
      logger.error("Invalid data provided for global Event properties");
    this.globalEventProperties = properties;
  }

  /***
   * send event to server with polling
   * @param eventName
   * @param eventData
   */
  public sendEvent(eventName: string, eventData: { [prop: string]: any }) {
    let analyticsData: IAnalyticsData = {
      collection: this.collectionUniqueId,
      eventName: eventName,
      eventData: eventData,
      meta: {},
      timeStamp: new Date().valueOf()
    };
    //give preference to event properties upon global event properties
    analyticsData.eventData = Object.assign({}, this.globalEventProperties, analyticsData.eventData);
    this.events.push(analyticsData);
  }


  async sendCachedEvents() {
    while (this.isSendingData)
      await this.sleep(100);

    if (!this.isSendingData && this.events.length) {
      //there is possibility that more events get added while we are sending data so use slice and send data
      //clear events whether response is success or failure
      //remove first n elements from array
      this.isSendingData = true;
      let trackingResponse = await this.trackingRestClient.post("events", this.events.splice(0, this.events.length), {
        headers: {
          "x-st-user": this.localUserId
        }
      }).catch(x => x.response);

      if (trackingResponse.status !== 200)
        logger.error(`Failed to send tracking data.Received Response: ${trackingResponse.status}`);
      this.isSendingData = false;
    }
  }

  /***
   * fn to set cached events to server
   */
  private async pollEvents() {
    //wait if we are already in between sendind data to server

    while (this.isSendingData)
      await this.sleep(100);

    if (this.pollInterval)
      clearTimeout(this.pollInterval);

    this.pollInterval = setInterval(async () => {
      await this.sendCachedEvents();
    }, this.pollIntervalLimit);
  }

  private async sleep(interval: number) {
    return new Promise((res) => {
      setTimeout(() => {
        return res();
      }, interval);
    })
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
