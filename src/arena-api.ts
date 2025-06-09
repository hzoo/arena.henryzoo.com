// Arena API GraphQL queries - using the full query structure from are.na
const SEARCH_RESULTS_QUERY = `
query LinkMentions($url: String!, $per: Int, $page: Int, $connectionsPerBlock: Int) {
  searches {
    advanced(
      term: { facet: $url }
      fields: { facets: URL }
      order: { facet: SCORE, dir: DESC },
      per: $per
      page: $page
    ) {
      total
      results {
        ... on Link {
          source_url
          href
          connections(filter: EXCLUDE_OWN, per: $connectionsPerBlock, page: 1) {
            user {
              name
              slug
            }
            channel {
              title
              slug
              added_to_at
            }
          }
        }
        __typename
      }
      __typename
    }
    __typename
  }
}
`;

const BLOCK_ALL_CONNECTIONS_QUERY = `
query BlockAllConnections($blockId: ID!, $per: Int) {
  block(id: $blockId) {
    __typename
    ... on Konnectable {
      id
      connections(per: $per, page: 1, filter: EXCLUDE_OWN) {
        # We assume no explicit totalCount or pagination info is returned here based on prior examples,
        # so we'll fetch a large 'per' value and get all on page 1.
        user {
          name
          slug
        }
        channel {
          title
          slug
          added_to_at
        }
      }
    }
  }
}
`;

// Types for Arena API responses
interface Channel { // Keep Channel as it's used in the new connections structure
  title: string;
  slug: string;
  added_to_at: string; // Keep as it's part of the new connections structure
  // Removed fields not present in the new connections structure: id, href, visibility_name, counts, owner
}

interface User { // Add User interface for the new connections structure
  name: string;
  slug: string;
}

interface ConnectionInResult { // Renamed from Connection to avoid conflict if a global Connection type exists
  user: User;
  channel: Channel;
  // Removed fields not present in the new connections structure: id, created_at
}

interface SearchResult { // Keep SearchResult, but update its potential structure
  __typename: string;
  source_url?: string; // from 'Link' type in query
  href?: string;       // from 'Link' type in query
  connections?: ConnectionInResult[]; // from 'Link' type in query
  // Removed fields not present in the new query: id, title, source
}

// Core Arena API function - using exact configuration from are.na
async function arena<T>(query: string, variables: any, options?: { 
  appToken?: string, 
  authToken?: string 
}): Promise<T> {
  const headers: Record<string, string> = {
    "Accept": "multipart/mixed, application/graphql-response+json, application/graphql+json, application/json",
    "Accept-Language": "en-US,en;q=0.5",
    "content-type": "application/json",
    "Sec-GPC": "1",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "Priority": "u=4"
  };

  // Add auth tokens if provided
  if (options?.appToken) {
    headers["x-app-token"] = options.appToken;
  }
  if (options?.authToken) {
    headers["x-auth-token"] = options.authToken;
  }

  const operationName = query.match(/query\s+(\w+)/)?.[1];
  
  const res = await fetch("https://api.are.na/graphql", {
    credentials: "omit",
    headers,
    referrer: "https://www.are.na/",
    body: JSON.stringify({ 
      query, 
      variables,
      ...(operationName && { operationName })
    }),
    method: "POST",
    mode: "cors"
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Arena API error: ${res.status} - ${errorText}`);
  }
  
  const result = await res.json();
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }
  
  return result.data;
}

// Main function to search for blocks containing a URL
export async function searchBlocksForUrl(url: string, options?: { 
  appToken?: string, 
  authToken?: string,
  page?: number,
  per?: number 
}): Promise<any> {
  try {
    const variables = {
      term: { facet: url },
      where: [{ facet: "ALL" }],
      what: { facets: ["ALL"] },
      fields: { facets: ["URL"] },
      order: { facet: "SCORE", dir: "DESC" },
      page: options?.page || 1,
      per: options?.per || 24
    };

    const result = await arena<any>(SEARCH_RESULTS_QUERY, variables, options);
    return result.searches.advanced;
  } catch (error) {
    console.error('Error searching for blocks:', error);
    throw error;
  }
}

// Simplified function that just returns search results (no placements)
export async function getArenaSearchResults(url: string, options?: {
  appToken?: string,
  authToken?: string,
  page?: number,
  per?: number,
  connectionsPerBlock?: number // Added new option
}): Promise<{
  total: number;
  results: SearchResult[];
}> {
  const cacheKey = `arena_search_cache_${url}_${options?.page || 1}_${options?.per || 25}`;
  const cacheDuration = 60 * 1000;

  try {
    const cachedItem = localStorage.getItem(cacheKey);
    if (cachedItem) {
      const { timestamp, data } = JSON.parse(cachedItem);
      if (Date.now() - timestamp < cacheDuration) {
        console.log('Returning cached results for:', url, options);
        return data;
      } else {
        // Cache expired
        localStorage.removeItem(cacheKey);
      }
    }
  } catch (e) {
    console.warn('Error reading from cache:', e);
    // Proceed to fetch if cache read fails
  }

  try {
    const variables = {
      url: url, 
      page: options?.page || 1,
      per: options?.per || 25,
      connectionsPerBlock: options?.connectionsPerBlock || 50 // Default to 50 connections
    };

    const result = await arena<any>(SEARCH_RESULTS_QUERY, variables, options);

    const responseData = {
      total: result.searches.advanced.total || 0,
      results: result.searches.advanced.results || []
    };

    try {
      localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: responseData }));
    } catch (e) {
      console.warn('Error saving to cache:', e);
    }

    return responseData;
  } catch (error) {
    console.error('Error getting Arena search results:', error);
    throw error;
  }
}

// New function to get all connections for a single block
export async function getBlockAllConnections(blockHref: string, queryOptions?: { 
  appToken?: string, 
  authToken?: string,
  per?: number
}): Promise<any> { // Adjust 'any' to a more specific type if block structure is well-defined
  try {
    const blockId = blockHref.split('/').pop();
    if (!blockId) {
      throw new Error('Invalid blockHref, could not extract block ID');
    }

    const variables = {
      blockId: blockId,
      per: queryOptions?.per || 500 // Fetch up to 500 connections by default
    };

    const result = await arena<any>(BLOCK_ALL_CONNECTIONS_QUERY, variables, queryOptions);
    return result.block; // This would contain the connections array
  } catch (error) {
    console.error(`Error fetching all connections for block ${blockHref}:`, error);
    throw error;
  }
}
