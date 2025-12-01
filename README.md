# @sparq/analytics-js

JavaScript/TypeScript client for Sparq Analytics. Track search queries, user events, and analytics data in your web applications.

## Installation

```bash
npm install @sparq/analytics-js
```

## Usage

### Initialize the client

```javascript
import StAnalyticsClient from '@sparq/analytics-js';

const analytics = new StAnalyticsClient('your-app-id', 'your-search-token');
```

### Set a custom user ID (optional)

```javascript
analytics.setUser('user-123');
```

### Set global properties

Add properties that will be included with every event:

```javascript
analytics.setGlobalProps({
  platform: 'web',
  version: '1.0.0'
});
```

### Track search queries

```javascript
analytics.searchQuery(searchResponse, 'title', 'collection-id');
```

### Track empty search results

```javascript
analytics.emptySearchResults(searchResponse, isFilterApplied, 'collection-id');
```

### Send custom events

```javascript
analytics.sendEvent('event-name', {
  key: 'value'
}, 'collection-id');
```

## API Reference

### `new StAnalyticsClient(appUniqueId, searchToken)`

Creates a new analytics client instance.

- `appUniqueId` - Your application's unique identifier
- `searchToken` - Your Sparq search token for authentication

### `setUser(userId)`

Sets a custom user ID for tracking. Returns the client instance for chaining.

### `setGlobalProps(properties)`

Sets global properties that will be merged with all event data.

### `sendEvent(eventName, eventData, collectionUniqueId?)`

Sends a custom analytics event.

- `eventName` - Name of the event
- `eventData` - Object containing event data
- `collectionUniqueId` - Optional collection identifier

### `searchQuery(searchResponse, label, collectionUniqueId?)`

Tracks a search query event with results.

- `searchResponse` - The search response object
- `label` - The field to use as the result label
- `collectionUniqueId` - Optional collection identifier

### `emptySearchResults(searchResponse, isFilterApplied, collectionUniqueId?)`

Tracks when a search returns no results.

- `searchResponse` - The search response object
- `isFilterApplied` - Whether filters were applied to the search
- `collectionUniqueId` - Optional collection identifier

## License

MIT
