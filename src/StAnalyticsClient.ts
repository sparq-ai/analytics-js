import Axios, {AxiosInstance} from "axios";
import {UserIdResponse} from "./domain/UserIdResponse";
import * as cookies from "browser-cookies";
import {JSONHelper} from "./util/JSONHelper";
import {AnalyticsData} from "./domain/Analytics Data";


export = class StAnalyticsClient {
  private localUserId: string;
  private trackingRestClient!: AxiosInstance;
  private ipv4Address: string;
  private localUserCookieKey = "uId";
  private globalEventProperties: { [prop: string]: any };

  constructor(private collectionUniqueId: string, private searchToken: string) {
    this.trackingRestClient = Axios.create({
      baseURL: process.env.ST_TRACKING_SERVER,
      headers: {
        "authorization": "Bearer " + this.searchToken,
        "content-type": "application/json"
      }
    });
    this.fetchLocalUserId();
    this.getIpAddress();
  }

  /***
   * request new user id from server
   */
  private async requestUserId(): Promise<UserIdResponse | null> {
    let userIdResponse = await this.trackingRestClient.post("/u", {collection: this.collectionUniqueId}).catch(x => x.response);
    if (userIdResponse.status === 200) {
      let userIdBody: UserIdResponse = userIdResponse.data;
      return userIdBody;
    } else {
      console.log(`Failed to get UserId for Search client.Received Response: ${userIdResponse.status}`);
      return null;
    }
  }


  public user(userId: string) {
    this.localUserId = userId;
    if (typeof window !== 'undefined') {
      this.saveLocalUserIdCookieToBrowser(this.localUserId);
    }
    return this;
  }

  /***
   * get local user id if exists else create new
   */
  private async fetchLocalUserId() {
    if (typeof window !== 'undefined' && !this.localUserId) {
      this.localUserId = cookies.get(this.localUserCookieKey);
      if (!this.localUserId) {
        let userIdBody = await this.requestUserId();
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
   * get ipv4 address
   */
  private async getIpAddress() {
    let ipAddressResponse = await Axios.get("https://api.ipify.org?format=json")
      .catch(e => e.response);
    if (ipAddressResponse.status === 200) {
      this.ipv4Address = ipAddressResponse.data.ip;
    } else
      this.ipv4Address = "0.0.0.0";
  }

  /***
   * assign global properties to be send in each event request
   * @param properties
   */
  public setGlobalEventProperties(properties: { [prop: string]: any }) {
    if (!JSONHelper.isValidJson(properties))
      console.error("Invalid data provided for global Event properties");
    this.globalEventProperties = properties;
  }

  /***
   * send event to server
   * @param eventName
   * @param eventData
   */
  public async sendEvent(eventName: string, eventData: { [prop: string]: any }) {
    let analyticsData: AnalyticsData = {
      collection: this.collectionUniqueId,
      eventName: eventName,
      eventData: eventData,
      meta: {
        ipV4: this.ipv4Address
      },
      timeStamp: new Date().valueOf()
    };
    //give preference to event properties upon global event properties
    analyticsData.eventData = Object.assign({}, analyticsData.eventData, this.globalEventProperties);
    let trackingResponse = await this.trackingRestClient.post("events", analyticsData, {
      headers: {
        "x-st-user": this.localUserId
      }
    }).catch(x => x.response);
    if (trackingResponse.status !== 200)
      console.log(`Failed to send tracking data.Received Response: ${trackingResponse.status}`);
  }

}
