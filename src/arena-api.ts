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
        __typename
        ... on Link {
          id
          source_url
          href
          title
          image_url
          connections(filter: ALL, per: $connectionsPerBlock, page: 1) {
            user {
              name
              slug
            }
            channel {
              user {
                name
                slug
              }
              title
              slug
              added_to_at
              visibility_name
            }
          }
        }
        ... on Image {
          id
          href
          title
          image_url
          source {
            url
            title
          }
          connections(filter: ALL, per: $connectionsPerBlock, page: 1) {
            user { name slug }
            channel {
              user { name slug }
              title
              slug
              added_to_at
              visibility_name
            }
          }
        }
        ... on Text {
          id
          href
          title
          source {
            url
            title
          }
          connections(filter: ALL, per: $connectionsPerBlock, page: 1) {
            user { name slug }
            channel {
              user { name slug }
              title
              slug
              added_to_at
              visibility_name
            }
          }
        }
        ... on Embed {
          id
          href
          title
          source {
            url
            title
          }
          connections(filter: ALL, per: $connectionsPerBlock, page: 1) {
            user { name slug }
            channel {
              user { name slug }
              title
              slug
              added_to_at
              visibility_name
            }
          }
        }
        ... on Attachment {
          id
          href
          title
          source {
            url
            title
          }
          connections(filter: ALL, per: $connectionsPerBlock, page: 1) {
            user { name slug }
            channel {
              user { name slug }
              title
              slug
              added_to_at
              visibility_name
            }
          }
        }
        ... on Channel {
          id
          slug
          title
          visibility_name
          counts {
            contents
          }
          owner {
            ... on User {
              name
              slug
            }
            ... on Group {
              name
              slug
            }
          }
        }
      }
      __typename
    }
    __typename
  }
}
`;

// Types for Arena API responses
interface Channel { // Keep Channel as it's used in the new connections structure
  id?: string | number;
  title: string;
  slug: string;
  added_to_at: string; // Keep as it's part of the new connections structure
  visibility_name: 'PUBLIC' | 'CLOSED' | 'PRIVATE';
  user: User; // Channel has a user associated with it
  counts?: {
    contents: number;
  };
  owner?: User;
}

interface User { // Add User interface for the new connections structure
  name: string;
  slug: string;
}

interface ConnectionInResult { // Renamed from Connection to avoid conflict if a global Connection type exists
  user: User;
  channel: Channel;
}

interface SearchResult { // Keep SearchResult, but update its potential structure
  id?: string | number;
  __typename: string;
  source_url?: string; // from 'Link' type in query
  source?: {
    url?: string;
    title?: string;
  };
  href?: string;       // from 'Link' type in query
  title?: string;      // from 'Link' type in query
  slug?: string;       // from 'Channel' type in query
  visibility_name?: string; // from 'Channel' type in query
  counts?: {
    contents: number;
  };
  owner?: User;
  connections?: ConnectionInResult[]; // from 'Link' type in query
  image_url?: string; // from 'Link' type in query
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

// Fetch search results from Arena API (no caching - handled by arena-cache.ts)
export async function getArenaSearchResults(url: string, options?: {
  appToken?: string,
  authToken?: string,
  page?: number,
  per?: number,
  connectionsPerBlock?: number,
}): Promise<{
  total: number;
  results: SearchResult[];
}> {
  try {
    const variables = {
      url: url,
      page: options?.page || 1,
      per: options?.per || 25,
      connectionsPerBlock: options?.connectionsPerBlock || 50
    };

    const result = await arena<any>(SEARCH_RESULTS_QUERY, variables, options);

    return {
      total: result.searches.advanced.total || 0,
      results: result.searches.advanced.results || []
    };
  } catch (error) {
    console.error('Error getting Arena search results:', error);
    throw error;
  }
}