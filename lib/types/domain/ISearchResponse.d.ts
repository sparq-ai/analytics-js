export interface SearchResponse {
    uniqueId: string;
    query: SearchRequest;
    results: any[];
    responseTime: number;
    totalHits: number;
    [props: string]: any;
}
export interface SearchRequest {
    query: string;
    fields: string[];
    textFacets: string[];
    highlightFields: string[];
    searchFields: string[];
    filter: string;
    sort: string[];
    skip: number;
    count: number;
    collection: string;
    facetCount: number;
    groupBy?: string;
    groupCount: number;
    typoTolerance: number;
    [props: string]: any;
}
