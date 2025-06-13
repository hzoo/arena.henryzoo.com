import { getArenaSearchResults } from './arena-api';

// Arena Search Page functionality
document.addEventListener('DOMContentLoaded', () => {
  setupArenaSearch();
});

function setupArenaSearch() {
  const urlInput = document.getElementById('arena-url-input') as HTMLInputElement;
  const authTokenInput = document.getElementById('arena-auth-token-input') as HTMLInputElement;
  const perPageInput = document.getElementById('arena-per-page-input') as HTMLSelectElement;
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

  let currentPreviewPopup: HTMLDivElement | null = null;

  if (!urlInput || !searchBtn) return;

  // Load saved auth token from localStorage
  loadSavedTokens();
  // Update auth button appearance based on token state
  updateAuthButtonState();

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
    // No URL from path, set default URL and check cache for it
    urlInput.value = 'henryzoo.com'; // Default URL

    // Attempt to auto-search if cached results for the default URL exist
    const defaultPage = parseInt(pageInput.value) || 1;
    const defaultPerPage = parseInt(perPageInput.value) || 24;

    const cacheKey = `arena_search_cache_${urlInput.value}_${defaultPage}_${defaultPerPage}`;
    const cacheDuration = 60 * 1000 * 60 * 24 * 7; // 7 days

    try {
      const cachedItemJSON = localStorage.getItem(cacheKey);
      if (cachedItemJSON) {
        const { timestamp } = JSON.parse(cachedItemJSON);
        if (Date.now() - timestamp < cacheDuration) {
        } else {
          localStorage.removeItem(cacheKey); // Clean up stale cache
        }
        performSearch(cacheDuration);
      }
    } catch (e) {
      console.warn('Error checking cache for auto-search:', e);
    }
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

  authTokenPopup.addEventListener('click', (e) => {
    if (e.target === authTokenPopup) {
      authTokenPopup.classList.add('hidden');
    }
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

  function loadSavedTokens() {
    const savedAuthToken = localStorage.getItem('arena_auth_token');
    
    if (savedAuthToken) {
      authTokenInput.value = savedAuthToken;
    }
  }

  function updateAuthButtonState() {
    const hasAuthToken = authTokenInput.value.trim().length > 0;
    
    if (hasAuthToken) {
      authTokenBtn.textContent = '🔑 auth ✓';
      authTokenBtn.classList.add('text-green-600');
      authTokenBtn.classList.remove('text-stone-500');
    } else {
      authTokenBtn.textContent = '🔑 auth';
      authTokenBtn.classList.remove('text-green-600');
      authTokenBtn.classList.add('text-stone-500');
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        showError(`Rate limited! Add your auth token above to increase limits. Error: ${errorMessage}`);
        showTokenInstructions();
      } else {
        showError(`Error: ${errorMessage}`);
      }
    } finally {
      showLoading(false);
    }
  }

  function showLoading(show: boolean) {
    if (show) {
      loadingDiv.classList.remove('hidden');
      searchBtn.disabled = true;
      searchBtn.textContent = 'searching...';
      searchBtn.classList.add('opacity-50');
    } else {
      loadingDiv.classList.add('hidden');
      searchBtn.disabled = false;
      searchBtn.textContent = 'search';
      searchBtn.classList.remove('opacity-50');
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
    const groupedResults = groupResultsByUrl(searchResults.results);
    const totalGroups = Object.keys(groupedResults).length;
    
    summaryDiv.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-4 text-xs text-stone-600">
        <div class="flex items-center gap-4">
          <span class="font-medium text-stone-700">${searchResults.total.toLocaleString()} results</span>
          <span>showing ${startIndex}-${endIndex}</span>
          <span>page ${currentPage}</span>
          ${totalGroups !== searchResults.results.length ? `<span class="text-orange-600">• ${totalGroups} unique sources</span>` : ''}
        </div>
        <code class="bg-stone-100 px-2 py-1 rounded text-xs break-all font-mono">${url}</code>
      </div>
    `;

    // Show pagination
    showPagination(searchResults.total, currentPage, perPage);

    // Clear previous results
    searchResultsDiv.innerHTML = '';

    if (searchResults.results.length === 0) {
      searchResultsDiv.innerHTML = `
        <div class="col-span-full p-8 bg-white/60 rounded-2xl border border-stone-200/50 text-center text-stone-500">
          <div class="text-2xl mb-2">¯\\_(ツ)_/¯</div>
          <p class="text-sm">no results found</p>
        </div>
      `;
    } else {
      // Render grouped results
      Object.entries(groupedResults).forEach(([sourceUrlKey, results]) => {
        const groupDiv = document.createElement('div');
        // Ensure a unique ID for each group if needed for direct manipulation later, though not strictly necessary for current logic
        // groupDiv.id = `group-${sourceUrlKey.replace(/[^a-zA-Z0-9]/g, '-')}`; 
        groupDiv.className = 'result-group p-4 bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm border border-stone-200/50 hover:bg-white/90 transition-all';
        
        // Pass results directly, connections are now part of each result item
        const content = renderGroupedResult(sourceUrlKey, results);
        groupDiv.innerHTML = content;
        searchResultsDiv.appendChild(groupDiv);
      });

      // Add event listeners for image previews
      const blockLinksWithPreview = searchResultsDiv.querySelectorAll('.block-link-with-preview');
      blockLinksWithPreview.forEach(link => {
        link.addEventListener('mouseover', handleBlockPreviewMouseOver);
        link.addEventListener('mouseout', handleBlockPreviewMouseOut);
      });
    }

    resultsDiv.classList.remove('hidden');
    resultsDiv.classList.add('fade-in');
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

  function groupResultsByUrl(results: any[]): { [key: string]: any[] } {
    const groups: { [key: string]: any[] } = {};
    
    results.forEach(result => {
      let key: string;
      
      if (result.__typename === 'Channel') {
        // Channels are their own group
        key = `channel:${result.id}`;
      } else {
        // Group blocks by their normalized source URL
        const rawUrl = result.source_url || result.source?.url;
        key = normalizeUrl(rawUrl) || `${result.__typename}:${result.id}`; // Fallback if no URL
      }
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(result);
    });
    
    return groups;
  }

  function renderGroupedResult(sourceKey: string, results: any[], connectionsData?: Map<string, any>): string {
    const firstResult = results[0];
    const isChannel = firstResult.__typename === 'Channel';
    const isMultipleBlocksWithSameSource = results.length > 1 && !isChannel;
    const blockHref = firstResult.href || ''; // Get block href for connections

    if (isChannel) {
      // Render channel normally (no direct connections to display in this view)
      return `
        <div class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="px-3 py-1 bg-blue-100 text-blue-700 rounded-xl text-sm font-medium">channel</span>
            ${firstResult.visibility_name ? `<span class="px-2 py-1 rounded-lg text-xs ${getVisibilityClasses(firstResult.visibility_name)}">${firstResult.visibility_name.toLowerCase()}</span>` : ''}
          </div>
          
          <h3 class="font-bold text-stone-800 leading-tight text-lg">
            <a href="https://are.na/${firstResult.slug || `channel/${firstResult.id}`}" target="_blank" 
               class="text-stone-800 hover:text-orange-600 transition-colors">
              ${firstResult.title || 'untitled channel'}
            </a>
          </h3>
          
          ${firstResult.owner ? `
            <p class="text-sm text-stone-500">
              by ${firstResult.owner.name || 'unknown'}
            </p>
          ` : ''}
          
          <div class="flex items-center justify-between text-sm text-stone-400">
            ${firstResult.counts?.contents ? `<span>${firstResult.counts.contents} item${firstResult.counts.contents !== 1 ? 's' : ''}</span>` : '<span></span>'}
            <span>#${firstResult.id}</span>
          </div>
        </div>
      `;
    } else {
      // Render a single block or a group of blocks with the same source URL
      const displayTitle = firstResult.title || (firstResult.source_url ? new URL(firstResult.source_url).hostname : 'Untitled Block');
      const blockType = firstResult.__typename || 'Block';
      const typeIcon = getBlockTypeIcon(blockType);
      const typeColor = getBlockTypeColor(blockType);

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

      const previewImageUrl = firstResult.image_url; // Corrected to use image_url

      return `
        <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 ease-in-out relative group">
          <div class="flex items-start gap-4">
            <div class="flex-shrink-0 w-12 h-12 ${typeColor} rounded-lg flex items-center justify-center text-2xl">
              ${typeIcon}
            </div>
            <div class="flex-1 min-w-0">
              <a href="${firstResult.source_url}" target="_blank" 
                 class="font-semibold text-stone-800 hover:text-orange-600 transition-colors line-clamp-2 leading-tight group-hover:underline ${previewImageUrl ? 'block-link-with-preview' : ''}"
                 ${previewImageUrl ? `data-preview-image-url="${previewImageUrl}"` : ''}
                 title="${firstResult.title || sourceKey}">
                ${displayTitle}
              </a>
              <div class="text-xs text-stone-500 mt-1">
                <a href="${firstResult.source_url}" target="_blank" class="hover:text-orange-500 truncate">
                  ${firstResult.source_url ? firstResult.source_url.replace(/^https?:\/\//, '').replace(/^www\./, '') : 'No source URL'}
                </a>
              </div>
            </div>
          </div>
          
          ${allGroupConnections && allGroupConnections.length > 0 ? `
            ${renderConnectionsForGroup(allGroupConnections, blockHref)} 
          ` : `
            <div class="mt-3 p-4 bg-stone-50 rounded-xl">
              <p class="text-xs text-stone-400 italic">no connections found for this item.</p>
            </div>
          `}
          
          <div class="flex items-center justify-between pt-2 border-t border-stone-100 mt-3">
            <div class="flex-1 mr-4 overflow-x-auto no-scrollbar">
              <div class="flex gap-2 flex-nowrap py-1">
                ${results.map(result => {
                  if (result.href) {
                    const blockId = result.href.split('/').pop();
                    const blockPreviewImageUrl = result.image_url; // Corrected to use image_url
                    return `
                      <a href="https://are.na${result.href}" target="_blank"
                         class="text-xs text-stone-400 hover:text-orange-600 transition-colors font-mono whitespace-nowrap flex-shrink-0 ${blockPreviewImageUrl ? 'block-link-with-preview' : ''}"
                         ${blockPreviewImageUrl ? `data-preview-image-url="${blockPreviewImageUrl}"` : ''}>
                        #${blockId}
                      </a>`;
                  }
                  return ''; // Skip if not a suitable block type or no href
                }).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
    }
  }

  function renderConnectionsForGroup(connections: any[], blockHref?: string): string {
    // The connections passed should be all available ones from the initial query.
    const connectionsToRender = connections;

    if (!connectionsToRender || connectionsToRender.length === 0) {
      return ''; // Return empty string, caller handles the "no connections" message.
    }

    // Deduplicate connections by user + channel slug combination to show unique "saves"
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
      <div id="connections-for-${blockIdSuffix}" class="bg-stone-50 rounded-xl p-4 mt-3 space-y-3">
        <h4 class="text-stone-700 mb-2">
          Connections <span class="text-xs text-stone-400">(${uniqueConnections.length})</span>
        </h4>
        <div class="space-y-2 max-h-60 overflow-y-auto">
          ${uniqueConnections.map(conn => `
            <div class="flex items-start justify-between text-sm gap-2">
              <div class="flex-1 min-w-0">
                <a href="https://are.na/channel/${conn.channel.slug}" target="_blank" 
                   class="font-medium text-stone-700 ${getVisibilityClasses(conn.channel.visibility_name)} transition-colors">
                  ${conn.channel.title || 'untitled'}
                </a>
                <div class="text-xs text-stone-500">
                  <a href="https://are.na/${conn.channel.user?.slug}" target="_blank" class="hover:text-orange-500">${conn.channel.user?.name}</a>
                  • ${new Date(conn.channel.added_to_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </div>
              </div>
            </div>
          `).join('')}
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
          ← prev
        </button>
      `;
    }
    
    // Page numbers (show current page and a few around it)
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    if (startPage > 1) {
      paginationHTML += `
        <button class="pagination-btn" onclick="changePage(1)">1</button>
      `;
      if (startPage > 2) {
        paginationHTML += '<span class="px-2 text-stone-400 text-xs">⋯</span>';
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
        paginationHTML += '<span class="px-2 text-stone-400 text-xs">⋯</span>';
      }
      paginationHTML += `
        <button class="pagination-btn" onclick="changePage(${totalPages})">${totalPages}</button>
      `;
    }
    
    // Next button
    if (currentPage < totalPages) {
      paginationHTML += `
        <button class="pagination-btn" onclick="changePage(${currentPage + 1})">
          next →
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

    // Position the popup near the mouse, adjusting for viewport edges
    const popupWidth = 200; // Approximate width, adjust as needed via CSS
    const popupHeight = 150; // Approximate height
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
        return 'bg-green-100 text-green-700 hover:bg-green-200';
      case 'PRIVATE':
        return 'bg-red-100 text-red-700 hover:bg-red-200';
      case 'CLOSED':
        return 'text-stone-700 hover:bg-stone-200';
      default:
        return 'bg-stone-100 text-stone-600'; // Default neutral
    }
  }

  function getBlockTypeIcon(typeName: string): string {
    const icons: { [key: string]: string } = {
      'Text': '📝',
      'Image': '🖼️',
      'Link': '🔗',
      'Embed': '📺',
      'Attachment': '📎',
      'PendingBlock': '⏳',
      'Channel': '📁'
    };
    return icons[typeName] || '📄';
  }

  function getBlockTypeColor(typeName: string): string {
    const colors: { [key: string]: string } = {
      'Text': 'bg-green-100 text-green-700',
      'Image': 'bg-purple-100 text-purple-700',
      'Link': 'bg-blue-100 text-blue-700',
      'Embed': 'bg-orange-100 text-orange-700',
      'Attachment': 'bg-gray-100 text-gray-700',
      'PendingBlock': 'bg-yellow-100 text-yellow-700',
      'Channel': 'bg-blue-100 text-blue-700'
    };
    return colors[typeName] || 'bg-stone-100 text-stone-700';
  }
}
