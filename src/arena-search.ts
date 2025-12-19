import { getArenaSearchResults } from './arena-api';

// URL category type for sorting results
type UrlCategory = 'exact' | 'subpath' | 'subdomain' | 'channel' | 'other';

// Truncate URL for display, especially stripping query params
function truncateUrlForDisplay(url: string, maxLength: number = 50): string {
  if (!url) return '';

  // Remove protocol and www
  let display = url.replace(/^https?:\/\//, '').replace(/^www\./, '');

  // If it has query params and is long, strip them
  const queryIndex = display.indexOf('?');
  if (queryIndex > 0 && display.length > maxLength) {
    display = display.substring(0, queryIndex);
  }

  // If still too long, truncate with ellipsis
  if (display.length > maxLength) {
    display = display.substring(0, maxLength - 1) + '…';
  }

  return display;
}

// Truncate title for display
function truncateTitle(title: string, maxLength: number = 80): string {
  if (!title) return '';

  // If title looks like a URL or encoded URL, truncate more aggressively
  if (title.startsWith('http') || title.startsWith('url=') || title.includes('%2F')) {
    return truncateUrlForDisplay(title, 50);
  }

  // Regular title truncation
  if (title.length > maxLength) {
    return title.substring(0, maxLength - 1) + '…';
  }

  return title;
}

// Classify a URL relative to the search term
function classifyUrl(sourceKey: string, searchTerm: string): UrlCategory {
  // Channels are their own category
  if (sourceKey.startsWith('channel:')) return 'channel';

  // Parse the source URL
  try {
    const url = new URL(sourceKey.startsWith('http') ? sourceKey : `http://${sourceKey}`);
    const hostname = url.hostname.replace(/^www\./, '');
    const searchHost = searchTerm.replace(/^www\./, '').split('/')[0];

    // Exact match: hostname equals search term, no meaningful path
    if (hostname === searchHost && (url.pathname === '/' || url.pathname === '')) {
      return 'exact';
    }

    // Subpath: hostname matches, has path
    if (hostname === searchHost) {
      return 'subpath';
    }

    // Subdomain: hostname ends with .searchHost
    if (hostname.endsWith(`.${searchHost}`)) {
      return 'subdomain';
    }

    return 'other';
  } catch {
    return 'other';
  }
}

// Sort grouped results by category priority
function sortGroupedResults(
  groups: { [key: string]: any[] },
  searchTerm: string
): Array<{ key: string; results: any[]; category: UrlCategory }> {
  const entries = Object.entries(groups);

  // Classify each group
  const classified = entries.map(([key, results]) => ({
    key,
    results,
    category: classifyUrl(key, searchTerm)
  }));

  // Sort by category priority, then alphabetically
  const priority: Record<UrlCategory, number> = {
    exact: 0,
    subpath: 1,
    channel: 2,
    subdomain: 3,
    other: 4
  };

  classified.sort((a, b) => {
    if (priority[a.category] !== priority[b.category]) {
      return priority[a.category] - priority[b.category];
    }
    return a.key.localeCompare(b.key);
  });

  return classified;
}

// Arena Search Page functionality
document.addEventListener('DOMContentLoaded', () => {
  setupArenaSearch();
});

function setupArenaSearch() {
  const urlInput = document.getElementById('arena-url-input') as HTMLInputElement;
  const authTokenInput = document.getElementById('arena-auth-token-input') as HTMLInputElement;
  const perPageInput = document.getElementById('arena-per-page-input') as HTMLInputElement;
  const perPageToggle = document.querySelector('.per-page-toggle');
  const pageInput = document.getElementById('arena-page-input') as HTMLInputElement;
  const searchBtn = document.getElementById('arena-search-btn') as HTMLButtonElement;
  const loadingDiv = document.getElementById('arena-loading') as HTMLDivElement;
  const errorDiv = document.getElementById('arena-error') as HTMLDivElement;
  const resultsDiv = document.getElementById('arena-results') as HTMLDivElement;
  const summaryDiv = document.getElementById('arena-summary') as HTMLDivElement;
  const searchResultsDiv = document.getElementById('arena-search-results') as HTMLDivElement;
  const paginationDiv = document.getElementById('arena-pagination') as HTMLDivElement;

  // Auth token popup elements
  const authTokenBtn = document.getElementById('auth-token-btn') as HTMLButtonElement;
  const authTokenPopup = document.getElementById('auth-token-popup') as HTMLDivElement;
  const closeAuthPopup = document.getElementById('close-auth-popup') as HTMLButtonElement;
  const saveAuthToken = document.getElementById('save-auth-token') as HTMLButtonElement;
  const clearAuthToken = document.getElementById('clear-auth-token') as HTMLButtonElement;

  // Subdomain filter checkbox
  const showSubdomainsCheckbox = document.getElementById('show-subdomains') as HTMLInputElement;

  let currentPreviewPopup: HTMLDivElement | null = null;

  // Create lightbox element
  const lightbox = createLightbox();
  document.body.appendChild(lightbox);

  if (!urlInput || !searchBtn) return;

  // Load saved auth token from localStorage
  loadSavedTokens();
  // Update auth button appearance based on token state
  updateAuthButtonState();
  // Load saved subdomain preference
  loadSubdomainPreference();

  const pathName = window.location.pathname;
  let initialUrlFromPath = '';

  if (pathName && pathName !== '/' && pathName.length > 1) {
    // Extract search term from path, removing leading '/' and decoding
    initialUrlFromPath = decodeURIComponent(pathName.substring(1));
  }

  if (initialUrlFromPath) {
    urlInput.value = initialUrlFromPath;
    console.log(`URL from path: "${initialUrlFromPath}", performing initial search.`);
    performSearch(); // Perform search with the URL from the path
  } else {
    // No URL from path, pick random default URL and auto-search
    const defaultUrls = ['henryzoo.com', 'hopeinsource.com'];
    urlInput.value = defaultUrls[Math.floor(Math.random() * defaultUrls.length)];
    performSearch();
  }

  // Save auth token to localStorage when it changes
  authTokenInput.addEventListener('input', () => {
    saveToken('auth_token', authTokenInput.value);
    updateAuthButtonState();
  });

  // Auth token popup handlers
  authTokenBtn.addEventListener('click', () => {
    authTokenPopup.classList.remove('hidden');
    authTokenInput.focus();
  });

  closeAuthPopup.addEventListener('click', () => {
    authTokenPopup.classList.add('hidden');
  });

  // Close on backdrop click
  authTokenPopup.querySelector('.modal-backdrop')?.addEventListener('click', () => {
    authTokenPopup.classList.add('hidden');
  });

  saveAuthToken.addEventListener('click', () => {
    saveToken('auth_token', authTokenInput.value);
    updateAuthButtonState();
    authTokenPopup.classList.add('hidden');
  });

  clearAuthToken.addEventListener('click', () => {
    authTokenInput.value = '';
    saveToken('auth_token', '');
    updateAuthButtonState();
    authTokenPopup.classList.add('hidden');
  });

  // Handle search
  searchBtn.addEventListener('click', () => performSearch());

  // Handle Enter key in URL input
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });

  // Handle Enter key in page input
  pageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });

  // Handle subdomain checkbox change
  if (showSubdomainsCheckbox) {
    showSubdomainsCheckbox.addEventListener('change', () => {
      localStorage.setItem('arena_show_subdomains', showSubdomainsCheckbox.checked.toString());
      // Re-render if we have results
      if (!resultsDiv.classList.contains('hidden')) {
        performSearch();
      }
    });
  }

  // Handle per-page toggle buttons
  if (perPageToggle) {
    perPageToggle.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('per-page-btn')) {
        // Update active state
        perPageToggle.querySelectorAll('.per-page-btn').forEach(btn => btn.classList.remove('active'));
        target.classList.add('active');
        // Update hidden input value
        const value = target.dataset.value || '25';
        perPageInput.value = value;
      }
    });
  }

  // Handle example link clicks
  const exampleLinks = document.querySelectorAll('.example-link');
  exampleLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const url = (link as HTMLElement).dataset.url;
      if (url) {
        urlInput.value = url;
        pageInput.value = '1'; // Reset to page 1
        performSearch();
      }
    });
  });

  function loadSubdomainPreference() {
    if (!showSubdomainsCheckbox) return;
    const savedPref = localStorage.getItem('arena_show_subdomains');
    if (savedPref !== null) {
      showSubdomainsCheckbox.checked = savedPref === 'true';
    }
  }

  function getShowSubdomainsPreference(): boolean {
    return showSubdomainsCheckbox?.checked ?? true;
  }

  function loadSavedTokens() {
    const savedAuthToken = localStorage.getItem('arena_auth_token');

    if (savedAuthToken) {
      authTokenInput.value = savedAuthToken;
    }
  }

  function updateAuthButtonState() {
    const hasAuthToken = authTokenInput.value.trim().length > 0;

    if (hasAuthToken) {
      authTokenBtn.classList.add('has-token');
      authTokenBtn.title = 'API authenticated';
    } else {
      authTokenBtn.classList.remove('has-token');
      authTokenBtn.title = 'API authentication';
    }
  }

  function saveToken(key: string, value: string) {
    if (value.trim()) {
      localStorage.setItem(`arena_${key}`, value.trim());
    } else {
      localStorage.removeItem(`arena_${key}`);
    }
  }

  function showTokenInstructions() {
    authTokenPopup.classList.remove('hidden');
    authTokenInput.focus();
  }

  async function performSearch(cacheDuration: number = 60 * 1000) {
    const urlInputVal = urlInput.value.trim();
    if (!urlInputVal) {
      showError('Please enter a URL to search for');
      return;
    }

    let url = urlInputVal;
    if (url.startsWith('https://')) {
      url = url.substring('https://'.length);
    } else if (url.startsWith('http://')) {
      url = url.substring('http://'.length);
    }

    // Remove www.
    if (url.startsWith('www.')) {
      url = url.substring('www.'.length);
    }

    // Remove trailing slash
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

    // Update URL for deep linking (without adding to history)
    history.replaceState(null, '', `/${encodeURIComponent(url)}`);

    showLoading(true);
    hideError();
    hideResults();

    const options: {
      appToken: string;
      authToken?: string;
      page?: number;
      per?: number;
      cacheDuration?: number;
    } = {
      appToken: import.meta.env.VITE_ARENA_APP_TOKEN,
      page: parseInt(pageInput.value) || 1,
      per: parseInt(perPageInput.value) || 24,
      cacheDuration: cacheDuration
    };

    const authToken = authTokenInput.value.trim();
    if (authToken) {
      options.authToken = authToken;
    }

    try {
      const searchResults = await getArenaSearchResults(url, options);
      await showResults(url, searchResults, options);
      // Update page title with search term
      document.title = `${url} - Are.na Search`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        showError(`Rate limited! Add your auth token above to increase limits. Error: ${errorMessage}`);
        showTokenInstructions();
      } else {
        showError(`Error: ${errorMessage}`);
      }
      // Reset title on error
      document.title = 'Are.na Search';
    } finally {
      showLoading(false);
    }
  }

  function showLoading(show: boolean) {
    if (show) {
      loadingDiv.classList.remove('hidden');
      searchBtn.disabled = true;
      searchBtn.textContent = '...';
    } else {
      loadingDiv.classList.add('hidden');
      searchBtn.disabled = false;
      searchBtn.textContent = '→';
    }
  }

  function showError(message: string) {
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    errorDiv.classList.add('fade-in');
  }

  function hideError() {
    errorDiv.classList.add('hidden');
  }

  function hideResults() {
    resultsDiv.classList.add('hidden');
  }

  async function showResults(url: string, searchResults: { total: number; results: any[] }, options: any) {
    // Show summary
    const currentPage = options.page || 1;
    const perPage = options.per || 24;
    const startIndex = (currentPage - 1) * perPage + 1;
    const endIndex = Math.min(startIndex + searchResults.results.length - 1, searchResults.total);

    // Group results by source URL for consolidation
    // Filter results to hide those that don't make sense (missing source info and not a channel)
    const filteredResults = searchResults.results.filter(result => {
      if (result.__typename === 'Channel') return true;
      const hasSource = result.source_url || result.source?.url;
      // If requested to hide it, we could be even more strict here.
      // For now, let's keep it if it has a source OR if it's a block we can at least link to Are.na
      // But the user specifically said "hide it since that doesnt make sense" for /undefined links.
      return !!hasSource; 
    });

    const groupedResults = groupResultsByUrl(filteredResults);
    const totalGroups = Object.keys(groupedResults).length;

    // Minimal summary - just counts (add + for large totals that hit API limit)
    const totalDisplay = searchResults.total >= 10000 ? `${searchResults.total}+` : searchResults.total;
    summaryDiv.innerHTML = `
      <div class="summary-minimal">
        <span class="summary-stats">${totalDisplay} blocks</span>
        ${totalGroups !== searchResults.results.length ? `<span class="summary-divider">·</span><span class="summary-stats">${totalGroups} sources</span>` : ''}
      </div>
    `;

    // Show pagination
    showPagination(searchResults.total, currentPage, perPage);

    // Clear previous results
    searchResultsDiv.innerHTML = '';

    if (searchResults.results.length === 0) {
      searchResultsDiv.innerHTML = `
        <div class="col-span-full p-6 border border-[#E8E8E8] rounded-[3px] text-center text-[#6B6B6B]">
          <div class="text-xl mb-2">¯\\_(ツ)_/¯</div>
          <p class="text-sm">no results found</p>
        </div>
      `;
      // Update title for no results
      document.title = `${url} - Are.na Search`;
    } else {
      // Sort and categorize results
      const sortedResults = sortGroupedResults(groupedResults, url);
      const showSubdomains = getShowSubdomainsPreference();

      // Track subdomain section for collapsible header
      let subdomainSectionStarted = false;
      let subdomainContainer: HTMLDivElement | null = null;

      // Track other section for collapsible header
      let otherSectionStarted = false;
      let otherContainer: HTMLDivElement | null = null;

      sortedResults.forEach(({ key: sourceUrlKey, results, category }) => {
        // Skip subdomains if hidden
        if (category === 'subdomain' && !showSubdomains) return;

        // Add subdomain section header (collapsible)
        if (category === 'subdomain' && !subdomainSectionStarted) {
          subdomainSectionStarted = true;

          // Create section header
          const sectionHeader = document.createElement('div');
          sectionHeader.className = 'col-span-full subdomain-section-header';
          sectionHeader.innerHTML = `
            <button class="subdomain-toggle flex items-center gap-2 text-xs text-[#6B6B6B] hover:text-[#333] w-full py-2">
              <span class="toggle-icon transition-transform">▼</span>
              <span>Subdomains</span>
            </button>
          `;
          searchResultsDiv.appendChild(sectionHeader);

          // Create container for subdomain results
          subdomainContainer = document.createElement('div');
          subdomainContainer.className = 'subdomain-results-container col-span-full grid grid-cols-1 lg:grid-cols-2 gap-3';
          searchResultsDiv.appendChild(subdomainContainer);

          // Add toggle handler
          const toggleBtn = sectionHeader.querySelector('.subdomain-toggle');
          if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
              const icon = sectionHeader.querySelector('.toggle-icon');
              if (subdomainContainer?.classList.contains('hidden')) {
                subdomainContainer.classList.remove('hidden');
                if (icon) icon.textContent = '▼';
              } else {
                subdomainContainer?.classList.add('hidden');
                if (icon) icon.textContent = '▶';
              }
            });
          }
        }

        // Add other section header (collapsible, starts collapsed)
        if (category === 'other' && !otherSectionStarted) {
          otherSectionStarted = true;

          // Create section header
          const sectionHeader = document.createElement('div');
          sectionHeader.className = 'col-span-full subdomain-section-header';
          sectionHeader.innerHTML = `
            <button class="subdomain-toggle flex items-center gap-2 text-xs text-[#6B6B6B] hover:text-[#333] w-full py-2">
              <span class="toggle-icon transition-transform">▶</span>
              <span>Other</span>
            </button>
          `;
          searchResultsDiv.appendChild(sectionHeader);

          // Create container for other results (starts hidden)
          otherContainer = document.createElement('div');
          otherContainer.className = 'subdomain-results-container col-span-full grid grid-cols-1 lg:grid-cols-2 gap-3 hidden';
          searchResultsDiv.appendChild(otherContainer);

          // Add toggle handler
          const toggleBtn = sectionHeader.querySelector('.subdomain-toggle');
          if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
              const icon = sectionHeader.querySelector('.toggle-icon');
              if (otherContainer?.classList.contains('hidden')) {
                otherContainer.classList.remove('hidden');
                if (icon) icon.textContent = '▼';
              } else {
                otherContainer?.classList.add('hidden');
                if (icon) icon.textContent = '▶';
              }
            });
          }
        }

        const groupDiv = document.createElement('div');
        groupDiv.className = 'result-group p-3';

        // Pass category for badge rendering
        const content = renderGroupedResult(sourceUrlKey, results, category);
        groupDiv.innerHTML = content;

        // Append to appropriate container
        if (category === 'subdomain' && subdomainContainer) {
          subdomainContainer.appendChild(groupDiv);
        } else if (category === 'other' && otherContainer) {
          otherContainer.appendChild(groupDiv);
        } else {
          searchResultsDiv.appendChild(groupDiv);
        }
      });

      // Add event listeners for image previews
      const blockLinksWithPreview = searchResultsDiv.querySelectorAll('.block-link-with-preview');
      blockLinksWithPreview.forEach(link => {
        link.addEventListener('mouseover', handleBlockPreviewMouseOver);
        link.addEventListener('mouseout', handleBlockPreviewMouseOut);
      });

      // Add event listeners for block ID toggles
      const blocksToggles = searchResultsDiv.querySelectorAll('.blocks-toggle');
      blocksToggles.forEach(toggle => {
        toggle.addEventListener('click', handleBlocksToggleClick);
      });
    }

    resultsDiv.classList.remove('hidden');
    resultsDiv.classList.add('fade-in');
  }

  function handleBlocksToggleClick(event: Event) {
    const toggle = event.currentTarget as HTMLElement;
    const targetId = toggle.dataset.target;
    if (!targetId) return;

    const blocksList = document.getElementById(targetId);
    if (!blocksList) return;

    const isExpanded = toggle.classList.contains('expanded');

    if (isExpanded) {
      toggle.classList.remove('expanded');
      blocksList.classList.remove('expanded');
    } else {
      toggle.classList.add('expanded');
      blocksList.classList.add('expanded');
    }
  }

  function normalizeUrl(url: string): string {
    if (!url) return '';
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `http://${url}`);
      let pathname = urlObj.pathname;
      // Remove trailing slash if not the root path
      if (pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }
      // Consistent protocol, remove www, sort query params (optional, can be complex)
      return `${urlObj.hostname.replace(/^www./, '')}${pathname}`;
    } catch (e) {
      // Fallback for invalid URLs or non-HTTP URLs
      let fallback = url;

      // Attempt to remove www. prefix
      // Check for http://www. or https://www. first
      if (fallback.toLowerCase().startsWith('http://www.')) {
        fallback = 'http://' + fallback.substring('http://www.'.length);
      } else if (fallback.toLowerCase().startsWith('https://www.')) {
        fallback = 'https://' + fallback.substring('https://www.'.length);
      } else if (fallback.toLowerCase().startsWith('www.')) { // Then check for just www.
        fallback = fallback.substring('www.'.length);
      }

      // Remove trailing slash
      if (fallback.endsWith('/')) {
        fallback = fallback.slice(0, -1);
      }
      return fallback;
    }
  }

  function resolveResultUrl(result: any): string {
    if (result.__typename === 'Channel') {
      return `https://are.na/channel/${result.slug || result.id}`;
    }
    
    // Check various sources for a URL
    const url = result.source_url || result.source?.url;
    if (url) return url;
    
    // Fallback to Are.na block page if no source URL is found
    if (result.href) {
      return `https://are.na${result.href}`;
    }
    
    return '';
  }

  function groupResultsByUrl(results: any[]): { [key: string]: any[] } {
    const groups: { [key: string]: any[] } = {};

    results.forEach(result => {
      let key: string;

      if (result.__typename === 'Channel') {
        // Channels are their own group
        key = `channel:${result.id || result.slug}`;
      } else {
        // Group blocks by their normalized source URL
        const resolvedUrl = resolveResultUrl(result);
        
        // If it's a block without a source URL, we still want to group it 
        // if it has an Are.na href, but we should probably filter these out 
        // earlier if we only want "URL references".
        key = normalizeUrl(resolvedUrl) || `${result.__typename}:${result.id || Math.random()}`;
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(result);
    });

    return groups;
  }

  function renderGroupedResult(sourceKey: string, results: any[], category?: UrlCategory): string {
    const firstResult = results[0];
    const isChannel = firstResult.__typename === 'Channel';
    const isMultipleBlocksWithSameSource = results.length > 1 && !isChannel;
    const blockHref = firstResult.href || ''; // Get block href for connections

    // Exact match badge HTML
    const exactBadge = category === 'exact'
      ? '<span class="exact-match-badge">Exact match</span>'
      : '';

    if (isChannel) {
      // Render channel
      return `
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <span class="block-type-badge">channel</span>
            ${exactBadge}
            ${firstResult.visibility_name ? `<span class="text-xs ${getVisibilityClasses(firstResult.visibility_name)}">${firstResult.visibility_name.toLowerCase()}</span>` : ''}
          </div>

          <h3 class="font-bold leading-tight">
            <a href="https://are.na/${firstResult.slug || `channel/${firstResult.id}`}" target="_blank"
               class="hover:text-[#6B6B6B] transition-colors">
              ${firstResult.title || 'untitled channel'}
            </a>
          </h3>

          ${firstResult.owner ? `
            <p class="text-xs text-[#6B6B6B]">
              by ${firstResult.owner.name || 'unknown'}
            </p>
          ` : ''}

          <div class="flex items-center justify-between text-xs text-[#6B6B6B]">
            ${firstResult.counts?.contents ? `<span>${firstResult.counts.contents} item${firstResult.counts.contents !== 1 ? 's' : ''}</span>` : '<span></span>'}
            <span class="font-mono">#${firstResult.id}</span>
          </div>
        </div>
      `;
    } else {
      // Render a single block or a group of blocks with the same source URL
      const resolvedUrl = resolveResultUrl(firstResult);
      const fullDisplayUrl = resolvedUrl.replace(/^https?:\/\//, '').replace(/^www\./, '');
      const displayUrl = truncateUrlForDisplay(resolvedUrl, 60);

      const rawTitle = firstResult.title ||
                          (firstResult.source?.title) ||
                          (firstResult.source_url ? new URL(firstResult.source_url).hostname : 'Untitled Block');
      const displayTitle = truncateTitle(rawTitle, 80);

      const blockType = firstResult.__typename || 'Block';
      const typeLabel = getBlockTypeLabel(blockType);

      // Consolidate connections from all blocks in the group if multiple exist
      let allGroupConnections: any[] = [];
      if (isMultipleBlocksWithSameSource) {
        results.forEach(r => {
          if (r.connections) {
            allGroupConnections = allGroupConnections.concat(r.connections);
          }
        });
      } else {
        allGroupConnections = firstResult.connections || [];
      }

      // Find first available image from any block in the group
      const previewImageUrl = results.find(r => r.image_url)?.image_url;
      const blockCount = results.length;
      const uniqueId = `blocks-${firstResult.id || Date.now()}`;

      // Thumbnail (clickable to expand) or type badge
      const thumbnailOrBadge = previewImageUrl
        ? `<button class="block-thumbnail clickable" onclick="openLightbox('${previewImageUrl}')" aria-label="View larger image">
             <img src="${previewImageUrl}" alt="" loading="lazy" />
             <span class="expand-icon">⤢</span>
           </button>`
        : `<span class="block-type-badge">${typeLabel}</span>`;

      return `
        <div class="space-y-2">
          <div class="flex items-start gap-3">
            ${thumbnailOrBadge}
            <div class="flex-1 min-w-0">
              <a href="${resolvedUrl}" target="_blank"
                 class="font-bold hover:text-[#6B6B6B] transition-colors line-clamp-2 leading-tight"
                 title="${rawTitle}">
                ${displayTitle}
              </a>
              <div class="source-url-container">
                <a href="${resolvedUrl}" target="_blank" class="source-url" title="${fullDisplayUrl}">
                  ${displayUrl || 'No source URL'}
                </a>
              </div>
            </div>
          </div>

          ${allGroupConnections && allGroupConnections.length > 0 ? `
            ${renderConnectionsForGroup(allGroupConnections, blockHref)}
          ` : `
            <div class="connections-section">
              <p class="text-xs text-[#6B6B6B] italic">no connections found</p>
            </div>
          `}

          <div class="pt-1 flex items-center justify-between">
            <div class="blocks-toggle" data-target="${uniqueId}">
              <span class="blocks-toggle-icon">›</span>
              <span>${blockCount} block${blockCount !== 1 ? 's' : ''}</span>
            </div>
            ${exactBadge}
          </div>
          <div id="${uniqueId}" class="blocks-list">
            <div class="blocks-list-inner">
              <div class="blocks-list-content flex gap-2 flex-wrap">
                ${results.map(result => {
                  if (result.href) {
                    const blockId = result.href.split('/').pop();
                    const blockPreviewImageUrl = result.image_url;
                    return `
                      <a href="https://are.na${result.href}" target="_blank"
                         class="text-xs text-[#6B6B6B] hover:text-[#333] transition-colors font-mono whitespace-nowrap ${blockPreviewImageUrl ? 'block-link-with-preview' : ''}"
                         ${blockPreviewImageUrl ? `data-preview-image-url="${blockPreviewImageUrl}"` : ''}>
                        #${blockId}
                      </a>`;
                  }
                  return '';
                }).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
    }
  }

  function renderConnectionsForGroup(connections: any[], blockHref?: string): string {
    const connectionsToRender = connections;

    if (!connectionsToRender || connectionsToRender.length === 0) {
      return '';
    }

    // Deduplicate connections by user + channel slug combination
    const uniqueConnectionsMap = new Map<string, any>();
    connectionsToRender.forEach(conn => {
      if (conn && conn.channel && conn.channel.slug && conn.channel.user && conn.channel.user.slug) {
        const key = `${conn.channel.user.slug}/${conn.channel.slug}`;
        if (!uniqueConnectionsMap.has(key)) {
          uniqueConnectionsMap.set(key, conn);
        }
      }
    });

    const uniqueConnections = Array.from(uniqueConnectionsMap.values());

    // Sort connections by date added (newest first)
    uniqueConnections.sort((a, b) => {
      const dateA = new Date(a.channel.added_to_at).getTime();
      const dateB = new Date(b.channel.added_to_at).getTime();
      return dateB - dateA;
    });

    const blockIdSuffix = blockHref ? blockHref.split('/').pop() : Date.now();

    return `
      <div id="connections-for-${blockIdSuffix}" class="connections-section">
        <div class="connections-header">
          Connections <span class="connections-count">(${uniqueConnections.length})</span>
        </div>
        <div class="connections-list">
          ${uniqueConnections.map(conn => {
            const date = new Date(conn.channel.added_to_at);
            const month = date.toLocaleDateString('en-US', { month: 'short' });
            const day = String(date.getDate()).padStart(2, '0');
            const year = String(date.getFullYear()).slice(-2);
            return `
            <div class="connection-row">
              <a href="https://are.na/channel/${conn.channel.slug}" target="_blank"
                 class="connection-title ${getVisibilityClasses(conn.channel.visibility_name)}">
                ${conn.channel.title || 'untitled'}
              </a>
              <a href="https://are.na/${conn.channel.user?.slug}" target="_blank" class="connection-user">${conn.channel.user?.name}</a>
              <span class="connection-date">${month}${day}'${year}</span>
            </div>
          `}).join('')}
        </div>
      </div>
    `;
  }

  function showPagination(total: number, currentPage: number, perPage: number) {
    const totalPages = Math.ceil(total / perPage);

    if (totalPages <= 1) {
      paginationDiv.innerHTML = '';
      return;
    }

    let paginationHTML = '';

    // Previous button
    if (currentPage > 1) {
      paginationHTML += `
        <button class="pagination-btn" onclick="changePage(${currentPage - 1})">
          prev
        </button>
      `;
    }

    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);

    if (startPage > 1) {
      paginationHTML += `
        <button class="pagination-btn" onclick="changePage(1)">1</button>
      `;
      if (startPage > 2) {
        paginationHTML += '<span class="px-1 text-[#6B6B6B] text-xs">...</span>';
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      const isActive = i === currentPage;
      paginationHTML += `
        <button class="pagination-btn ${isActive ? 'active' : ''}"
                ${isActive ? 'disabled' : `onclick="changePage(${i})"`}>
          ${i}
        </button>
      `;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        paginationHTML += '<span class="px-1 text-[#6B6B6B] text-xs">...</span>';
      }
      paginationHTML += `
        <button class="pagination-btn" onclick="changePage(${totalPages})">${totalPages}</button>
      `;
    }

    // Next button
    if (currentPage < totalPages) {
      paginationHTML += `
        <button class="pagination-btn" onclick="changePage(${currentPage + 1})">
          next
        </button>
      `;
    }

    paginationDiv.innerHTML = paginationHTML;
  }

  // Make changePage function global for onclick handlers
  (window as any).changePage = (page: number) => {
    pageInput.value = page.toString();
    performSearch();
  };

  function handleBlockPreviewMouseOver(event: Event) {
    if (currentPreviewPopup) {
      currentPreviewPopup.remove();
    }

    const mouseEvent = event as MouseEvent;
    const target = mouseEvent.currentTarget as HTMLElement;
    const imageUrl = target.dataset.previewImageUrl;

    if (!imageUrl) return;

    currentPreviewPopup = document.createElement('div');
    currentPreviewPopup.className = 'block-image-preview-popup';

    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Preview';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    img.style.display = 'block';

    currentPreviewPopup.appendChild(img);
    document.body.appendChild(currentPreviewPopup);

    // Position the popup near the mouse
    const popupWidth = 200;
    const popupHeight = 150;
    let x = mouseEvent.pageX + 15;
    let y = mouseEvent.pageY + 15;

    if (x + popupWidth > window.innerWidth) {
      x = mouseEvent.pageX - popupWidth - 15;
    }
    if (y + popupHeight > window.innerHeight) {
      y = mouseEvent.pageY - popupHeight - 15;
    }

    currentPreviewPopup.style.left = `${x}px`;
    currentPreviewPopup.style.top = `${y}px`;
  }

  function handleBlockPreviewMouseOut() {
    if (currentPreviewPopup) {
      currentPreviewPopup.remove();
      currentPreviewPopup = null;
    }
  }

  function getVisibilityClasses(visibilityName?: string): string {
    const visibility = visibilityName?.toUpperCase();
    switch (visibility) {
      case 'PUBLIC':
        return 'visibility-public';
      case 'PRIVATE':
        return 'visibility-private';
      case 'CLOSED':
        return 'visibility-closed';
      default:
        return '';
    }
  }

  function getBlockTypeLabel(typeName: string): string {
    const labels: { [key: string]: string } = {
      'Text': 'Text',
      'Image': 'Image',
      'Link': 'Link',
      'Embed': 'Embed',
      'Attachment': 'File',
      'PendingBlock': 'Pending',
      'Channel': 'Channel'
    };
    return labels[typeName] || 'Block';
  }

  function createLightbox(): HTMLDivElement {
    const lightbox = document.createElement('div');
    lightbox.id = 'image-lightbox';
    lightbox.className = 'lightbox hidden';
    lightbox.innerHTML = `
      <div class="lightbox-backdrop"></div>
      <div class="lightbox-content">
        <img src="" alt="" class="lightbox-image" />
        <button class="lightbox-close" aria-label="Close">×</button>
      </div>
    `;

    // Close on backdrop click
    lightbox.querySelector('.lightbox-backdrop')?.addEventListener('click', () => {
      hideLightbox(lightbox);
    });

    // Close on image click
    lightbox.querySelector('.lightbox-image')?.addEventListener('click', () => {
      hideLightbox(lightbox);
    });

    // Close on button click
    lightbox.querySelector('.lightbox-close')?.addEventListener('click', () => {
      hideLightbox(lightbox);
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) {
        hideLightbox(lightbox);
      }
    });

    return lightbox;
  }

  function showLightbox(lightbox: HTMLDivElement, imageUrl: string) {
    const img = lightbox.querySelector('.lightbox-image') as HTMLImageElement;
    if (img) {
      img.src = imageUrl;
    }
    lightbox.classList.remove('hidden');
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function hideLightbox(lightbox: HTMLDivElement) {
    lightbox.classList.remove('active');
    lightbox.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // Make showLightbox available globally for onclick handlers
  (window as any).openLightbox = (imageUrl: string) => {
    showLightbox(lightbox, imageUrl);
  };
}
