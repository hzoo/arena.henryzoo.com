// Arena API GraphQL queries - using the full query structure from are.na
const SEARCH_RESULTS_QUERY = `
query SearchResultsQuery($term: Term, $where: [Where!], $what: What, $fields: Fields, $order: Order, $extensions: [ExtensionsEnum!], $page: Int, $per: Int, $before: String, $after: String) {
  searches {
    advanced(
      term: $term
      where: $where
      what: $what
      fields: $fields
      order: $order
      extensions: $extensions
      per: $per
      page: $page
      before: $before
      after: $after
    ) {
      total
      results {
        ...SearchResultsResultFragment
        __typename
      }
      __typename
    }
    __typename
  }
}
fragment SearchResultsResultFragment on SsearchResult {
  __typename
  ...GridCellChannelFragment
  ...GridCellBlockFragment
  ...GridCellUserFragment
  ...GridCellGroupFragment
  ... on Model {
    id
    __typename
  }
}
fragment GridCellChannelFragment on Channel {
  ...GridCellChannelContentFragment
  id
  href
  created_at(relative: true)
  counts {
    contents
    __typename
  }
}
fragment GridCellChannelContentFragment on Channel {
  id
  title
  added_to_at(relative: true)
  visibility_name
  counts {
    contents
    __typename
  }
  owner {
    __typename
    ... on User {
      id
      name
      __typename
    }
    ... on Group {
      id
      name
      __typename
    }
  }
}
fragment GridCellBlockFragment on Konnectable {
  __typename
  ...GridCellPendingFragment
  ...GridCellTextFragment
  ...GridCellImageFragment
  ...GridCellLinkFragment
  ...GridCellEmbedFragment
  ...GridCellAttachmentFragment
}
fragment GridCellPendingFragment on PendingBlock {
  id
  iso_created_at: created_at(format: "%Y-%m-%dT%H:%M:%S.%LZ")
  href
}
fragment GridCellTextFragment on Text {
  ...GridCellTextContentFragment
  id
  href
  title
  counts {
    comments
    __typename
  }
}
fragment GridCellTextContentFragment on Text {
  id
  truncatedContent: content(format: HTML, truncate: 1000, no_links: true)
  sub_type {
    __typename
    ... on HexColor {
      value
      __typename
    }
  }
}
fragment GridCellImageFragment on Image {
  ...GridCellImageContentFragment
  id
  href
  title
  counts {
    comments
    __typename
  }
  source {
    url
    __typename
  }
}
fragment GridCellImageContentFragment on Image {
  id
  alt_text
  resized_image {
    ...GridCellResizedImageFragment
    __typename
  }
}
fragment GridCellResizedImageFragment on ResizedImage {
  id
  blurhash
  grid_cell_resized_image: resized(
    width: 300
    height: 300
    quality: 75
    flatten: true
  ) {
    id
    width
    height
    src_1x
    src_2x
    __typename
  }
}
fragment GridCellLinkFragment on Link {
  ...GridCellLinkContentFragment
  id
  href
  title
  source {
    url
    __typename
  }
  counts {
    comments
    __typename
  }
}
fragment GridCellLinkContentFragment on Link {
  id
  resized_image {
    ...GridCellResizedImageFragment
    __typename
  }
}
fragment GridCellEmbedFragment on Embed {
  ...GridCellEmbedContentFragment
  id
  title
  href
  source {
    url
    provider_name
    __typename
  }
  counts {
    comments
    __typename
  }
}
fragment GridCellEmbedContentFragment on Embed {
  id
  resized_image {
    ...GridCellResizedImageFragment
    id
    __typename
  }
}
fragment GridCellAttachmentFragment on Attachment {
  ...GridCellAttachmentContentFragment
  id
  title
  href
  counts {
    comments
    __typename
  }
}
fragment GridCellAttachmentContentFragment on Attachment {
  id
  title
  file_content_type
  file_size
  file_extension
  resized_image {
    ...GridCellResizedImageFragment
    id
    __typename
  }
}
fragment GridCellUserFragment on User {
  id
  slug
  name
  href
  initials
  avatar
}
fragment GridCellGroupFragment on Group {
  id
  slug
  name
  href
  initials
  avatar
}
`;

// Types for Arena API responses
interface Channel {
  id: string;
  title: string;
  href: string;
}

interface SearchResult {
  __typename: string;
  id: string;
  title?: string;
  href?: string;
  source?: {
    url: string;
  };
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
  per?: number 
}): Promise<{
  total: number;
  results: any[];
}> {
  try {
    const searchData = await searchBlocksForUrl(url, options);
    return {
      total: searchData.total || 0,
      results: searchData.results || []
    };
  } catch (error) {
    console.error('Error getting Arena search results:', error);
    throw error;
  }
}
